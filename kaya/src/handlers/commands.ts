import type { Context } from 'grammy';
import { remember, recall } from '../memory/index.js';
import { config } from '../config.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ─── Command Handlers ────────────────────────────────────────────────────────
// /start           — welcome message
// /remember <text> — store fact
// /recall <query>  — search memory
// /leads [status]  — list leads by status or show pipeline stats
// /pipeline        — pipeline overview (counts per stage)
// /pitch           — match leads to deployed Vercel URLs, preview pitches
// /report [id]     — sales report: site problems, why they'd buy, pricing, confidence

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve a path relative to the pipeline directory */
function pipelinePath(...segments: string[]): string {
    const base = resolve(config.pipelineDir);
    return join(base, ...segments);
}

/** Convert a business name to a slug (lowercase, hyphenated) */
function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/** Read and parse scrape_results.json from the pipeline directory */
function readScrapeResults(): any[] | null {
    const filePath = pipelinePath('scrape_results.json');
    if (!existsSync(filePath)) return null;
    try {
        const raw = readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/** Read build-log.md and extract slug -> Vercel URL mappings */
function readBuildLog(): Map<string, string> {
    const filePath = pipelinePath('sites', 'build-log.md');
    const map = new Map<string, string>();
    if (!existsSync(filePath)) return map;

    try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
            // Match lines containing a Vercel URL
            // Expected format varies, but look for slug and https://*.vercel.app patterns
            const vercelMatch = line.match(/(https:\/\/[^\s)]+\.vercel\.app[^\s)]*)/);
            if (!vercelMatch) continue;

            const url = vercelMatch[1];

            // Try to extract slug from the line — look for known patterns:
            // - `sites/{slug}/index.html`
            // - `**{slug}**`
            // - `| slug |`
            const slugFromPath = line.match(/sites\/([a-z0-9-]+)\//);
            const slugFromBold = line.match(/\*\*([a-z0-9-]+)\*\*/);
            const slugFromPipe = line.match(/\|\s*([a-z0-9-]+)\s*\|/);

            const slug = slugFromPath?.[1] || slugFromBold?.[1] || slugFromPipe?.[1];
            if (slug) {
                map.set(slug, url);
            }
        }
    } catch {
        // Ignore parse errors
    }

    return map;
}

// ─── /start ──────────────────────────────────────────────────────────────────

export async function handleStartCommand(ctx: Context): Promise<void> {
    await ctx.reply(
        `Kaya SDR is online.\n\n` +
        `I find local businesses with outdated websites, redesign them for free, ` +
        `and help you pitch the new site.\n\n` +
        `Commands:\n` +
        `/report [id] — Sales report: site problems, pricing, confidence\n` +
        `/pitch — Preview and launch pitch campaign\n` +
        `/leads [status] — List leads or filter by status\n` +
        `/pipeline — Pipeline overview\n` +
        `/remember <text> — Save a memory\n` +
        `/recall <query> — Search memories\n\n` +
        `Or just send me a message and I'll figure it out.`
    );
}

// ─── /remember ───────────────────────────────────────────────────────────────

export async function handleRememberCommand(ctx: Context): Promise<void> {
    const text = ctx.message?.text;
    if (!text) return;

    const payload = text.replace(/^\/remember\s*/i, '').trim();

    if (!payload) {
        await ctx.reply('Usage: `/remember <fact or note>`\n\nExample: `/remember I prefer dark mode`', {
            parse_mode: 'Markdown',
        });
        return;
    }

    try {
        const mem = remember(payload, 'user');
        console.log(`  Stored memory #${mem.id}: "${payload.slice(0, 60)}"`);
        await ctx.reply(`Remembered:\n> ${payload}\n\n_Memory #${mem.id} saved._`, {
            parse_mode: 'Markdown',
        });
    } catch (err) {
        console.error('Remember error:', err);
        await ctx.reply('Sorry, I couldn\'t save that memory. Please try again.');
    }
}

// ─── /recall ─────────────────────────────────────────────────────────────────

export async function handleRecallCommand(ctx: Context): Promise<void> {
    const text = ctx.message?.text;
    if (!text) return;

    const query = text.replace(/^\/recall\s*/i, '').trim();

    if (!query) {
        await ctx.reply('Usage: `/recall <search query>`\n\nExample: `/recall dark mode`', {
            parse_mode: 'Markdown',
        });
        return;
    }

    try {
        const results = recall(query, 5);

        if (results.length === 0) {
            await ctx.reply(`No memories found for: "${query}"`);
            return;
        }

        const formatted = results
            .map((m, i) => `${i + 1}. ${m.content}\n   _${m.source} · ${m.created_at}_`)
            .join('\n\n');

        await ctx.reply(`*Memories matching "${query}":*\n\n${formatted}`, {
            parse_mode: 'Markdown',
        });
    } catch (err) {
        console.error('Recall error:', err);
        await ctx.reply('Sorry, I couldn\'t search memories. Please try again.');
    }
}

