// ─── Kaya SDR Scheduler ──────────────────────────────────────────────────────
// Autonomous cron jobs for Kaya, the standalone Sales SDR agent.
// Handles morning reports, pipeline checks, website pitches, follow-ups,
// and daily summaries. All jobs run on Europe/Istanbul timezone.
// No fleet — this is a standalone beautiful-websites agent.

import cron from 'node-cron';
import type { Bot } from 'grammy';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { runOutreachCycle, runFollowUpCycle, runWebsitePitchCycle } from '../outreach/engine.js';
import { getPipelineStats, getLeadCount, saveLead, getRecentOutreach } from '../leads/db.js';
import { config } from '../config.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const TZ = { timezone: 'Europe/Istanbul' as const };
const LOG_PREFIX = '[Kaya Scheduler]';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAllowedUserIds(): number[] {
    if (config.allowedUserIds === 'your_telegram_user_id_here') return [];
    return config.allowedUserIds
        .split(',')
        .map(id => parseInt(id.trim(), 10))
        .filter(id => !isNaN(id));
}

async function notify(bot: Bot, message: string): Promise<void> {
    for (const userId of getAllowedUserIds()) {
        try {
            await bot.api.sendMessage(userId, message, { parse_mode: 'Markdown' });
        } catch (err: any) {
            console.error(`${LOG_PREFIX} Failed to notify user ${userId}: ${err.message}`);
        }
    }
}

function getPipelineDir(): string {
    return config.pipelineDir;
}

function todayDate(): string {
    return new Date().toISOString().split('T')[0];
}

// ─── 09:00 — Morning Report ────────────────────────────────────────────────

async function morningReport(bot: Bot): Promise<void> {
    console.log(`\n${LOG_PREFIX} Morning report starting...`);

    try {
        const stats = getPipelineStats();
        const totalLeads = getLeadCount();

        // Check if there are built sites ready to pitch
        const pipelineDir = getPipelineDir();
        const buildLogPath = join(pipelineDir, 'sites', 'build-log.md');
        let builtSites = 0;
        if (existsSync(buildLogPath)) {
            const content = readFileSync(buildLogPath, 'utf-8');
            builtSites = content.split('\n').filter(l => l.startsWith('|') && !l.includes('---') && !l.toLowerCase().includes('slug')).length;
        }

        // Check scrape results
        const scrapeResultsPath = join(pipelineDir, 'scrape_results.json');
        let scrapeCount = 0;
        if (existsSync(scrapeResultsPath)) {
            try {
                const data = JSON.parse(readFileSync(scrapeResultsPath, 'utf-8'));
                scrapeCount = Array.isArray(data) ? data.length : 0;
            } catch { /* ignore parse errors */ }
        }

        const lines = [
            `*Kaya -- Sabah Raporu*`,
            ``,
            `*Pipeline Durumu:*`,
            `  New: ${stats.new} | Qualified: ${stats.qualified} | Contacted: ${stats.contacted}`,
            `  Replied: ${stats.replied} | Meeting: ${stats.meeting} | Won: ${stats.won}`,
            `  Toplam DB lead: ${totalLeads}`,
            ``,
            `*Websiteler:*`,
            `  Scrape sonuclari: ${scrapeCount} lead`,
            `  Insa edilen siteler: ${builtSites}`,
            ``,
            `*Bugunun Plani:*`,
            `  10:00 — Pipeline kontrolu ve yeni lead import`,
            `  10:30 — Website pitch dongusu`,
            `  15:00 — Takip mesajlari`,
            `  17:00 — Gunluk ozet`,
        ];

        const message = lines.join('\n');
        await notify(bot, message);

        console.log(`${LOG_PREFIX} Morning report sent.`);
    } catch (err: any) {
        console.error(`${LOG_PREFIX} Morning report error: ${err.message}`);
    }
}

// ─── 10:00 — Pipeline Check & Import ───────────────────────────────────────

async function pipelineCheck(bot: Bot): Promise<void> {
    console.log(`\n${LOG_PREFIX} Pipeline check starting...`);

    try {
        const pipelineDir = getPipelineDir();
        const scrapeResultsPath = join(pipelineDir, 'scrape_results.json');

        if (!existsSync(scrapeResultsPath)) {
            console.log(`${LOG_PREFIX} No scrape_results.json found. Skipping import.`);
            return;
        }

        const raw = readFileSync(scrapeResultsPath, 'utf-8');
        const scrapeResults = JSON.parse(raw);
        if (!Array.isArray(scrapeResults) || scrapeResults.length === 0) {
            console.log(`${LOG_PREFIX} No leads in scrape_results.json.`);
            return;
        }

        let imported = 0;
        let skipped = 0;

        for (const scraped of scrapeResults) {
            const name = scraped.name ?? scraped.title ?? '';
            const email = scraped.email ?? '';
            const website = scraped.website ?? '';

            if (!name) {
                skipped++;
                continue;
            }

            try {
                saveLead({
                    full_name: name,
                    company: name,
                    title: null,
                    email: email || null,
                    phone: scraped.phone ?? null,
                    telegram_id: null,
                    website: website || null,
                    industry: scraped.category ?? null,
                    country: scraped.country ?? 'TR',
                    source: 'web_scrape',
                    status: 'new',
                    persona_tag: null,
                    tags: 'pipeline_import',
                    enrichment_data: JSON.stringify(scraped),
                    notes: `Imported from scrape_results.json on ${todayDate()}`,
                });
                imported++;
            } catch {
                // Likely duplicate — skip silently
                skipped++;
            }
        }

        const message = [
            `*Kaya -- Pipeline Import*`,
            ``,
            `Scrape dosyasindan ${imported} yeni lead import edildi.`,
            skipped > 0 ? `${skipped} lead atladirildi (duplicate veya eksik veri).` : '',
        ].filter(Boolean).join('\n');

        if (imported > 0) {
            await notify(bot, message);
        }

        console.log(`${LOG_PREFIX} Pipeline check done. Imported: ${imported}, Skipped: ${skipped}`);
    } catch (err: any) {
        console.error(`${LOG_PREFIX} Pipeline check error: ${err.message}`);
    }
}

