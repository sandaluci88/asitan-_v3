import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Tool } from '../../llm/openai.js';
import { config } from '../../config.js';
import { saveLead, getLeadById, searchLeads, saveOutreach } from '../../leads/db.js';
import { scoreLead } from '../../leads/scoring.js';
import { advanceLead } from '../../leads/pipeline.js';

// ─── Website Pitch Tools ────────────────────────────────────────────────────
// Bridge between the Beautiful Websites Kit pipeline and Kaya's lead DB.
// Reads pipeline artifacts (scrape_results, qualify_results, build-log),
// imports qualified leads, and sends website pitch emails.

type ToolHandler = (input: Record<string, unknown>) => string | Promise<string>;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Slugify a business name: lowercase, replace non-alphanumeric with hyphens, trim */
function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Resolve a path relative to the pipeline directory */
function pipelinePath(...segments: string[]): string {
    return join(config.pipelineDir, ...segments);
}

/** Safely read and parse a JSON file */
function readJsonFile(filePath: string): { data: any; error?: string } {
    if (!existsSync(filePath)) {
        return { data: null, error: `File not found: ${filePath}` };
    }
    try {
        const raw = readFileSync(filePath, 'utf-8');
        return { data: JSON.parse(raw) };
    } catch (err) {
        return { data: null, error: `Failed to parse ${filePath}: ${err instanceof Error ? err.message : String(err)}` };
    }
}

/** Parse build-log.md markdown table into structured objects */
function parseBuildLog(markdown: string): Array<{
    business: string;
    slug: string;
    palette: string;
    font: string;
    layout: string;
    vercelUrl: string;
    date: string;
}> {
    const lines = markdown.split('\n').filter((l) => l.startsWith('|'));
    // Skip header and separator rows
    const dataLines = lines.slice(2);

    return dataLines.map((line) => {
        const cells = line
            .split('|')
            .map((c) => c.trim())
            .filter(Boolean);
        return {
            business: cells[0] || '',
            slug: cells[1] || '',
            palette: cells[2] || '',
            font: cells[3] || '',
            layout: cells[4] || '',
            vercelUrl: cells[5] || '',
            date: cells[6] || '',
        };
    });
}

// ─── Tool Handlers ──────────────────────────────────────────────────────────

