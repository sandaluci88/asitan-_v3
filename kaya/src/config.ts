import 'dotenv/config';

// ─── Config ───────────────────────────────────────────────────────────────────
// All secrets stay in .env. This module validates and exports typed config.
// NEVER log or expose secret values.

function required(name: string): string {
    const value = process.env[name];
    if (!value) {
        console.error(`❌ Missing required env var: ${name}`);
        console.error(`   Copy .env.example to .env and fill in the values.`);
        process.exit(1);
    }
    return value;
}

function optional(name: string, fallback: string): string {
    return process.env[name] ?? fallback;
}

// ─── Exported Config ──────────────────────────────────────────────────────────

export const config = {
    // Telegram
    telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
    allowedUserIds: optional('ALLOWED_USER_IDS', 'your_telegram_user_id_here'),

    // LLM (optional — only needed if using OpenAI API directly, not needed for Brain mode)
    openAiApiKey: optional('OPENAI_API_KEY', ''),

    // Brain Mode
    // 'queue'  — write to kaya/brain/inbox, wait for Claude Code in terminal
    // 'direct' — call OpenAI API directly (autonomous 24/7, no terminal needed)
    // 'hybrid' — try queue first (15s), fall back to OpenAI API if no response
    brainMode: (optional('BRAIN_MODE', 'hybrid')) as 'queue' | 'direct' | 'hybrid',
    brainDirectModel: optional('BRAIN_DIRECT_MODEL', 'gpt-4o-mini'),
    brainDirectBaseUrl: optional('BRAIN_DIRECT_BASE_URL', 'https://api.openai.com/v1'),
    brainQueueTimeoutMs: parseInt(optional('BRAIN_QUEUE_TIMEOUT_MS', '15000'), 10),

    // Memory
    mockMemory: optional('MOCK_MEMORY', 'false') === 'true',

    // Heartbeat
    heartbeatEnabled: optional('HEARTBEAT_ENABLED', 'true') === 'true',

    // Agent
    maxAgentIterations: parseInt(optional('MAX_AGENT_ITERATIONS', '10'), 10),

    // Magnet / Outreach
    magnetMaxDailyEmails: parseInt(optional('MAGNET_MAX_DAILY_EMAILS', '50'), 10),
    magnetApprovalMode: optional('MAGNET_APPROVAL_MODE', 'false') === 'true',
    instantlyApiKey: optional('INSTANTLY_API_KEY', ''),

    // Pipeline (beautiful-websites-kit root relative to kaya/)
    pipelineDir: optional('PIPELINE_DIR', '..'),

    // ─── Hardcoded Identity (standalone — no fleet) ──────────────────────────
    agentName: 'kaya' as const,
    agentDisplayName: 'Kaya' as const,
    agentEmoji: '💼' as const,
    fleetMode: false as const,
} as const;

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateConfig(): void {
    if (config.allowedUserIds === 'your_telegram_user_id_here') {
        console.warn('⚠️  SECURITY WARNING: ALLOWED_USER_IDS is not set.');
        console.warn('⚠️  The bot is currently running in OPEN MODE and will respond to ANYONE.');
        console.warn('⚠️  Find your ID via @userinfobot and update .env to secure your bot.');
    }

    // Log startup info — NEVER log secrets
    console.log('┌─────────────────────────────────────────┐');
    console.log('│          💼  Kaya SDR v1.0.0            │');
    console.log('├─────────────────────────────────────────┤');
    console.log(`│  Allowed users: ${(config.allowedUserIds === 'your_telegram_user_id_here' ? 'ANYONE (UNSAFE)' : config.allowedUserIds).padEnd(22)} │`);
    console.log(`│  Brain mode: ${config.brainMode.padEnd(25)}  │`);
    console.log(`│  LLM model: ${config.brainDirectModel.slice(0, 24).padEnd(25)}  │`);
    console.log(`│  Memory: ${(config.mockMemory ? 'mock' : 'SQLite+FTS5').padEnd(28)}  │`);
    console.log(`│  Heartbeat: ${(config.heartbeatEnabled ? 'enabled' : 'disabled').padEnd(25)}  │`);
    console.log(`│  Max agent iterations: ${String(config.maxAgentIterations).padEnd(15)}  │`);
    console.log(`│  Approval mode: ${(config.magnetApprovalMode ? 'yes' : 'auto').padEnd(21)} │`);
    console.log(`│  Max daily emails: ${String(config.magnetMaxDailyEmails).padEnd(18)} │`);
    console.log(`│  Pipeline dir: ${config.pipelineDir.padEnd(22)} │`);
    console.log('└─────────────────────────────────────────┘');
}
