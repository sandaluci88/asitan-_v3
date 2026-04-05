import 'dotenv/config';
import { config, validateConfig } from './config.js';
import { createBot } from './telegram/bot.js';
import { handleTextMessage } from './handlers/message.js';
import {
    handleStartCommand,
    handleRememberCommand,
    handleRecallCommand,
    handleLeadsCommand,
    handlePipelineCommand,
    handlePitchCommand,
    handleReportCommand,
} from './handlers/commands.js';
import { initMemory } from './memory/index.js';
import { initLeadsDb } from './leads/db.js';
import { initAllTools } from './tools/registry.js';
import { initKayaScheduler } from './scheduler/kaya.js';

// ─── Kaya SDR — Entry Point ────────────────────────────────────────────────
// Validates config, creates the bot, registers handlers, starts long-polling.
// Standalone agent — no fleet, no headless, no orchestrator.

async function main(): Promise<void> {
    // Validate all env vars and print startup banner
    validateConfig();

    // Initialize memory system (SQLite or mock)
    initMemory();

    // Initialize leads database
    initLeadsDb();

    // Load all tools (lead management, outreach, pipeline, etc.)
    await initAllTools();

    // Create Telegram bot
    const bot = createBot();

    // ─── Register Command Handlers ──────────────────────────────────────────
    bot.command('start', handleStartCommand);
    bot.command('remember', handleRememberCommand);
    bot.command('recall', handleRecallCommand);
    bot.command('leads', handleLeadsCommand);
    bot.command('pipeline', handlePipelineCommand);
    bot.command('pitch', handlePitchCommand);
    bot.command('report', handleReportCommand);

    // ─── Register Message Handlers ──────────────────────────────────────────
    bot.on('message:text', handleTextMessage);

    // Catch-all for unsupported message types
    bot.on('message', async (ctx) => {
        const type = ctx.message?.photo ? 'photo'
            : ctx.message?.document ? 'document'
                : ctx.message?.sticker ? 'sticker'
                    : ctx.message?.voice ? 'voice'
                        : 'unknown';
        await ctx.reply(`I can handle text messages for now. (Received: ${type})`);
    });

    // ─── Error Handler ──────────────────────────────────────────────────────
    bot.catch((err) => {
        console.error('❌ Bot error:', err.message);
    });

    // ─── Initialize Scheduler ───────────────────────────────────────────────
    initKayaScheduler(bot);

    // ─── Start Long-Polling ─────────────────────────────────────────────────
    console.log('🚀 Kaya SDR is running! Send a message on Telegram.');
    console.log('   Press Ctrl+C to stop.\n');

    await bot.start({
        onStart: (botInfo) => {
            console.log(`🤖 Bot: @${botInfo.username}`);
        },
    });
}

// ─── Graceful Shutdown ──────────────────────────────────────────────────────
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Kaya SDR...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down Kaya SDR...');
    process.exit(0);
});

main().catch((err) => {
    console.error('💀 Fatal error:', err);
    process.exit(1);
});
