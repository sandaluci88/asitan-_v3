// ─── Telegram DM Sending ─────────────────────────────────────────────────────
// Sends direct messages via grammY Bot instance.
// Rate-limited with random delay + daily counter.

import type { Bot } from 'grammy';

// ─── Rate Limiting ───────────────────────────────────────────────────────────

let dailyDmCount = 0;
let resetTime = getNextResetTime();

function getNextResetTime(): number {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return tomorrow.getTime();
}

function checkAndResetCounter(): void {
    if (Date.now() >= resetTime) {
        dailyDmCount = 0;
        resetTime = getNextResetTime();
    }
}

function getMaxDailyDms(): number {
    return parseInt(process.env.MAGNET_MAX_DAILY_DMS ?? '100', 10);
}

/**
 * Sleep for a random duration between min and max milliseconds.
 */
function randomDelay(minMs: number = 2000, maxMs: number = 5000): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    return new Promise(resolve => setTimeout(resolve, delay));
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface SendDmResult {
    success: boolean;
    messageId?: number;
    error?: string;
    rateLimited?: boolean;
}

/**
 * Send a Telegram DM to a user via bot.api.sendMessage().
 * Includes random 2-5s delay between messages for rate limiting.
 * Respects daily DM limit set via MAGNET_MAX_DAILY_DMS.
 */
export async function sendTelegramDM(
    bot: Bot,
    telegramId: string | number,
    message: string,
): Promise<SendDmResult> {
    checkAndResetCounter();

    const maxDaily = getMaxDailyDms();
    if (dailyDmCount >= maxDaily) {
        console.log(`  [Telegram] Daily DM limit reached (${maxDaily}). Skipping.`);
        return { success: false, error: 'Daily DM limit reached', rateLimited: true };
    }

    // Random delay to avoid Telegram rate limits
    await randomDelay(2000, 5000);

    try {
        const result = await bot.api.sendMessage(
            typeof telegramId === 'string' ? parseInt(telegramId, 10) : telegramId,
            message,
            { parse_mode: 'Markdown' },
        );

        dailyDmCount++;
        console.log(`  [Telegram] DM sent to ${telegramId} (${dailyDmCount}/${maxDaily} today)`);

        return { success: true, messageId: result.message_id };
    } catch (err: any) {
        console.error(`  [Telegram] Failed to send DM to ${telegramId}: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Get current daily DM usage stats.
 */
export function getDmStats(): { sent: number; limit: number; remaining: number } {
    checkAndResetCounter();
    const limit = getMaxDailyDms();
    return { sent: dailyDmCount, limit, remaining: limit - dailyDmCount };
}
