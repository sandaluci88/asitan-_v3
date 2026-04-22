/**
 * Sandaluci Asistan V3 — Ayca Bot Entry Point
 *
 * Full V2 feature parity + Wiki (Ikinci Beyin) + Kaizen (Self-improvement)
 */

import "dotenv/config";
import { Bot, Keyboard } from "grammy";
import http from "http";
import {
  SupabaseService,
  LlmService,
  OrderService,
  StaffService,
  logger,
  t,
  getUserLanguage,
  translateDepartment,
  MANUAL_DEPARTMENTS,
  isManualDept,
} from "@sandaluci/core";
import { WikiEngine } from "@sandaluci/wiki";
import { KaizenTracker } from "@sandaluci/kaizen";
import { MessageHandler } from "./handlers/message.handler.js";
import { CommandHandler } from "./handlers/command.handler.js";
import { CallbackHandler } from "./handlers/callback.handler.js";
import { DistributionService } from "./services/distribution.service.js";
import { GmailPollingService } from "./services/gmail-polling.service.js";
import { DraftOrderService } from "./services/draft-order.service.js";
import { DoctorService } from "./services/doctor.service.js";
import { CronService } from "./services/cron.service.js";
import { memoryService } from "./services/memory.service.js";

// ─── Env ───────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = Number(process.env.PORT || "3000");
const DEV_MODE = process.env.DEV_MODE === "true";

if (!BOT_TOKEN) {
  logger.error("TELEGRAM_BOT_TOKEN is missing!");
  process.exit(1);
}

