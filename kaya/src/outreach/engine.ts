// ─── Outreach Engine ─────────────────────────────────────────────────────────
// Central orchestrator for automated outreach campaigns.
// Selects templates, sends via Instantly/Telegram, and logs everything.
// Standalone Kaya SDR — no fleet, no Resend.

import type { Bot } from 'grammy';
import { config } from '../config.js';
import {
    getTemplates,
    interpolateTemplate,
    pickRandomTemplate,
    type OutreachTemplate,
    type TemplateVars,
} from './templates.js';
import { sendSingleEmail } from './instantly.js';
import { sendTelegramDM } from './telegram_dm.js';
import type { Lead } from '../leads/types.js';
import { getLeadsReadyForOutreach, getLeadsNeedingFollowUp } from '../leads/pipeline.js';
import { saveOutreach as dbSaveOutreach, getOutreachForLead } from '../leads/db.js';

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Helpers ────────────────────────────────────────────────────────────────

function detectLanguage(lead: Lead): 'tr' | 'en' {
    return lead.country === 'TR' ? 'tr' : 'en';
}

function extractPainPoint(lead: Lead): string {
    try {
        const data = JSON.parse(lead.enrichment_data);
        return data.pain_points?.[0] ?? '';
    } catch { return ''; }
}

/**
 * Slugify a business name: lowercase, hyphenated, ASCII-safe.
 * "Zen Nail Bar" -> "zen-nail-bar"
 */
function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function getPipelineDir(): string {
    return config.pipelineDir;
}

// ─── Approval Mode ───────────────────────────────────────────────────────────

function isApprovalMode(): boolean {
    return config.magnetApprovalMode;
}

function getApprovalChatId(): string {
    return config.allowedUserIds.split(',')[0]?.trim() ?? '';
}

/**
 * Send outreach draft for approval via Telegram.
 */
async function requestApproval(
    bot: Bot,
    lead: Lead,
    channel: string,
    subject: string,
    body: string,
): Promise<void> {
    const chatId = getApprovalChatId();
    if (!chatId) {
        console.warn('  [Outreach] No approval chat ID configured');
        return;
    }

    const preview = [
        `*Outreach Approval*`,
        ``,
        `*Lead:* ${lead.full_name} (${lead.company ?? 'N/A'})`,
        `*Channel:* ${channel}`,
        `*To:* ${channel === 'email' ? lead.email : lead.telegram_id}`,
        `*Subject:* ${subject}`,
        ``,
        `---`,
        body.substring(0, 500),
        `---`,
        ``,
        `Reply /approve\\_outreach\\_${lead.id} or /reject\\_outreach\\_${lead.id}`,
    ].join('\n');

    try {
        await bot.api.sendMessage(parseInt(chatId, 10), preview, { parse_mode: 'Markdown' });
    } catch (err: any) {
        console.error(`  [Outreach] Failed to send approval request: ${err.message}`);
    }
}

// ─── Template Selection ──────────────────────────────────────────────────────