// ─── /leads ──────────────────────────────────────────────────────────────────

export async function handleLeadsCommand(ctx: Context): Promise<void> {
    try {
        const text = ctx.message?.text || '';
        const statusFilter = text.replace(/^\/leads\s*/i, '').trim().toLowerCase();

        const leads = readScrapeResults();
        if (!leads || leads.length === 0) {
            await ctx.reply('No leads found yet. Run the pipeline first to scrape leads.');
            return;
        }

        // Read qualify results if available
        const qualifyPath = pipelinePath('qualify_results.json');
        let qualifyResults: Record<string, any> = {};
        if (existsSync(qualifyPath)) {
            try {
                const raw = readFileSync(qualifyPath, 'utf-8');
                const parsed = JSON.parse(raw);
                // Index by slug or name for quick lookup
                if (Array.isArray(parsed)) {
                    for (const q of parsed) {
                        const key = q.slug || slugify(q.name || q.title || '');
                        qualifyResults[key] = q;
                    }
                }
            } catch { /* ignore */ }
        }

        // Read build log for deploy status
        const deployedSlugs = readBuildLog();

        // Determine status for each lead
        const enriched = leads.map((lead: any) => {
            const name = lead.title || lead.name || lead.searchString || 'Unknown';
            const slug = slugify(name);
            const qualify = qualifyResults[slug];
            const deployed = deployedSlugs.has(slug);

            let status = 'scraped';
            if (qualify?.verdict === 'YES' && deployed) status = 'deployed';
            else if (qualify?.verdict === 'YES') status = 'qualified';
            else if (qualify?.verdict === 'NO') status = 'rejected';
            else if (qualify) status = 'qualified';

            return { name, slug, email: lead.email, website: lead.website, status, deployed };
        });

        // Filter by status if provided
        const filtered = statusFilter
            ? enriched.filter((l: any) => l.status === statusFilter)
            : enriched;

        if (filtered.length === 0) {
            await ctx.reply(`No leads with status "${statusFilter}". Try: scraped, qualified, rejected, deployed`);
            return;
        }

        const lines = filtered.slice(0, 15).map((l: any, i: number) =>
            `${i + 1}. *${l.name}* — ${l.status}${l.email ? ' | ' + l.email : ''}${l.deployed ? ' | deployed' : ''}`
        );

        const header = statusFilter
            ? `Leads (${statusFilter}): ${filtered.length} total`
            : `All Leads: ${filtered.length} total`;

        await ctx.reply(`${header}\n\n${lines.join('\n')}${filtered.length > 15 ? `\n\n_...and ${filtered.length - 15} more_` : ''}`, {
            parse_mode: 'Markdown',
        });
    } catch (err) {
        console.error('Leads command error:', err);
        await ctx.reply('Failed to fetch leads.');
    }
}

// ─── /pipeline ───────────────────────────────────────────────────────────────

export async function handlePipelineCommand(ctx: Context): Promise<void> {
    try {
        const leads = readScrapeResults();
        const totalScraped = leads?.length ?? 0;

        // Qualify results
        const qualifyPath = pipelinePath('qualify_results.json');
        let yesCount = 0;
        let noCount = 0;
        if (existsSync(qualifyPath)) {
            try {
                const parsed = JSON.parse(readFileSync(qualifyPath, 'utf-8'));
                if (Array.isArray(parsed)) {
                    for (const q of parsed) {
                        if (q.verdict === 'YES') yesCount++;
                        else if (q.verdict === 'NO') noCount++;
                    }
                }
            } catch { /* ignore */ }
        }

        // Deployed sites
        const deployedCount = readBuildLog().size;

        // Build log — count redesigned sites by checking sites/ directories
        let redesignedCount = 0;
        const sitesDir = pipelinePath('sites');
        if (existsSync(sitesDir)) {
            try {
                const { readdirSync, statSync } = await import('node:fs');
                const entries = readdirSync(sitesDir);
                for (const entry of entries) {
                    const indexPath = join(sitesDir, entry, 'index.html');
                    if (existsSync(indexPath)) redesignedCount++;
                }
            } catch { /* ignore */ }
        }

        const lines = [
            `Pipeline Overview:`,
            ``,
            `  Scraped:     ${totalScraped}`,
            `  Qualified:   ${yesCount} YES / ${noCount} NO`,
            `  Redesigned:  ${redesignedCount}`,
            `  Deployed:    ${deployedCount}`,
            ``,
            `Stages: scrape -> qualify -> redesign -> deploy -> pitch`,
        ];

        await ctx.reply(lines.join('\n'));
    } catch (err) {
        console.error('Pipeline command error:', err);
        await ctx.reply('Failed to fetch pipeline stats.');
    }
}