export const toolHandlers: Record<string, ToolHandler> = {

    // ── Read pipeline scrape results ─────────────────────────────────────────
    read_pipeline_leads: () => {
        const filePath = pipelinePath('scrape_results.json');
        const { data, error } = readJsonFile(filePath);
        if (error) return JSON.stringify({ error });

        const leads = Array.isArray(data) ? data : [];
        const mapped = leads.map((l: any) => ({
            name: l.name || l.title || '',
            email: l.email || l.emails?.[0] || null,
            website: l.website || l.url || null,
            phone: l.phone || l.phones?.[0] || null,
            address: l.address || l.full_address || null,
            rating: l.rating || l.totalScore || null,
        }));

        return JSON.stringify({ count: mapped.length, leads: mapped });
    },

    // ── Read qualification results ───────────────────────────────────────────
    read_qualifications: () => {
        const filePath = pipelinePath('qualify_results.json');
        const { data, error } = readJsonFile(filePath);
        if (error) return JSON.stringify({ error });

        const results = Array.isArray(data) ? data : [];
        const mapped = results.map((r: any) => ({
            name: r.name || r.business || '',
            website: r.website || r.url || null,
            qualify: r.qualify || r.result || r.decision || null,
            reason: r.reason || r.notes || null,
            screenshotPath: r.screenshotPath || r.screenshot || null,
        }));

        return JSON.stringify({ count: mapped.length, results: mapped });
    },

    // ── Read build log (deployed sites) ──────────────────────────────────────
    read_build_log: () => {
        const filePath = pipelinePath('sites', 'build-log.md');
        if (!existsSync(filePath)) {
            return JSON.stringify({ error: `Build log not found: ${filePath}` });
        }

        try {
            const markdown = readFileSync(filePath, 'utf-8');
            const entries = parseBuildLog(markdown);
            return JSON.stringify({ count: entries.length, entries });
        } catch (err) {
            return JSON.stringify({ error: `Failed to read build log: ${err instanceof Error ? err.message : String(err)}` });
        }
    },

    // ── Import qualified pipeline leads into DB ──────────────────────────────
    import_pipeline_leads: () => {
        // Read scrape results
        const scrapeFile = pipelinePath('scrape_results.json');
        const { data: scrapeData, error: scrapeError } = readJsonFile(scrapeFile);
        if (scrapeError) return JSON.stringify({ error: `Scrape data: ${scrapeError}` });

        // Read qualify results
        const qualifyFile = pipelinePath('qualify_results.json');
        const { data: qualifyData, error: qualifyError } = readJsonFile(qualifyFile);
        if (qualifyError) return JSON.stringify({ error: `Qualify data: ${qualifyError}` });

        const scrapeLeads: any[] = Array.isArray(scrapeData) ? scrapeData : [];
        const qualifyResults: any[] = Array.isArray(qualifyData) ? qualifyData : [];

        // Build a set of qualified business names/websites for fast lookup
        const qualifiedSet = new Set<string>();
        for (const q of qualifyResults) {
            const decision = (q.qualify || q.result || q.decision || '').toUpperCase();
            if (decision === 'YES') {
                // Key by website (normalized) or name
                if (q.website || q.url) qualifiedSet.add((q.website || q.url).toLowerCase().replace(/\/$/, ''));
                if (q.name || q.business) qualifiedSet.add((q.name || q.business).toLowerCase());
            }
        }

        let imported = 0;
        let skipped = 0;

        for (const raw of scrapeLeads) {
            const email = raw.email || raw.emails?.[0] || null;
            const website = raw.website || raw.url || null;
            const name = raw.name || raw.title || '';

            // Must have email + website
            if (!email || !website) { skipped++; continue; }

            // Must be qualified YES
            const normalizedSite = website.toLowerCase().replace(/\/$/, '');
            const normalizedName = name.toLowerCase();
            if (!qualifiedSet.has(normalizedSite) && !qualifiedSet.has(normalizedName)) {
                skipped++;
                continue;
            }

            // Dedup check: search by email
            const existing = searchLeads(email, {});
            const emailMatch = existing.find((l) => l.email?.toLowerCase() === email.toLowerCase());
            if (emailMatch) {
                skipped++;
                continue;
            }

            // Save to DB
            const lead = saveLead({
                full_name: name,
                company: raw.company || name,
                title: raw.title_role || null,
                email,
                phone: raw.phone || raw.phones?.[0] || null,
                telegram_id: null,
                website,
                industry: raw.industry || raw.category || null,
                country: raw.country || 'TR',
                source: 'web_scrape',
                status: 'qualified',
                persona_tag: null,
                tags: 'pipeline',
                enrichment_data: JSON.stringify({
                    qualify_result: 'YES',
                    rating: raw.rating || null,
                    address: raw.address || raw.full_address || null,
                    imported_from: 'beautiful-websites-pipeline',
                }),
                notes: `Imported from BWK pipeline. Rating: ${raw.rating || 'N/A'}`,
            });

            // Score the imported lead
            scoreLead(lead.id);
            imported++;
        }

        return JSON.stringify({ imported, skipped, total: scrapeLeads.length });
    },

    // ── Send website pitch email ─────────────────────────────────────────────
    send_website_pitch: async (input) => {
        const leadId = Number(input.lead_id);
        if (!leadId) return JSON.stringify({ error: 'lead_id is required' });

        const lead = getLeadById(leadId);
        if (!lead) return JSON.stringify({ error: `Lead ${leadId} not found` });
        if (!lead.email) return JSON.stringify({ error: `Lead ${leadId} has no email address` });

        // Resolve vercel URL: provided directly or looked up from build-log
        let vercelUrl = input.vercel_url ? String(input.vercel_url) : null;

        if (!vercelUrl) {
            // Try to match by slugifying the lead's company/name against build-log
            const buildLogPath = pipelinePath('sites', 'build-log.md');
            if (existsSync(buildLogPath)) {
                const markdown = readFileSync(buildLogPath, 'utf-8');
                const entries = parseBuildLog(markdown);
                const leadSlug = slugify(lead.company || lead.full_name);

                const match = entries.find(
                    (e) => e.slug === leadSlug || slugify(e.business) === leadSlug,
                );

                if (match && match.vercelUrl) {
                    vercelUrl = match.vercelUrl;
                }
            }
        }

        if (!vercelUrl) {
            return JSON.stringify({
                error: 'Could not find a deployed Vercel URL for this lead. Provide vercel_url explicitly or ensure the site is in build-log.md.',
                lead_id: leadId,
            });
        }

        // Build pitch email
        const firstName = lead.full_name?.split(' ')[0] || 'there';
        const company = lead.company || lead.full_name;
        const subject = `I redesigned ${company}'s website — take a look`;
        const body = `Hi ${firstName},

I came across ${lead.website || 'your website'} and thought ${company} deserved a more modern look. So I went ahead and built a free redesign:

${vercelUrl}

No strings attached. If you like it, we can talk about putting it live. If not, no worries at all.

Cheers`;

        // Send via Instantly.ai
        let result = { success: false, messageId: null as string | null, error: null as string | null };
        try {
            const { sendViaInstantly } = await import('../../outreach/instantly.js');
            result = await sendViaInstantly({
                to: lead.email,
                subject,
                body,
                leadName: lead.full_name ?? undefined,
                company: lead.company ?? undefined,
            });
        } catch (err) {
            result.error = err instanceof Error ? err.message : 'Instantly send failed';
        }

        // Log outreach in DB
        try {
            saveOutreach({
                lead_id: leadId,
                channel: 'email',
                message_type: 'website_pitch',
                template_id: null,
                message_content: body,
                personalization_data: JSON.stringify({
                    subject,
                    vercel_url: vercelUrl,
                    instantly_id: result.messageId,
                    error: result.error,
                }),
                status: result.success ? 'sent' : 'failed',
            });
        } catch { /* non-critical */ }

        // Advance pipeline if appropriate
        if (result.success && lead.status === 'qualified') {
            advanceLead(leadId, 'contacted');
        }

        return JSON.stringify({
            status: result.success ? 'sent' : 'failed',
            lead_id: leadId,
            lead_status: getLeadById(leadId)?.status ?? lead.status,
            to: lead.email,
            subject,
            vercel_url: vercelUrl,
            instantly_id: result.messageId,
            error: result.error,
        });
    },

    // ── Generate sales report for a lead or all leads ────────────────────────
    generate_sales_report: (input) => {
        const leadId = input.lead_id ? Number(input.lead_id) : null;

        // Read pipeline data
        const scrapeFile = pipelinePath('scrape_results.json');
        const qualifyFile = pipelinePath('qualify_results.json');
        const buildLogFile = pipelinePath('sites', 'build-log.md');

        const { data: scrapeData } = readJsonFile(scrapeFile);
        const { data: qualifyData } = readJsonFile(qualifyFile);

        const scrapeLeads: any[] = Array.isArray(scrapeData) ? scrapeData : [];
        const qualifyResults: any[] = Array.isArray(qualifyData) ? qualifyData : [];

        // Build qualify map by name
        const qualifyMap = new Map<string, any>();
        for (const q of qualifyResults) {
            const key = (q.name || q.business || '').toLowerCase();
            if (key) qualifyMap.set(key, q);
        }

        // Build deploy map
        let deployMap = new Map<string, string>();
        if (existsSync(buildLogFile)) {
            const md = readFileSync(buildLogFile, 'utf-8');
            const entries = parseBuildLog(md);
            for (const e of entries) {
                if (e.slug && e.vercelUrl) deployMap.set(e.slug, e.vercelUrl);
            }
        }

        // Filter to specific lead or all
        const targets = leadId
            ? scrapeLeads.filter((_l, i) => i + 1 === leadId)
            : scrapeLeads.filter(l => l.email);

        const reports = targets.map((lead) => {
            const name = lead.name || lead.title || 'Unknown';
            const nameKey = name.toLowerCase();
            const slug = slugify(name);
            const qualify = qualifyMap.get(nameKey);
            const vercelUrl = deployMap.get(slug) || null;
            const rating = lead.rating || lead.totalScore || null;
            const reviewCount = lead.reviewCount || lead.reviews_count || 0;
            const email = lead.email || null;
            const website = lead.website || null;
            const category = lead.category || '';

            // ── Site problems (from qualify reason)
            const siteProblems = qualify?.reason || 'Site not evaluated yet';
            const qualifyResult = qualify?.qualify || 'PENDING';

            // ── Why they would buy
            const whyBuy: string[] = [];
            if (qualifyResult === 'YES') whyBuy.push('Current website is outdated — they know it needs a refresh');
            if (reviewCount > 500) whyBuy.push(`High-volume business (${reviewCount} reviews) — invests in reputation`);
            else if (reviewCount > 100) whyBuy.push(`Established business (${reviewCount} reviews) — cares about image`);
            if (rating && rating >= 4.5) whyBuy.push(`High rating (${rating}) — takes pride in quality, website should match`);
            if (website && (website.includes('wix') || website.includes('wordpress') || website.includes('squarespace')))
                whyBuy.push('Using a website builder — likely frustrated with limitations');
            whyBuy.push('Free redesign removes all risk — nothing to lose by saying yes');
            if (vercelUrl) whyBuy.push('Live demo already built — proof of value is immediate');

            // ── Pricing strategy
            let suggestedTier: string;
            let priceRange: string;
            let monthlyRange: string;

            if (reviewCount > 1000) {
                suggestedTier = 'Premium';
                priceRange = '$2,000 - $3,500';
                monthlyRange = '$300 - $500/mo';
            } else if (reviewCount > 300) {
                suggestedTier = 'Standard';
                priceRange = '$1,000 - $2,000';
                monthlyRange = '$200 - $350/mo';
            } else {
                suggestedTier = 'Starter';
                priceRange = '$500 - $1,000';
                monthlyRange = '$100 - $200/mo';
            }

            // ── Confidence score
            let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
            let confidenceReasons: string[] = [];

            let score = 0;
            if (qualifyResult === 'YES') { score += 30; confidenceReasons.push('Site needs redesign'); }
            if (email) { score += 15; confidenceReasons.push('Email available'); }
            if (reviewCount > 200) { score += 20; confidenceReasons.push('Active business'); }
            if (rating && rating >= 4.5) { score += 15; confidenceReasons.push('High rating'); }
            if (vercelUrl) { score += 20; confidenceReasons.push('Demo site ready'); }

            if (score >= 70) confidence = 'HIGH';
            else if (score >= 45) confidence = 'MEDIUM';
            else confidence = 'LOW';

            return {
                name,
                email,
                website,
                category,
                rating,
                reviewCount,
                qualifyResult,
                siteProblems,
                whyBuy,
                pricing: {
                    tier: suggestedTier,
                    oneTime: priceRange,
                    monthly: monthlyRange,
                },
                confidence,
                confidenceScore: score,
                confidenceReasons,
                vercelUrl,
                slug,
            };
        });

        return JSON.stringify({ count: reports.length, reports });
    },

};

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const toolDefinitions: Tool[] = [
    {
        name: 'read_pipeline_leads',
        description: 'Read scrape_results.json from the Beautiful Websites Kit pipeline. Returns an array of leads with name, email, website, phone, address, and rating.',
        input_schema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'read_qualifications',
        description: 'Read qualify_results.json from the BWK pipeline. Returns an array with name, website, qualify (YES/NO), reason, and screenshotPath for each site evaluated.',
        input_schema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'read_build_log',
        description: 'Read and parse sites/build-log.md. Returns an array of deployed sites with business name, slug, palette, font, layout, Vercel URL, and date.',
        input_schema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'import_pipeline_leads',
        description: 'Import qualified leads from the BWK pipeline into the leads database. Reads scrape_results.json and qualify_results.json, imports leads that have email + website and qualified YES (with email dedup), then scores each imported lead.',
        input_schema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'generate_sales_report',
        description: 'Generate detailed sales reports for leads. For each lead: site problems, why they would buy, suggested pricing tier ($500-$3500), monthly maintenance range, confidence score (HIGH/MEDIUM/LOW), and whether a demo site is ready. Pass lead_id for a single lead or omit for all leads with email.',
        input_schema: {
            type: 'object',
            properties: {
                lead_id: { type: 'number', description: 'Specific lead ID (by index, 1-based). Omit for all leads.' },
            },
        },
    },
    {
        name: 'send_website_pitch',
        description: 'Send a website pitch email to a lead with their redesigned site URL. Auto-looks up the Vercel URL from build-log.md if not provided. Sends via Instantly.ai and logs outreach in DB.',
        input_schema: {
            type: 'object',
            properties: {
                lead_id: { type: 'number', description: 'Lead ID to pitch' },
                vercel_url: { type: 'string', description: 'Deployed Vercel URL for the redesigned site. If omitted, auto-matched from build-log.md by slugifying the lead name.' },
            },
            required: ['lead_id'],
        },
    },
];