// ─── 10:30 — Website Pitch Cycle ───────────────────────────────────────────

async function websitePitchJob(bot: Bot): Promise<void> {
    console.log(`\n${LOG_PREFIX} Website pitch cycle starting...`);

    try {
        const result = await runWebsitePitchCycle(bot);

        if (result.pitched > 0 || result.errors > 0) {
            const message = [
                `*Kaya -- Website Pitch Sonuclari*`,
                ``,
                `Pitch gonderilen: ${result.pitched}`,
                `Atlanan: ${result.skipped}`,
                result.errors > 0 ? `Hatalar: ${result.errors}` : '',
            ].filter(Boolean).join('\n');

            await notify(bot, message);
        }

        console.log(`${LOG_PREFIX} Website pitch cycle done. Pitched: ${result.pitched}`);
    } catch (err: any) {
        console.error(`${LOG_PREFIX} Website pitch cycle error: ${err.message}`);
    }
}

// ─── 15:00 — Follow-Up Cycle ───────────────────────────────────────────────

async function followUpJob(bot: Bot): Promise<void> {
    console.log(`\n${LOG_PREFIX} Follow-up cycle starting...`);

    try {
        const sent = await runFollowUpCycle(bot);

        if (sent > 0) {
            await notify(bot, `*Kaya -- Takip Mesajlari*\n\n${sent} lead'e takip mesaji gonderildi.`);
        }

        console.log(`${LOG_PREFIX} Follow-up cycle done. Sent: ${sent}`);
    } catch (err: any) {
        console.error(`${LOG_PREFIX} Follow-up cycle error: ${err.message}`);
    }
}

// ─── 17:00 — Daily Summary ─────────────────────────────────────────────────

async function dailySummary(bot: Bot): Promise<void> {
    console.log(`\n${LOG_PREFIX} Daily summary starting...`);

    try {
        const stats = getPipelineStats();
        const totalLeads = getLeadCount();

        // Count today's outreach
        const recentOutreach = getRecentOutreach(100);
        const today = todayDate();
        const todayOutreach = recentOutreach.filter(m => m.sent_at.startsWith(today));
        const todayPitches = todayOutreach.filter(m => m.message_type === 'website_pitch');
        const todayFollowUps = todayOutreach.filter(m => m.message_type === 'follow_up');
        const todayColdIntros = todayOutreach.filter(m => m.message_type === 'cold_intro');

        // Count responses
        const todayReplies = todayOutreach.filter(m => m.status === 'replied');

        const lines = [
            `*Kaya -- Gunluk Ozet (${today})*`,
            ``,
            `*Pipeline:*`,
            `  Toplam lead: ${totalLeads}`,
            `  New: ${stats.new} | Qualified: ${stats.qualified} | Contacted: ${stats.contacted}`,
            `  Replied: ${stats.replied} | Won: ${stats.won} | Lost: ${stats.lost}`,
            ``,
            `*Bugunun Aktivitesi:*`,
            `  Website pitch: ${todayPitches.length}`,
            `  Cold intro: ${todayColdIntros.length}`,
            `  Follow-up: ${todayFollowUps.length}`,
            `  Alinan yanitlar: ${todayReplies.length}`,
            ``,
            `Toplam gonderilen: ${todayOutreach.length}`,
        ];

        const message = lines.join('\n');
        await notify(bot, message);

        console.log(`${LOG_PREFIX} Daily summary sent.`);
    } catch (err: any) {
        console.error(`${LOG_PREFIX} Daily summary error: ${err.message}`);
    }
}

// ─── Init ───────────────────────────────────────────────────────────────────

export function initKayaScheduler(bot: Bot): void {
    console.log(`  ${LOG_PREFIX} Initializing cron jobs...`);

    // 09:00 weekdays — Morning report
    cron.schedule('0 9 * * 1-5', () => {
        morningReport(bot).catch(err => console.error(`${LOG_PREFIX} Morning report error:`, err));
    }, TZ);
    console.log('  -> Morning report:          09:00 Mon-Fri');

    // 10:00 weekdays — Check pipeline outputs, import new leads
    cron.schedule('0 10 * * 1-5', () => {
        pipelineCheck(bot).catch(err => console.error(`${LOG_PREFIX} Pipeline check error:`, err));
    }, TZ);
    console.log('  -> Pipeline check & import: 10:00 Mon-Fri');

    // 10:30 weekdays — Website pitch cycle
    cron.schedule('30 10 * * 1-5', () => {
        websitePitchJob(bot).catch(err => console.error(`${LOG_PREFIX} Website pitch error:`, err));
    }, TZ);
    console.log('  -> Website pitch cycle:     10:30 Mon-Fri');

    // 15:00 weekdays — Follow-up cycle
    cron.schedule('0 15 * * 1-5', () => {
        followUpJob(bot).catch(err => console.error(`${LOG_PREFIX} Follow-up error:`, err));
    }, TZ);
    console.log('  -> Follow-up cycle:         15:00 Mon-Fri');

    // 17:00 weekdays — Daily summary
    cron.schedule('0 17 * * 1-5', () => {
        dailySummary(bot).catch(err => console.error(`${LOG_PREFIX} Daily summary error:`, err));
    }, TZ);
    console.log('  -> Daily summary:           17:00 Mon-Fri');

    console.log(`  ${LOG_PREFIX} All 5 cron jobs registered.`);
}