function selectTemplate(lead: Lead, category: OutreachTemplate['category']): OutreachTemplate {
    const language = detectLanguage(lead);
    const candidates = getTemplates(category, language);
    if (candidates.length === 0) {
        const fallback = getTemplates(category);
        return fallback[Math.floor(Math.random() * fallback.length)];
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function getFollowUpTemplateId(outreachCount: number, language: string): string {
    const lang = language === 'en' ? 'en' : 'tr';
    if (outreachCount === 1) return `follow_up_1_${lang}`;
    if (outreachCount === 2) return `follow_up_2_${lang}`;
    return `follow_up_3_${lang}`;
}

// ─── Save Helper ────────────────────────────────────────────────────────────

function saveOutreachRecord(
    leadId: number,
    channel: 'email' | 'telegram',
    messageType: string,
    templateId: string,
    subject: string,
    body: string,
    status: string,
): void {
    dbSaveOutreach({
        lead_id: leadId,
        channel,
        message_type: messageType,
        template_id: templateId,
        message_content: subject ? `Subject: ${subject}\n\n${body}` : body,
        personalization_data: '{}',
        status,
    });
}

// ─── Core Engine: Outreach Cycle ────────────────────────────────────────────

/**
 * Run the main outreach cycle: find qualified leads, personalize, and send.
 */
export async function runOutreachCycle(bot: Bot): Promise<number> {
    console.log('  [Outreach] Starting outreach cycle...');
    const leads = getLeadsReadyForOutreach();

    if (leads.length === 0) {
        console.log('  [Outreach] No leads ready for outreach');
        return 0;
    }

    let sentCount = 0;

    for (const lead of leads) {
        try {
            // 1. Select template
            const template = selectTemplate(lead, 'cold_intro');

            // 2. Build template variables
            const vars: TemplateVars = {
                name: lead.full_name,
                company: lead.company ?? '',
                title: lead.title ?? '',
                industry: lead.industry ?? '',
                pain_point: extractPainPoint(lead),
                personalization_hook: '',
            };

            // 3. Interpolate template
            const { subject, body } = interpolateTemplate(template, vars);

            // 4. Determine channel
            const channel: 'email' | 'telegram' = lead.email ? 'email' : 'telegram';

            // 5. Approval mode check
            if (isApprovalMode()) {
                await requestApproval(bot, lead, channel, subject, body);
                saveOutreachRecord(lead.id, channel, 'cold_intro', template.id, subject, body, 'pending_approval');
                sentCount++;
                continue;
            }

            // 6. Send
            let success = false;
            if (channel === 'email' && lead.email) {
                const result = await sendSingleEmail(lead.email, subject, body);
                success = result.success;
            } else if (channel === 'telegram' && lead.telegram_id) {
                const result = await sendTelegramDM(bot, lead.telegram_id, body);
                success = result.success;
                if (result.rateLimited) break;
            }

            // 7. Save record
            saveOutreachRecord(lead.id, channel, 'cold_intro', template.id, subject, body, success ? 'sent' : 'failed');

            if (success) sentCount++;
        } catch (err: any) {
            console.error(`  [Outreach] Error processing lead ${lead.id}: ${err.message}`);
        }
    }

    console.log(`  [Outreach] Cycle complete. Sent: ${sentCount}/${leads.length}`);
    return sentCount;
}

// ─── Core Engine: Follow-Up Cycle ───────────────────────────────────────────

/**
 * Run the follow-up cycle: find unanswered leads and send follow-ups.
 */
export async function runFollowUpCycle(bot: Bot): Promise<number> {
    console.log('  [Outreach] Starting follow-up cycle...');
    const leads = getLeadsNeedingFollowUp();

    if (leads.length === 0) {
        console.log('  [Outreach] No leads need follow-up');
        return 0;
    }

    let sentCount = 0;

    for (const lead of leads) {
        try {
            const language = detectLanguage(lead);
            const outreachHistory = getOutreachForLead(lead.id);
            const outreachCount = outreachHistory.length;

            // 1. Determine follow-up stage and get specific template
            const templateId = getFollowUpTemplateId(outreachCount, language);
            const templates = getTemplates('follow_up', language);
            const template = templates.find(t => t.id === templateId) ?? selectTemplate(lead, 'follow_up');

            // 2. Build variables
            const vars: TemplateVars = {
                name: lead.full_name,
                company: lead.company ?? '',
                title: lead.title ?? '',
                industry: lead.industry ?? '',
                pain_point: extractPainPoint(lead),
                personalization_hook: '',
            };

            // 3. Interpolate
            const { subject, body } = interpolateTemplate(template, vars);

            // 4. Channel selection
            const channel: 'email' | 'telegram' = lead.email ? 'email' : 'telegram';

            // 5. Approval mode
            if (isApprovalMode()) {
                await requestApproval(bot, lead, channel, subject, body);
                saveOutreachRecord(lead.id, channel, 'follow_up', template.id, subject, body, 'pending_approval');
                sentCount++;
                continue;
            }

            // 6. Send
            let success = false;
            if (channel === 'email' && lead.email) {
                const result = await sendSingleEmail(lead.email, subject, body);
                success = result.success;
            } else if (channel === 'telegram' && lead.telegram_id) {
                const result = await sendTelegramDM(bot, lead.telegram_id, body);
                success = result.success;
                if (result.rateLimited) break;
            }

            // 7. Save
            saveOutreachRecord(lead.id, channel, 'follow_up', template.id, subject, body, success ? 'sent' : 'failed');

            if (success) sentCount++;
        } catch (err: any) {
            console.error(`  [Outreach] Error following up lead ${lead.id}: ${err.message}`);
        }
    }

    console.log(`  [Outreach] Follow-up cycle complete. Sent: ${sentCount}/${leads.length}`);
    return sentCount;
}

// ─── Core Engine: Website Pitch Cycle ───────────────────────────────────────

interface PitchResult {
    pitched: number;
    skipped: number;
    errors: number;
}

interface ScrapeResult {
    name?: string;
    title?: string;
    email?: string;
    website?: string;
    phone?: string;
    [key: string]: unknown;
}

interface BuildLogEntry {
    slug: string;
    vercelUrl: string;
}

/**
 * Parse build-log.md to extract slug -> Vercel URL mappings.
 * Expected format: table rows like | slug | ... | vercel-url |
 */
function parseBuildLog(pipelineDir: string): BuildLogEntry[] {
    const buildLogPath = join(pipelineDir, 'sites', 'build-log.md');
    if (!existsSync(buildLogPath)) {
        console.log(`  [Outreach] No build-log.md found at ${buildLogPath}`);
        return [];
    }

    const content = readFileSync(buildLogPath, 'utf-8');
    const entries: BuildLogEntry[] = [];

    for (const line of content.split('\n')) {
        // Skip header/separator rows
        if (!line.startsWith('|') || line.includes('---') || line.toLowerCase().includes('slug')) continue;

        const cells = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length < 2) continue;

        const slug = cells[0];
        // Find the cell that looks like a Vercel URL
        const urlCell = cells.find(c => c.includes('vercel.app') || c.includes('https://'));
        if (slug && urlCell) {
            entries.push({ slug, vercelUrl: urlCell });
        }
    }

    return entries;
}

/**
 * Load scrape_results.json from the pipeline directory.
 */
function loadScrapeResults(pipelineDir: string): ScrapeResult[] {
    const filePath = join(pipelineDir, 'scrape_results.json');
    if (!existsSync(filePath)) {
        console.log(`  [Outreach] No scrape_results.json found at ${filePath}`);
        return [];
    }

    try {
        const raw = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
    } catch (err: any) {
        console.error(`  [Outreach] Failed to parse scrape_results.json: ${err.message}`);
        return [];
    }
}

/**
 * Run the website pitch cycle:
 * 1. Read scrape_results.json from PIPELINE_DIR
 * 2. Read sites/build-log.md from PIPELINE_DIR
 * 3. Match leads to Vercel URLs by slugifying business name
 * 4. For each matched lead with email, send a website_pitch outreach
 */
export async function runWebsitePitchCycle(bot: Bot): Promise<PitchResult> {
    console.log('  [Outreach] Starting website pitch cycle...');

    const pipelineDir = getPipelineDir();
    const result: PitchResult = { pitched: 0, skipped: 0, errors: 0 };

    // 1. Load scrape results
    const scrapeResults = loadScrapeResults(pipelineDir);
    if (scrapeResults.length === 0) {
        console.log('  [Outreach] No scrape results found. Nothing to pitch.');
        return result;
    }

    // 2. Load build log
    const buildLog = parseBuildLog(pipelineDir);
    if (buildLog.length === 0) {
        console.log('  [Outreach] No build log entries found. Nothing to pitch.');
        return result;
    }

    // 3. Build a slug -> vercelUrl map for quick lookup
    const slugToUrl = new Map<string, string>();
    for (const entry of buildLog) {
        slugToUrl.set(entry.slug, entry.vercelUrl);
    }

    console.log(`  [Outreach] Found ${scrapeResults.length} scraped leads, ${buildLog.length} built sites.`);

    // 4. Process each lead
    for (const scraped of scrapeResults) {
        const businessName = scraped.name ?? scraped.title ?? '';
        if (!businessName) {
            result.skipped++;
            continue;
        }

        const email = scraped.email;
        if (!email) {
            result.skipped++;
            continue;
        }

        const slug = slugify(businessName);
        const vercelUrl = slugToUrl.get(slug);
        if (!vercelUrl) {
            // No matching built site for this lead
            result.skipped++;
            continue;
        }

        try {
            // Check if already pitched — search by email in outreach_messages
            // We need to check the DB for existing outreach to this lead
            // Since scrape results might not have a DB lead ID, we search by company/name
            const alreadyPitched = await checkIfAlreadyPitched(email, businessName);
            if (alreadyPitched) {
                console.log(`  [Outreach] Already pitched: ${businessName} (${email}). Skipping.`);
                result.skipped++;
                continue;
            }

            // Detect language: if the pipeline dir has Turkish-looking data, default to TR
            const language: 'tr' | 'en' = detectLanguageFromScrape(scraped);

            // Pick a website_pitch template
            const template = pickRandomTemplate('website_pitch', language);
            if (!template) {
                console.error(`  [Outreach] No website_pitch template found for language: ${language}`);
                result.errors++;
                continue;
            }

            // Build vars
            const firstName = businessName.split(' ')[0] ?? businessName;
            const vars: TemplateVars = {
                name: firstName,
                company: businessName,
                vercel_url: vercelUrl,
                industry: '',
                title: '',
            };

            // Interpolate
            const { subject, body } = interpolateTemplate(template, vars);

            // Approval mode: send preview to Telegram
            if (isApprovalMode()) {
                const chatId = getApprovalChatId();
                if (chatId) {
                    const preview = [
                        `*Website Pitch Approval*`,
                        ``,
                        `*Business:* ${businessName}`,
                        `*Email:* ${email}`,
                        `*Vercel URL:* ${vercelUrl}`,
                        `*Subject:* ${subject}`,
                        ``,
                        `---`,
                        body.substring(0, 500),
                        `---`,
                        ``,
                        `Reply /approve\\_pitch or /reject\\_pitch`,
                    ].join('\n');

                    try {
                        await bot.api.sendMessage(parseInt(chatId, 10), preview, { parse_mode: 'Markdown' });
                    } catch (err: any) {
                        console.error(`  [Outreach] Failed to send pitch approval: ${err.message}`);
                    }
                }

                // Log as pending
                logPitchOutreach(businessName, email, template.id, subject, body, 'pending_approval');
                result.pitched++;
                continue;
            }

            // Send via Instantly
            const sendResult = await sendSingleEmail(email, subject, body);
            if (sendResult.success) {
                logPitchOutreach(businessName, email, template.id, subject, body, 'sent');
                result.pitched++;
                console.log(`  [Outreach] Pitched: ${businessName} -> ${email}`);
            } else {
                logPitchOutreach(businessName, email, template.id, subject, body, 'failed');
                result.errors++;
                console.error(`  [Outreach] Pitch failed for ${businessName}: ${sendResult.error}`);
            }
        } catch (err: any) {
            console.error(`  [Outreach] Error pitching ${businessName}: ${err.message}`);
            result.errors++;
        }
    }

    console.log(`  [Outreach] Website pitch cycle complete. Pitched: ${result.pitched}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
    return result;
}

// ─── Website Pitch Helpers ──────────────────────────────────────────────────

/**
 * Check if a lead has already been pitched by looking up outreach_messages.
 * Uses a heuristic: search for the email in message content.
 */
async function checkIfAlreadyPitched(email: string, businessName: string): Promise<boolean> {
    try {
        // Import DB directly to run a custom query
        const Database = (await import('better-sqlite3')).default;
        const { join: pathJoin, dirname } = await import('node:path');
        const { fileURLToPath } = await import('node:url');

        const __dirname = dirname(fileURLToPath(import.meta.url));
        const dbPath = pathJoin(__dirname, '..', '..', '..', 'memory', 'kaya-leads.db');

        if (!existsSync(dbPath)) return false;

        const db = new Database(dbPath, { readonly: true });
        const row = db.prepare(
            `SELECT COUNT(*) as cnt FROM outreach_messages
             WHERE message_type = 'website_pitch'
             AND message_content LIKE ?`
        ).get(`%${email}%`) as { cnt: number } | undefined;
        db.close();

        return (row?.cnt ?? 0) > 0;
    } catch {
        return false;
    }
}

/**
 * Detect language from scrape result context.
 * Default to TR for Turkish-looking data.
 */
function detectLanguageFromScrape(scraped: ScrapeResult): 'tr' | 'en' {
    const text = JSON.stringify(scraped).toLowerCase();
    const trSignals = ['istanbul', 'ankara', 'izmir', 'turkiye', 'turkey', 'tr', 'cadde', 'sokak', 'mahalle'];
    for (const signal of trSignals) {
        if (text.includes(signal)) return 'tr';
    }
    return 'en';
}

/**
 * Log a pitch outreach in the outreach_messages table.
 * Creates a temporary lead record if one doesn't exist.
 */
function logPitchOutreach(
    businessName: string,
    email: string,
    templateId: string,
    subject: string,
    body: string,
    status: string,
): void {
    try {
        dbSaveOutreach({
            lead_id: 0, // Placeholder — scrape-only lead, may not be in leads table
            channel: 'email',
            message_type: 'website_pitch',
            template_id: templateId,
            message_content: `To: ${email}\nBusiness: ${businessName}\nSubject: ${subject}\n\n${body}`,
            personalization_data: JSON.stringify({ email, business: businessName }),
            status,
        });
    } catch (err: any) {
        console.error(`  [Outreach] Failed to log pitch outreach: ${err.message}`);
    }
}