// ─── /pitch ──────────────────────────────────────────────────────────────────

export async function handlePitchCommand(ctx: Context): Promise<void> {
    try {
        // 1. Read scrape results
        const leads = readScrapeResults();
        if (!leads || leads.length === 0) {
            await ctx.reply('No leads found. Run the pipeline scrape step first.');
            return;
        }

        // 2. Read build log for deployed Vercel URLs
        const deployedSlugs = readBuildLog();
        if (deployedSlugs.size === 0) {
            await ctx.reply('No deployed sites found in build-log.md. Run the deploy step first.');
            return;
        }

        // 3. Match leads to deployed sites
        interface PitchCandidate {
            name: string;
            email: string;
            oldSite: string;
            newUrl: string;
            slug: string;
        }

        const candidates: PitchCandidate[] = [];

        for (const lead of leads) {
            const name = lead.title || lead.name || lead.searchString || '';
            if (!name) continue;

            const slug = slugify(name);
            const vercelUrl = deployedSlugs.get(slug);

            if (vercelUrl && lead.email) {
                candidates.push({
                    name,
                    email: lead.email,
                    oldSite: lead.website || 'N/A',
                    newUrl: vercelUrl,
                    slug,
                });
            }
        }

        if (candidates.length === 0) {
            await ctx.reply(
                'No matches found between leads and deployed sites.\n\n' +
                'Make sure leads have email addresses and their slugified names match the deployed site slugs in build-log.md.'
            );
            return;
        }

        // 4. Show summary
        const lines = candidates.map((c, i) =>
            `${i + 1}. *${c.name}*\n` +
            `   Email: ${c.email}\n` +
            `   Old: ${c.oldSite}\n` +
            `   New: ${c.newUrl}`
        );

        const message =
            `Found ${candidates.length} leads with deployed sites. Ready to pitch:\n\n` +
            lines.join('\n\n') +
            `\n\nReply "yes" to start the pitch campaign.`;

        // Split if too long
        const maxLen = 4096;
        if (message.length <= maxLen) {
            await ctx.reply(message, { parse_mode: 'Markdown' }).catch(() =>
                ctx.reply(message)
            );
        } else {
            for (let i = 0; i < message.length; i += maxLen) {
                const chunk = message.slice(i, i + maxLen);
                await ctx.reply(chunk, { parse_mode: 'Markdown' }).catch(() => ctx.reply(chunk));
            }
        }
    } catch (err) {
        console.error('Pitch command error:', err);
        await ctx.reply('Failed to generate pitch preview.');
    }
}

// ─── /report ────────────────────────────────────────────────────────────────

/** Read qualify_results.json and return a map of name -> qualify info */
function readQualifyResults(): Map<string, any> {
    const qualifyPath = pipelinePath('qualify_results.json');
    const map = new Map<string, any>();
    if (!existsSync(qualifyPath)) return map;
    try {
        const raw = readFileSync(qualifyPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            for (const q of parsed) {
                const key = (q.name || q.business || '').toLowerCase();
                if (key) map.set(key, q);
            }
        }
    } catch { /* ignore */ }
    return map;
}