// Multi-boss ID support (comma-separated)
const bossIdsRaw = (process.env.TELEGRAM_BOSS_ID || "")
  .split(",")
  .map((id) => id.trim().replace(/['"]/g, ""))
  .filter((id) => id !== "");
const marinaIdsRaw = (process.env.TELEGRAM_MARINA_ID || "")
  .split(",")
  .map((id) => id.trim().replace(/['"]/g, ""))
  .filter((id) => id !== "");
const chatId = process.env.TELEGRAM_CHAT_ID || "";

const bossId = Number(bossIdsRaw[0]) || 0;
const marinaId = Number(marinaIdsRaw[0]) || bossId;

logger.info(`👤 Boss ID: ${bossId}, Marina ID: ${marinaId}`);

// ─── Bot ───────────────────────────────────────────────────────
const bot = new Bot(BOT_TOKEN);

// Global error handler
bot.catch(async (err) => {
  const ctx = err.ctx;
  const errMsg = (err.error as any)?.message || String(err.error);
  const isCritical = /connection|token|database|auth|invalid/i.test(errMsg);

  logger.error(
    { error: err.error, userId: ctx.from?.id, isCritical },
    isCritical ? "Kritik Bot Hatası!" : "Bot Hatası!",
  );

  if (isCritical && bossId) {
    try {
      await bot.api.sendMessage(
        bossId,
        `🚨 <b>KRITIK SISTEM HATASI</b>\n\n<code>${errMsg.slice(0, 500)}</code>`,
        { parse_mode: "HTML" },
      );
    } catch {}
  }

  if (ctx.from) {
    try {
      await ctx.reply("Baglanti hatasi olustu. Lutfen tekrar deneyin.");
    } catch {}
  }
});

// ─── Services ──────────────────────────────────────────────────
const staffService = StaffService.getInstance();
const draftOrderService = DraftOrderService.getInstance();
const orderService = OrderService.getInstance();
const db = SupabaseService.getInstance();
const llm = LlmService.getInstance();
const wiki = new WikiEngine();
const kaizen = KaizenTracker.getInstance();
const doctorService = new DoctorService();
const messageHandler = new MessageHandler();
const commandHandler = new CommandHandler();

const distributionService = new DistributionService(
  bot,
  orderService,
  staffService,
  bossId,
  marinaId,
);

// ─── Auth Middleware ────────────────────────────────────────────
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const isBoss = staffService.isBoss(userId);
  const isCoordinator = staffService.isCoordinator(userId);
  let staffMember = staffService.getStaffByTelegramId(userId);

  // Auto-register boss
  if (isBoss && !staffMember) {
    try {
      logger.info(`Patron tanima: ${userId} sisteme otomatik kaydediliyor...`);
      await staffService.registerStaff(userId, "Baris", "Yonetim", undefined, "SuperAdmin", "tr");
      staffMember = staffService.getStaffByTelegramId(userId);
    } catch (regErr) {
      logger.warn({ err: regErr }, "Patron otomatik kayit basarisiz");
    }
  }

  const isRegistered = !!staffMember;
  const username = ctx.from?.username || "Bilinmiyor";

  (ctx as any).role = isBoss
    ? "boss"
    : isCoordinator
      ? "coordinator"
      : isRegistered
        ? "staff"
        : "guest";
  (ctx as any).staffInfo = staffMember;

  const text = ctx.message?.text || "";
  const isRegister = text.startsWith("/kayit");
  const isRemove = text.startsWith("/sil");
  const isStart = text.startsWith("/start");

  // Security: only boss can register/remove
  if ((isRegister || isRemove) && !isBoss) {
    return ctx.reply("Bu islem sadece Baris Bey (Patron) tarafindan yapilabilir.");
  }

  // Boss recognition phrase
  const normalized = text.toLowerCase().trim();
  const bossRegex = /ben\s*(bar[ıisş])|id\s*(kontro[l]*)/i;
  if (bossRegex.test(normalized) && isBoss) {
    if (!(await staffService.isBossRecognizedInMemory())) {
      await staffService.setBossRecognizedInMemory();
      return ctx.reply(
        `Sistem Sizi Tandi Baris Bey.\n\nID: \`${userId}\`\nRol: \`SuperAdmin\``,
        { parse_mode: "Markdown" },
      );
    } else {
      return ctx.reply("Buyurun Baris Bey, sizi dinliyorum.");
    }
  }

  if (isBoss || isRegistered || isRegister || isStart) {
    return next();
  }

  // Unauthorized — silent reject or guest welcome
  if (ctx.chat?.type === "private" && isStart) {
    const userLang = ctx.from?.language_code === "ru" ? "ru" : "tr";
    const welcomeMsg = t("welcome_guest", userLang, { id: userId.toString() });
    const keyboard = new Keyboard()
      .requestContact(t("btn_share_phone", userLang))
      .oneTime()
      .resized();
    await ctx.reply(welcomeMsg, { parse_mode: "Markdown", reply_markup: keyboard });
  }
});

// ─── Commands ──────────────────────────────────────────────────
bot.command("start", (ctx) => commandHandler.handleStart(ctx));
bot.command("durum", (ctx) => commandHandler.handleDurum(ctx));
bot.command("ajanda", (ctx) => commandHandler.handleAjanda(ctx));
bot.command("personel", (ctx) => commandHandler.handleStaff(ctx));
bot.command("kayit", (ctx) => commandHandler.handleRegister(ctx));
bot.command("sil", (ctx) => commandHandler.handleRemoveStaff(ctx));
bot.command("dev", (ctx) => commandHandler.handleDev(ctx));
bot.command("test_briefing", (ctx) => commandHandler.handleTestBriefing(ctx));
bot.command("takip", (ctx) => commandHandler.handleTakip(ctx));
bot.command("temizlik", (ctx) => commandHandler.handleTemizlik(ctx));

bot.command("doctor", async (ctx) => {
  if ((ctx as any).role !== "boss") {
    return ctx.reply("Bu komut sadece SuperAdmin icin yetkilendirilmistir.");
  }
  const statusMsg = await ctx.reply("Sistem kontrol ediliyor...");
  const report = await doctorService.checkSystem();
  await bot.api.editMessageText(ctx.chat.id, statusMsg.message_id, report, {
    parse_mode: "HTML",
  });
});

bot.command("kaizen", async (ctx) => {
  if ((ctx as any).role !== "boss") return;
  await ctx.reply(
    `Kaizen Durumu\n\nAktif Prompt: v${kaizen.getVersion()}\n` +
    `Wiki: aktif`,
  );
});

// ─── Message Handler ───────────────────────────────────────────
bot.on(
  ["message:text", "message:voice", "message:document", "message:contact"],
  (ctx) => messageHandler.handle(ctx),
);

// ─── Callback Handler ──────────────────────────────────────────
const callbackHandler = new CallbackHandler(
  bot,
  orderService,
  staffService,
  draftOrderService,
  distributionService,
  messageHandler,
);
callbackHandler.register();

// ─── Gmail Polling ─────────────────────────────────────────────
if (process.env.GMAIL_ENABLED !== "false") {
  try {
    const gmailPolling = new GmailPollingService(
      bot,
      orderService,
      staffService,
      draftOrderService,
      distributionService,
      chatId,
      bossId,
      marinaId,
    );
    gmailPolling.start();
    logger.info("Gmail polling baslatildi");
  } catch (err) {
    logger.warn({ err }, "Gmail polling baslatilamadi");
  }
}

// ─── Health Check Server ───────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      version: "3.0.0",
      uptime: process.uptime(),
      promptVersion: kaizen.getVersion(),
    }));
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

// ─── Start ─────────────────────────────────────────────────────
async function main() {
  logger.info("Sandaluci Asistan V3 (Ayca) baslatiliyor...");
  logger.info(`Prompt: v${kaizen.getVersion()}`);
  logger.info(`Dev Mode: ${DEV_MODE}`);

  server.listen(PORT, "0.0.0.0", () => {
    logger.info(`Health check: http://localhost:${PORT}/health`);

    // Cron service
    try {
      const activeSupervisorId = marinaId || bossId;
      if (activeSupervisorId && activeSupervisorId !== 0) {
        const cronService = CronService.getInstance(bot, activeSupervisorId);
        cronService.init();
        logger.info("Cron Service baslatildi");
      }
    } catch (cronErr) {
      logger.error({ err: cronErr }, "Cron Service hatasi");
    }

    // Memory service init
    memoryService.initialize().catch((err) => {
      logger.error({ err }, "Memory Service init hatasi");
    });

    // Start bot
    if (process.env.BOT_ENABLED !== "false") {
      logger.info("Bot baslatiliyor (long-polling)...");
      bot.start({
        onStart: (info) => {
          logger.info(`Bot basladi: @${info.username}`);
        },
      }).catch((e) => logger.error({ err: e }, "Bot start hatasi"));
    }
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Bot baslatma hatasi!");
  process.exit(1);
});
