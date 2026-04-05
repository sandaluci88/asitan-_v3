import { Bot } from 'grammy';
import { hydrateFiles } from '@grammyjs/files';
import { config } from '../config.js';

// ─── Bot Creation ────────────────────────────────────────────────────────────
// grammY Telegram bot with files plugin.
// Long-polling only — NO web server, NO exposed ports.

export function createBot(): Bot {
    const bot = new Bot(config.telegramBotToken);

    // Install the files plugin so we can call getUrl() / download() on files
    bot.api.config.use(hydrateFiles(bot.token));

    // ─── User Whitelist Guard ─────────────────────────────────────────────────
    // Security: silently ignore messages from unauthorized users.
    // This runs before any handler.
    bot.use(async (ctx, next) => {
        const userId = ctx.from?.id;

        // If the user hasn't configured the whitelist, allow all connections (open mode)
        if (config.allowedUserIds === 'your_telegram_user_id_here') {
            return next();
        }

        // Check the whitelist
        const allowedIdsList = config.allowedUserIds
            .split(',')
            .map((id) => parseInt(id.trim(), 10))
            .filter((id) => !isNaN(id));

        if (!userId || !allowedIdsList.includes(userId)) {
            // Silently drop — do not respond, do not log user content
            return;
        }
        await next();
    });

    return bot;
}