export async function handleReportCommand(ctx: Context): Promise<void> {
    try {
        const text = ctx.message?.text || '';
        const arg = text.replace(/^\/report\s*/i, '').trim();

        const leads = readScrapeResults();
        if (!leads || leads.length === 0) {
            await ctx.reply('No leads found. Run the pipeline first.');
            return;
        }

        const qualifyMap = readQualifyResults();
        const deployMap = readBuildLog();

        // If specific lead number given, show just that one
        // Otherwise show top 5 by review count
        let targets: any[];
        if (arg && !isNaN(Number(arg))) {
            const idx = Number(arg) - 1;
            if (idx < 0 || idx >= leads.length) {
                await ctx.reply(`Lead #${arg} not found. Valid range: 1-${leads.length}`);
                return;
            }
            targets = [{ ...leads[idx], _idx: idx + 1 }];
        } else {
            // Sort by review count descending, take top 5
            const sorted = leads
                .map((l: any, i: number) => ({ ...l, _idx: i + 1 }))
                .filter((l: any) => l.email)
                .sort((a: any, b: any) => (b.reviewCount || 0) - (a.reviewCount || 0))
                .slice(0, 5);
            targets = sorted;
        }

        for (const lead of targets) {
            const name = lead.name || lead.title || 'Unknown';
            const nameKey = name.toLowerCase();
            const slug = slugify(name);
            const qualify = qualifyMap.get(nameKey);
            const vercelUrl = deployMap.get(slug);
            const rating = lead.rating || lead.totalScore || null;
            const reviewCount = lead.reviewCount || 0;
            const email = lead.email || 'N/A';
            const website = lead.website || 'N/A';
            const qualifyResult = qualify?.qualify || 'PENDING';
            const siteProblems = qualify?.reason || 'Not evaluated';

            // Why they'd buy
            const whyBuy: string[] = [];
            if (qualifyResult === 'YES') whyBuy.push('Web sitesi eski — yenilenmesi gerektigini biliyorlar');
            if (reviewCount > 500) whyBuy.push(`Yuksek hacimli isletme (${reviewCount} yorum) — itibarına yatirim yapar`);
            else if (reviewCount > 100) whyBuy.push(`Yerlesik isletme (${reviewCount} yorum) — imajını onemsyor`);
            if (rating && rating >= 4.5) whyBuy.push(`Yuksek puan (${rating}⭐) — kaliteye onem veriyor, site de oyle olmali`);
            if (vercelUrl) whyBuy.push('Canli demo hazir — deger kanitlanmis durumda');
            whyBuy.push('Ucretsiz tasarim riski sifirliyor — hayir demenin maliyeti yok');

            // Pricing
            let tier: string, price: string, monthly: string;
            if (reviewCount > 1000) {
                tier = '💎 Premium'; price = '$2,000 - $3,500'; monthly = '$300 - $500/ay';
            } else if (reviewCount > 300) {
                tier = '⭐ Standard'; price = '$1,000 - $2,000'; monthly = '$200 - $350/ay';
            } else {
                tier = '🟢 Starter'; price = '$500 - $1,000'; monthly = '$100 - $200/ay';
            }

            // Confidence
            let score = 0;
            if (qualifyResult === 'YES') score += 30;
            if (email && email !== 'N/A') score += 15;
            if (reviewCount > 200) score += 20;
            if (rating && rating >= 4.5) score += 15;
            if (vercelUrl) score += 20;

            let confidence: string;
            if (score >= 70) confidence = '🟢 HIGH';
            else if (score >= 45) confidence = '🟡 MEDIUM';
            else confidence = '🔴 LOW';

            const msg = [
                `━━━━━━━━━━━━━━━━━━━━━`,
                `📊 *SATIS RAPORU #${lead._idx}*`,
                `━━━━━━━━━━━━━━━━━━━━━`,
                ``,
                `🏢 *${name}*`,
                `🌐 ${website}`,
                `📧 ${email}`,
                rating ? `⭐ ${rating} (${reviewCount} yorum)` : '',
                ``,
                `📋 *Site Sorunları:*`,
                `${siteProblems}`,
                ``,
                `💡 *Neden Alır:*`,
                ...whyBuy.map(w => `  • ${w}`),
                ``,
                `💰 *Fiyatlandirma:*`,
                `  Tier: ${tier}`,
                `  Tek seferlik: ${price}`,
                `  Aylik bakim: ${monthly}`,
                ``,
                `🎯 *Conversion Tahmini:* ${confidence} (${score}/100)`,
                vercelUrl ? `\n🔗 *Demo:* ${vercelUrl}` : `\n⏳ Demo henuz yapilmadi`,
                `━━━━━━━━━━━━━━━━━━━━━`,
            ].filter(Boolean).join('\n');

            // Send (may need to split if multiple reports)
            try {
                await ctx.reply(msg, { parse_mode: 'Markdown' });
            } catch {
                // Fallback without markdown if parse fails
                await ctx.reply(msg.replace(/\*/g, ''));
            }
        }

        if (targets.length > 1) {
            await ctx.reply(`\n📈 ${targets.length} lead raporu yukarida. Tek lead icin: /report <numara>`);
        }
    } catch (err) {
        console.error('Report command error:', err);
        await ctx.reply('Failed to generate sales report.');
    }
}
