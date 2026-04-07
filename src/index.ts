import { Bot, InlineKeyboard, Keyboard, InputFile } from "grammy";
import * as fs from "fs";
import * as path from "path";
import http from "http";
import * as dotenv from "dotenv";
import { MessageHandler } from "./handlers/message.handler";
import { CommandHandler } from "./handlers/command.handler";
import { OrderService } from "./utils/order.service";
import { StaffService } from "./utils/staff.service";
import { XlsxUtils } from "./utils/xlsx-utils";
import { DraftOrderService } from "./utils/draft-order.service";
import { t, getUserLanguage, translateDepartment } from "./utils/i18n";
import { DoctorService } from "./utils/doctor.service";
import { memoryService } from "./utils/memory.service";
import { logger } from "./utils/logger";
import { CronService } from "./utils/cron.service";

// --- Dinamik Ayarlar ve Yardımcılar ---
const MANUAL_DEPARTMENTS = [
  "Dikişhane",
  "Döşemehane",
  "Dikiş",
  "Döşeme",
  "Швейный цех",
  "Обивочный цех",
  "Швейный",
  "Обивочный",
  "Sewing",
  "Upholstery",
];
const isManualDept = (dept: string) => {
  const d = (dept || "").toLowerCase().trim();
  if (!d) return false;
  return MANUAL_DEPARTMENTS.some((manual) => {
    const m = manual.toLowerCase();
    return d.includes(m) || m.includes(d);
  });
};

// Departman bazlı ürün dökümü — son raporda kullanılır
function buildDistributionSummary(order: any): string {
  const deptMap = new Map<
    string,
    { product: string; qty: number; details: string }[]
  >();
  for (const item of order.items) {
    const d = item.department as string;
    if (!deptMap.has(d)) deptMap.set(d, []);
    deptMap.get(d)!.push({
      product: item.product,
      qty: item.quantity,
      details: item.details || "",
    });
  }
  const deptEmoji: Record<string, string> = {
    "Karkas Üretimi": "🔩",
    Boyahane: "🎨",
    Kumaş: "🧶",
    Dikişhane: "🧵",
    Döşemehane: "🪑",
    Satınalma: "🛒",
    "Metal Üretimi": "⚙️",
  };
  let s = `━━━━━━━━━━━━━━━━━━━━\n`;
  for (const [dept, items] of deptMap) {
    const emoji = deptEmoji[dept] || "📦";
    const ruDept = translateDepartment(dept, "ru");
    s += `${emoji} <b>${ruDept}</b> (${items.length} изд.)\n`;
    for (const it of items) {
      s += `   • ${it.product} — <b>${it.qty} шт.</b>`;
      if (it.details) s += `\n     <i>${it.details}</i>`;
      s += `\n`;
    }
  }
  s += `━━━━━━━━━━━━━━━━━━━━`;
  return s;
}

const getDeptButtonLabel = (dept: string, isAssigned: boolean = false) => {
  const action = isAssigned ? "Изменить" : "Выбрать";
  if (dept.toLowerCase().includes("dikiş")) return `🧵 Швея — ${action}`;
  if (dept.toLowerCase().includes("döşeme")) return `🪑 Обивщик — ${action}`;
  if (dept.toLowerCase().includes("satın")) return `🛒 Закупки — ${action}`;
  return `${dept} — ${action}`;
};

// Çevresel değişkenleri yükle
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token) {
  console.error(
    "❌ TELEGRAM_BOT_TOKEN bulunamadı! Lütfen .env dosyasını kontrol edin.",
  );
  process.exit(1);
}

// Bot ve Handler'ları başlatalım
const bot = new Bot(token);

// --- Hata Yönetimi (Global) ---
bot.catch((err) => {
  const ctx = err.ctx;
  const errorMsg = (err.error as any)?.message || String(err.error);
  const isCriticalError =
    /connection|token|database|auth|invalid|encontrado/i.test(errorMsg);

  logger.error(
    {
      error: err.error,
      update: ctx.update,
      userId: ctx.from?.id,
      isCritical: isCriticalError,
    },
    isCriticalError
      ? "🚨 KRİTİK Bot Hatası Yakalandı!"
      : "❌ Bot Hatası Yakalandı!",
  );

  // Kritik sistem hatalarında yöneticiye acil bildirim
  if (isCriticalError && bossId) {
    const criticalMsg = `🚨 <b>KRİTİK SİSTEM HATASI</b>\n\n<code>${errorMsg}</code>\n\n<i>Update ID: ${ctx.update?.update_id || "bilinmiyor"}</i>\n<i>User: ${ctx.from?.id || "bilinmiyor"}</i>`;
    bot.api
      .sendMessage(bossId, criticalMsg, { parse_mode: "HTML" })
      .catch(() => {});
  }

  // Kullanıcıya bilgi ver
  if (ctx.from) {
    bot.api
      .sendMessage(
        ctx.from.id,
        "⚠️ Üzgünüm, bir bağlantı hatası oluştu. Lütfen tekrar deneyin.",
      )
      .catch(() => {});
  }
});

const staffService = StaffService.getInstance();
const draftOrderService = DraftOrderService.getInstance();
const orderService = OrderService.getInstance();
const messageHandler = new MessageHandler();
const commandHandler = new CommandHandler();
const doctorService = new DoctorService();

// Mükerrer mesaj kontrolü için son gönderilen mesajları takip et
const recentMessages = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 5000; // 5 saniye içinde aynı mesajı tekrar gönderme

function generateMessageHash(content: string, targetId: string): string {
  return `${targetId}_${content.length}_${content.substring(0, 50)}`;
}

async function sendMessageWithDuplicateCheck(
  targetId: number,
  message: string,
  options?: any,
): Promise<void> {
  const hash = generateMessageHash(message, targetId.toString());
  const now = Date.now();
  const lastSent = recentMessages.get(hash);

  if (lastSent && now - lastSent < DUPLICATE_WINDOW_MS) {
    logger.warn(
      { targetId, hash },
      "Mükerrer mesaj engellendi (5sn içinde tekrar)",
    );
    return;
  }

  recentMessages.set(hash, now);
  try {
    await bot.api.sendMessage(targetId, message, options);
  } catch (sendErr) {
    const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
    logger.warn(
      { err: sendErr, targetId, hash, error: errMsg },
      "⚠️ sendMessageWithDuplicateCheck hatası (bildirim gönderilmedi - spam önleme)",
    );
  }

  // Eski kayıtları temizle (10 dakikadan eski)
  const tenMinutesAgo = now - 10 * 60 * 1000;
  for (const [key, timestamp] of recentMessages.entries()) {
    if (timestamp < tenMinutesAgo) {
      recentMessages.delete(key);
    }
  }
}

// Çevresel değişkenlerden ID'leri temizleyerek alalım
const bossIdsRaw = (process.env.TELEGRAM_BOSS_ID || "")
  .split(",")
  .map((id) => id.trim().replace(/['"]/g, ""))
  .filter((id) => id !== "");
const marinaIdsRaw = (process.env.TELEGRAM_MARINA_ID || "")
  .split(",")
  .map((id) => id.trim().replace(/['"]/g, ""))
  .filter((id) => id !== "");

// CRITICAL: Eğer Marina ID'si belirtilmemişse, yedek olarak BOSS_ID kullanıyoruz.
// Bu sayede butonlar 'undefined' bir ID'ye gitmeye çalışıp kaybolmaz.
const marinaId = Number(marinaIdsRaw[0]) || Number(bossIdsRaw[0]) || 0;
const bossId = Number(bossIdsRaw[0]) || 0;

console.log(`👤 Sistem Yöneticileri (Patronlar): ${bossIdsRaw.join(", ")}`);
console.log(`👤 Yönetici Asistanı (Marina): ${marinaId} (Yedek: ${bossId})`);

// Güvenlik & Rol Yönetimi Katmanı
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const isBoss = staffService.isBoss(userId);
  const isCoordinator = staffService.isCoordinator(userId);
  let staffMember = staffService.getStaffByTelegramId(userId);

  // KRİTİK: Eğer kişi PATRON ise ama henüz veritabanında (staff.json) yoksa, OTOMATİK KAYDET.
  // Bu sayede Barış Bey asla 'Seni tanımıyorum' mesajı almaz.
  if (isBoss && !staffMember) {
    try {
      console.log(
        `🚀 [Patron Tanıma] Barış Bey (${userId}) sisteme otomatik kaydediliyor...`,
      );
      await staffService.registerStaff(
        userId,
        "Barış",
        "Yönetim",
        undefined,
        "SuperAdmin",
        "tr",
      );
      staffMember = staffService.getStaffByTelegramId(userId); // Tekrar çekelim
    } catch (regErr) {
      console.error(
        "⚠️ Patron otomatik kaydedilemedi, yerel veriyle devam ediliyor:",
        regErr,
      );
    }
  }

  const isRegisteredStaff = !!staffMember;
  const username = ctx.from?.username || "Bilinmiyor";

  // Context'e rol bilgisini ekleyelim
  (ctx as any).role = isBoss
    ? "boss"
    : isCoordinator
      ? "coordinator"
      : isRegisteredStaff
        ? "staff"
        : "guest";
  (ctx as any).staffInfo = staffMember;

  const text = ctx.message?.text || "";
  const isRegisterCommand = text.startsWith("/kayit");
  const isRemoveCommand = text.startsWith("/sil");
  const isStartCommand = text.startsWith("/start");

  // KRİTİK GÜVENLİK: Kayıt ve Silme sadece patrona açık
  if ((isRegisterCommand || isRemoveCommand) && !isBoss) {
    console.log(
      `🚫 ENGELLENDİ: Yetkisiz kayıt/silme denemesi. UserID=${userId}, Username=@${username}`,
    );
    return ctx.reply(
      "❌ Bu işlem sadece Barış Bey (Patron) tarafından gerçekleştirilebilir.",
    );
  }

  // Özel patron tanıma cümlesi (Fuzzy Match / Esnek Eşleşme - "ben barş", "ben baris" vb.)
  const normalizedText = text.toLowerCase().trim();
  const bossRegex = /ben\s*(bar[ıisş])|id\s*(kontro[l]*)/i;
  const isSpecialPhrase = bossRegex.test(normalizedText);

  if (isSpecialPhrase && isBoss) {
    if (!staffService.isBossRecognizedInMemory()) {
      await staffService.setBossRecognizedInMemory();
      return ctx.reply(
        `✅ **Sistem Sizi Tanıdı Barış Bey.**\n\n📌 **ID:** \`${userId}\`\n🛡️ **Rol:** \`SuperAdmin\`\n🌐 **Dil:** \`Türkçe (tr)\`\n\nBu tanışmayı hafızama kaydettim (memory.md). Sandaluci personeli artık otomatik selamlanmayacak, sadece size özel bir sistem kuruldu.`,
        { parse_mode: "Markdown" },
      );
    } else {
      return ctx.reply("Buyurun Barış Bey, sizi dinliyorum. 👋");
    }
  }

  if (isBoss || isRegisteredStaff || isRegisterCommand || isStartCommand) {
    return next();
  }

  // Yetkisiz erişim logu - Botun neden cevap vermediğini anlamak için kritik
  console.log(
    `⚠️  YETKİSİZ ERİŞİM: UserID=${userId}, Username=@${username}, Role=${(ctx as any).role}, Text=${ctx.message?.text || "Mesaj metni yok"}`,
  );

  // Yetkisiz erişim denemesi
  if (ctx.chat?.type === "private") {
    // Sadece /start komutuna cevap verelim, rastgele mesajlara "hoş geldiniz" demesin (Gizlilik kuralı)
    if (!isStartCommand) {
      console.log(
        `🔇 SESSİZ REDDEDİLDİ: GUEST user ${userId} mesajına cevap verilmedi.`,
      );
      return;
    }

    const userLangCode = ctx.from?.language_code === "ru" ? "ru" : "tr";
    const welcomeMsg = t("welcome_guest", userLangCode, {
      id: userId.toString(),
    });
    const btnLabel = t("btn_share_phone", userLangCode);

    const keyboard = new Keyboard()
      .requestContact(btnLabel)
      .oneTime()
      .resized();

    await ctx.reply(welcomeMsg, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
});

// Komutlar
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
    return ctx.reply(
      "❌ Bu komut sadece Barış Bey (SuperAdmin) için yetkilendirilmiştir.",
    );
  }
  const statusMsg = await ctx.reply(
    "🩺 <b>Sistem damarları kontrol ediliyor...</b> Lütfen bekleyin.",
    { parse_mode: "HTML" },
  );
  const report = await doctorService.checkSystem();
  await bot.api.editMessageText(
    ctx.chat.id,
    statusMsg.message_id,
    `🩺 <b>Sistem Kontrol Raporu</b>\n\n${report}`,
    { parse_mode: "HTML" },
  );
});

// Mesaj Handlerı (Metin, Ses, Döküman ve Kişi desteği)
bot.on(
  ["message:text", "message:voice", "message:document", "message:contact"],
  (ctx) => messageHandler.handle(ctx),
);

// Callback Query Handlerı
// Callback Query Handlerı (Merkezi Mantık - index.ts)
bot.callbackQuery(/^select_dept_staff:(.+)\|(.+)$/, async (ctx) => {
  const draftId = ctx.match[1] as string;
  const deptName = ctx.match[2] as string;
  const staffList = staffService.getStaffByDepartment(deptName);
  if (staffList.length === 0) {
    return ctx.answerCallbackQuery(
      `⚠️ В отделе ${deptName} нет зарегистрированных сотрудников.`,
    );
  }

  const keyboard = new InlineKeyboard();
  staffList.forEach((s) => {
    keyboard.text(s.name, `aw:${draftId}:${deptName}:${s.name}`).row();
  });
  keyboard.text("🔙 Назад", `back_to_draft:${draftId}`);

  await ctx.editMessageText(
    `👤 <b>${deptName}</b> — выберите сотрудника:\n\n<i>Выберите имя из списка.</i>`,
    { parse_mode: "HTML", reply_markup: keyboard },
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^aw:(.+):(.+):(.+)$/, async (ctx) => {
  const draftId = ctx.match[1] as string;
  const deptName = ctx.match[2] as string;
  const staffName = ctx.match[3] as string;

  const draft = draftOrderService.getDraft(draftId);
  if (!draft)
    return ctx.answerCallbackQuery("❌ Черновик не найден или истёк.");

  // Taslaktaki o departmana ait TÜM kalemlere bu işçiyi ata
  draft.order.items.forEach((item: any) => {
    if (item.department === deptName) {
      item.assignedWorker = staffName;
      item.status = "uretimde";
      item.distributedAt = new Date().toISOString();
    }
  });

  await ctx.answerCallbackQuery(`✅ ${staffName} назначен(а).`);

  // Marina'ya güncel durumu göster
  const visualReport = orderService.generateVisualTable(draft.order);
  const keyboard = new InlineKeyboard();

  const remainingDepts = Array.from(
    new Set(
      draft.order.items
        .filter((i: any) => isManualDept(i.department) && !i.assignedWorker)
        .map((i: any) => i.department),
    ),
  );

  remainingDepts.forEach((d: any) => {
    keyboard
      .text(getDeptButtonLabel(d, false), `select_dept_staff:${draftId}|${d}`)
      .row();
  });

  if (remainingDepts.length === 0) {
    keyboard
      .text("🚀 ЗАПУСТИТЬ ПРОИЗВОДСТВО", `finalize_dist:${draftId}`)
      .row();
  }
  keyboard.text("❌ Отменить", `reject_order:${draftId}`);

  await ctx.editMessageText(
    `✅ ${deptName} → <b>${staffName}</b> назначен(а).\n\n${visualReport}`,
    {
      parse_mode: "HTML",
      reply_markup: keyboard,
    },
  );
});

bot.callbackQuery(/^finalize_dist:(.+)$/, async (ctx) => {
  const draftId = ctx.match[1] as string;
  const draft = draftOrderService.getDraft(draftId);
  if (!draft) return ctx.answerCallbackQuery("❌ Черновик не найден.");

  const unassignedManualDepts = Array.from(
    new Set(
      draft.order.items
        .filter((i: any) => isManualDept(i.department) && !i.assignedWorker)
        .map((i: any) => i.department),
    ),
  );

  if (unassignedManualDepts.length > 0) {
    return ctx.answerCallbackQuery(
      `⚠️ Сначала назначьте сотрудников: ${unassignedManualDepts.join(", ")}`,
    );
  }

  await ctx.answerCallbackQuery("🚀 Производство запускается...");

  // 1. Manuel departmanlara (atanmış işçisi olanlar) PDF gönder
  const assignedDepts = Array.from(
    new Set(
      draft.order.items
        .filter((i: any) => i.assignedWorker)
        .map((i: any) => i.department as string),
    ),
  ) as string[];

  const onlyManual = assignedDepts.filter((d) => isManualDept(d));

  // FIX: Auto departmanları da gönder (Karkas, Boyahane vb. atlanmasın)
  const autoDepts = (
    Array.from(
      new Set(draft.order.items.map((i: any) => i.department as string)),
    ) as string[]
  ).filter((d) => !isManualDept(d));

  // Üretim akış sırası: Satınalma → Karkas → Boyahane → Kumaş → Dikişhane → Döşemehane
  const DEPT_FLOW_ORDER = [
    "Satınalma",
    "Karkas Üretimi",
    "Metal Üretimi",
    "Boyahane",
    "Kumaş",
    "Dikişhane",
    "Döşemehane",
  ];
  const allDeptsToSend = [...new Set([...onlyManual, ...autoDepts])].sort(
    (a, b) => {
      const ai = DEPT_FLOW_ORDER.findIndex(
        (d) => a.includes(d) || d.includes(a),
      );
      const bi = DEPT_FLOW_ORDER.findIndex(
        (d) => b.includes(d) || d.includes(b),
      );
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    },
  );

  let report = { success: [] as string[], failed: [] as string[] };
  if (allDeptsToSend.length > 0) {
    report = await processOrderDistribution(
      draft.order,
      draft.images || [],
      draft.excelRows || [],
      undefined,
      allDeptsToSend,
      false,
    );
  }

  // Marina'ya durumu bildir
  const visualReport = orderService.generateVisualTable(draft.order);
  let statusMsg = "🚀 <b>Отчёт о распределении заказа</b>\n\n";

  if (report.success.length > 0) {
    statusMsg += `✅ <b>Отправлено:</b> ${report.success.map((d) => translateDepartment(d, "ru")).join(", ")}\n`;
  }
  if (report.failed.length > 0) {
    statusMsg += `❌ <b>ОШИБКА:</b> ${report.failed.map((d) => translateDepartment(d, "ru")).join(", ")}\n`;
  }
  if (report.success.length === 0 && report.failed.length === 0) {
    statusMsg += "ℹ️ Дополнительное распределение не выполнялось.\n";
  }

  statusMsg += `\n${buildDistributionSummary(draft.order)}\n\n${visualReport}`;

  await ctx.editMessageText(statusMsg, { parse_mode: "HTML" });

  // Dağıtım tamamlandı — sessiz kayıt, patron bildirim almaz
  console.log(`✅ [FLOW] Finalize tamamlandı: ${draft.order.orderNumber}`);
  draftOrderService.removeDraft(draftId);
});

bot.callbackQuery(/^auto_distribute:(.+)$/, async (ctx) => {
  // auto_distribute butonu finalize_dist ile aynı işi görsün
  const draftId = ctx.match[1] as string;
  const draft = draftOrderService.getDraft(draftId);
  if (!draft) return ctx.answerCallbackQuery("❌ Черновик не найден.");

  const hasManual = draft.order.items.some((i: any) =>
    isManualDept(i.department),
  );
  if (!hasManual) {
    // Manuel dept yok — tüm auto deptlere gönder
    const autoDepts = (
      Array.from(
        new Set(draft.order.items.map((i: any) => i.department as string)),
      ) as string[]
    ).filter((d) => !isManualDept(d));

    if (autoDepts.length > 0) {
      await processOrderDistribution(
        draft.order,
        draft.images || [],
        draft.excelRows || [],
        undefined,
        autoDepts,
        false,
      );
    }

    // Sessiz kayıt — boss bildirim almaz
    console.log(
      `✅ [FLOW] Auto-distribute tamamlandı: ${draft.order.orderNumber}`,
    );
    await ctx.editMessageText("✅ Sipariş dağıtıldı.");
    draftOrderService.removeDraft(draftId);
  } else {
    await ctx.answerCallbackQuery(
      "⚠️ Lütfen önce manuel departmanlar için personel seçin.",
    );
  }
});

bot.callbackQuery(/^back_to_draft:(.+)$/, async (ctx) => {
  const draftId = ctx.match[1] as string;
  const draft = draftOrderService.getDraft(draftId);
  if (!draft) return ctx.answerCallbackQuery("❌ Черновик не найден.");

  const visualReport = orderService.generateVisualTable(draft.order);
  const keyboard = new InlineKeyboard();

  const deptsInOrder = Array.from(
    new Set(draft.order.items.map((i: any) => i.department as string)),
  ) as string[];
  const relevantManual = deptsInOrder.filter((d) => isManualDept(d));

  relevantManual.forEach((d) => {
    const isAssigned = draft.order.items.some(
      (i: any) => i.department === d && i.assignedWorker,
    );
    keyboard
      .text(
        getDeptButtonLabel(d, isAssigned),
        `select_dept_staff:${draftId}|${d}`,
      )
      .row();
  });

  const remaining = draft.order.items.filter(
    (i: any) => isManualDept(i.department) && !i.assignedWorker,
  );

  if (remaining.length === 0) {
    keyboard
      .text("🚀 ЗАПУСТИТЬ ПРОИЗВОДСТВО", `finalize_dist:${draftId}`)
      .row();
  }

  // YENİ: Miktarları Bölüştürme Butonu
  if (relevantManual.length > 0) {
    relevantManual.forEach((d) => {
      keyboard
        .text(
          `📊 Bölüştür: ${translateDepartment(d, "ru")}`,
          `split_mode:${draftId}:${d}`,
        )
        .row();
    });
  }

  keyboard.text("❌ Отменить", `reject_order:${draftId}`);

  await ctx.editMessageText(`📝 <b>Черновик заказа</b>\n\n${visualReport}`, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
});


// --- BÖLÜŞTÜRMELİ DAĞITIM (YENİ) ---
const waitingForSplitInput = new Map<number, { draftId: string, dept: string }>();

bot.callbackQuery(/^split_mode:(.+):(.+)$/, async (ctx) => {
  const draftId = ctx.match[1];
  const dept = ctx.match[2];
  const draft = draftOrderService.getDraft(draftId);
  
  if (!draft) return ctx.answerCallbackQuery("❌ Черновик не найден.");

  const staffList = staffService.getStaffByDepartment(dept);
  const staffNames = staffList.map(s => s.name).join(", ");
  const totalQty = draft.order.items
    .filter((i: any) => i.department === dept)
    .reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);

  waitingForSplitInput.set(ctx.from.id, { draftId, dept });

  await ctx.editMessageText(
    `📊 <b>${dept} Dağıtımı</b>\n` +
    `Toplam Adet: <b>${totalQty}</b>\n` +
    `Personeller: <i>${staffNames}</i>\n\n` +
    `Lütfen miktarları şu formatta girin:\n` +
    `<code>İsim: Miktar, İsim: Miktar</code>\n\n` +
    `Örnek: <code>Dikiş Test 1: 15, Dikiş Test 2: 15</code>`,
    { parse_mode: "HTML" }
  );
  await ctx.answerCallbackQuery();
});

// Marina'nın metin bazlı dağıtımını işleyen handler
bot.on("message:text", async (ctx, next) => {
  const waiter = waitingForSplitInput.get(ctx.from.id);
  if (!waiter) return next();

  const { draftId, dept } = waiter;
  const draft = draftOrderService.getDraft(draftId);
  if (!draft) {
    waitingForSplitInput.delete(ctx.from.id);
    return ctx.reply("❌ Черновик не найден.");
  }

  const text = ctx.message.text; // Örn: Dikiş 1: 15, Dikiş 2: 15
  const parts = text.split(",").map(p => p.trim());
  
  const assignments: { staffName: string, qty: number }[] = [];
  let totalInputQty = 0;

  for (const part of parts) {
    const match = part.match(/^(.+):\s*(\d+)$/);
    if (!match) {
      return ctx.reply(`❌ Format hatalı: "${part}"\nDoğru format: İsim: Miktar, İsim: Miktar`);
    }
    const staffName = match[1].trim();
    const qty = parseInt(match[2]);
    assignments.push({ staffName, qty });
    totalInputQty += qty;
  }

  // Adet Kontrolü
  const originalDeptQty = draft.order.items
    .filter((i: any) => i.department === dept)
    .reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);

  if (totalInputQty > originalDeptQty) {
    return ctx.reply(`⚠️ Girdiğiniz toplam adet (${totalInputQty}), siparişteki toplam adetten (${originalDeptQty}) fazla.`);
  }

  // Dağıtım İşlemi
  await ctx.reply("⏳ Dağıtım başlatılıyor, iş emirleri oluşturuluyor...");
  
  for (const assign of assignments) {
    const staff = staffService.getStaffByName(assign.staffName);
    if (!staff) {
      await ctx.reply(`⚠️ Personel bulunamadı: ${assign.staffName}. Atlanıyor.`);
      continue;
    }

    // Sub-order oluştur ve gönder (Parametre sırası: order, staffName, quantity, dept)
    const subOrder = orderService.createSubOrderForStaff(
      draft.order,
      staff.name,
      assign.qty,
      dept
    );
    
    // İş emrini personele gönder (assignedWorker subOrder içinde olduğu için ID'yi otomatik bulur)
    await processOrderDistribution(
      subOrder,
      draft.images || [],
      draft.excelRows || [],
      undefined, // manualAssignments yerine internal assignedWorker kullanılır
      [dept],
      false
    );


    // Draft içinde bu personelin atamasını (en azından bir tanesini) işaretleyelim ki "Tamam" gibi gözüksün
    draft.order.items.forEach((item: any) => {
      if (item.department === dept && !item.assignedWorker) {
          item.assignedWorker = staff.name; // Basit bir işaretleme
      }
    });
  }

  waitingForSplitInput.delete(ctx.from.id);
  await ctx.reply(`✅ ${dept} departmanı için dağıtım tamamlandı.`, {
    reply_markup: new InlineKeyboard().text("⬅️ Geri", `back_to_draft:${draftId}`)
  });
});


bot.callbackQuery(/^reject_order:(.+)$/, async (ctx) => {

  const draftId = ctx.match[1] as string;
  draftOrderService.removeDraft(draftId);
  await ctx.editMessageText("❌ Черновик заказа отменён.");
  await ctx.answerCallbackQuery();
});

// --- Diğer Callbackleri ---
bot.callbackQuery(/^fabric_ok:(.+)$/, async (ctx) => {
  const itemId = ctx.match[1];
  const lang = getUserLanguage((ctx as any).role);
  await orderService.updateItemStatus(itemId, "uretimde");
  await ctx.editMessageText(`✅ ${t("fabric_ok_msg", lang)}`);
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^fabric_fail:(.+)$/, async (ctx) => {
  const lang = getUserLanguage((ctx as any).role);
  await ctx.editMessageText(`⚠️ ${t("fabric_fail_msg", lang)}`);
  await ctx.answerCallbackQuery();
});

bot.on("callback_query:data", (ctx) => messageHandler.handleCallback(ctx));

/**
 * OTOMATİK DEĞERLENDİRME VE DAĞITIM YARDIMCI FONKSİYONU
 */
async function processOrderDistribution(
  order: any,
  images: any[],
  excelRows: any[],
  manualAssignments: Record<string, number> | undefined,
  targetDepts: string[],
  _isDraft: boolean = false,
): Promise<{ success: string[]; failed: string[] }> {
  const report = { success: [] as string[], failed: [] as string[] };

  for (const currentDept of targetDepts) {
    const deptItems = order.items
      .filter((i: any) => i.department === currentDept)
      .sort((a: any, b: any) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));
    if (deptItems.length === 0) continue;

    const _deptMsg = orderService.generateDeptView(
      deptItems,
      order.customerName as string,
      currentDept,
    );

    try {
      const pdfBuffer = await orderService.generateJobOrderPDF(
        deptItems as any[],
        order.customerName || "Bilinmiyor / Неизвестно",
        currentDept,
      );
      await orderService.archivePDF(currentDept, pdfBuffer);

      const safeCustomerName = (order.customerName || "Bilinmiyor")
        .replace(/[^a-zA-Z0-9]/g, "_")
        .substring(0, 30);
      const pdfFileName = `${safeCustomerName}_${currentDept}_Is_Emri.pdf`;

      let targetIds: number[] = [];

      // Eğer itemlarda atanmış bir işçi varsa (özellikle manuel departmanlar için)
      const assignedWorkerName = deptItems.find(
        (i: any) => i.assignedWorker,
      )?.assignedWorker;

      if (assignedWorkerName) {
        const staff = staffService
          .getAllStaff()
          .find((s) => s.name === assignedWorkerName);
        if (staff?.telegramId) {
          targetIds = [staff.telegramId];
        }
      }

      // Eğer hala boşsa (otomatik departmanlar veya atama yapılmamışsa)
      if (targetIds.length === 0) {
        if (manualAssignments && manualAssignments[currentDept]) {
          targetIds = [manualAssignments[currentDept]];
        } else {
          const departmentalStaffIds = staffService
            .getStaffByDepartment(currentDept)
            .map((s) => s.telegramId)
            .filter((id) => !!id) as number[];

          if (departmentalStaffIds.length > 0) {
            targetIds = departmentalStaffIds;
          } else {
            // Hiç kimse bulunamadıysa Marina'ya gönder
            console.log(
              `⚠️ ${currentDept} için personel yok, Marina'ya gönderiliyor.`,
            );
            targetIds = [bossId || Number(marinaId)];
          }
        }
      }

      let sentCount = 0;
      let lastPdfError = "";
      for (const targetId of targetIds) {
        if (!targetId) continue;

        const staff = staffService.getStaffByTelegramId(targetId);
        // Marina'ya giden Satınalma (Plastik) iş emirleri mutlaka RU olmalı
        const lang =
          currentDept.toLowerCase() === "satınalma" ||
          currentDept.toLowerCase().includes("boya")
            ? "ru"
            : staff?.language || "ru";

        try {
          await bot.api.sendDocument(
            targetId,
            new InputFile(pdfBuffer, pdfFileName),
            {
              caption: `📄 <b>${translateDepartment(currentDept, lang)}</b> - ${lang === "ru" ? "Заказ на производство" : "İş Emri Dosyası"} (PDF)`,
              parse_mode: "HTML",
            },
          );
          sentCount++;
        } catch (pdfSendErr) {
          const errMsg =
            pdfSendErr instanceof Error
              ? pdfSendErr.message
              : String(pdfSendErr);
          lastPdfError = errMsg;
          logger.error(
            { err: pdfSendErr, dept: currentDept, targetId },
            `❌ PDF dosyası gönderilemedi (${currentDept} → ${targetId}): ${errMsg}`,
          );
        }

        if (staff) {
          for (const dItem of deptItems) {
            if (dItem.status === "bekliyor") {
              await orderService.updateItemStatus(dItem.id, "uretimde");
            }
          }
        }
      }

      if (sentCount > 0) {
        report.success.push(currentDept);
      } else {
        const failReason = lastPdfError || "Tüm alıcılara gönderim başarısız";
        logger.error(
          { dept: currentDept, reason: failReason, targetIds },
          `❌ ${currentDept} departmanına gönderim tümüyle başarısız: ${failReason}`,
        );
        report.failed.push(`${currentDept} (${failReason})`);
      }
    } catch (distError) {
      const errMsg =
        distError instanceof Error ? distError.message : String(distError);
      const stackTrace =
        distError instanceof Error ? distError.stack : undefined;
      logger.error(
        { err: distError, dept: currentDept, stack: stackTrace },
        `❌ Dağıtım hatası (${currentDept}): ${errMsg}`,
      );
      report.failed.push(`${currentDept} (${errMsg})`);
    }
  }

  // Eğer tüm departmanlar failed olursa boss'a kritik bildirim gönder
  if (report.success.length === 0 && report.failed.length > 0 && bossId) {
    const criticalMsg =
      `🚨 <b>kritik Dağıtım Hatası</b>\n\n` +
      `<b>Sipariş:</b> ${order.orderNumber || "bilinmiyor"}\n` +
      `<b>Müşteri:</b> ${order.customerName || "bilinmiyor"}\n` +
      `<b>Başarısız Departmanlar:</b>\n${report.failed.map((f) => `  • ${f}`).join("\n")}\n\n` +
      `<i>Tüm departmanlara dağıtım başarısız oldu!</i>`;
    logger.error(
      { orderNumber: order.orderNumber, failedDepts: report.failed },
      "TÜM DEPARTMANLAR FAILED - Boss bildirimi gönderiliyor",
    );
    bot.api
      .sendMessage(bossId, criticalMsg, { parse_mode: "HTML" })
      .catch(() => {});
  }

  return report;
}

/**
 * GMAIL VE SIPARIS FLOW KATMANI
 */
if (process.env.GMAIL_ENABLED !== "false") {
  const UID_STORE_PATH = path.join(
    process.cwd(),
    "data",
    "processed_uids.json",
  );
  const processedUids = new Set<string>();

  // GmailService'i içe aktar ama IIFE kullanma (zaten dosya modül seviyesinde esnext/es2022 ise sorun yok,
  // ancak tsc hatası veriyorsa inline require veya dinamik import'u fonksiyon içine alabiliriz)
  let gmailService: any;

  function loadProcessedUids() {
    try {
      if (fs.existsSync(UID_STORE_PATH)) {
        const data = fs.readFileSync(UID_STORE_PATH, "utf-8");
        const uids = JSON.parse(data);
        uids.forEach((uid: string) => processedUids.add(uid));
      }
    } catch (error) {
      logger.error({ error }, "❌ processed_uids.json yüklenemedi");
    }
  }

  function saveProcessedUids() {
    try {
      const data = JSON.stringify(Array.from(processedUids));
      if (!fs.existsSync(path.dirname(UID_STORE_PATH))) {
        fs.mkdirSync(path.dirname(UID_STORE_PATH), { recursive: true });
      }
      fs.writeFileSync(UID_STORE_PATH, data);
    } catch (error) {
      logger.error({ error }, "❌ processed_uids.json kaydedilemedi");
    }
  }

  loadProcessedUids();

  let isProcessingEmail = false;

  setInterval(async () => {
    if (isProcessingEmail) {
      logger.warn("⏳ Önceki e-posta işleme henüz bitmedi, döngü atlanıyor.");
      return;
    }
    isProcessingEmail = true;

    try {
      // Her döngü başında işlenmiş UID listesini tazeleyerek senkronizasyonu sağla
      loadProcessedUids();

      if (!gmailService) {
        const { GmailService } = await import("./utils/gmail.service");
        gmailService = GmailService.getInstance();
      }
      logger.info("🔍 Gmail kontrol ediliyor...");
      // Standart: Sadece okunmamış mesajları işle
      await gmailService.processUnreadMessages(30, async (msg: any) => {
        if (processedUids.has(msg.uid.toString())) {
          logger.info(`🔄 UID ${msg.uid} zaten işlendi, atlanıyor.`);
          return;
        }

        // Önemli: Takılmaları ve Telegram spamını önlemek için en başta işaretle
        processedUids.add(msg.uid.toString());
        saveProcessedUids();

        logger.info(
          `📩 Yeni e-posta işleniyor: ${msg.subject} (UID: ${msg.uid})`,
        );

        const emailSummary = `📧 <b>Yeni E-posta</b> \n\n<b>Gönderen:</b> ${OrderService.escapeHTML(msg.from)}\n<b>Konu:</b> ${OrderService.escapeHTML(msg.subject)}`;
        logger.info(`💬 Telegram bildirimi gönderiliyor: ${chatId}`);
        try {
          if (chatId) {
            await sendMessageWithDuplicateCheck(
              parseInt(chatId),
              emailSummary,
              { parse_mode: "HTML" },
            );
            console.log("✅ E-posta özeti Telegram'a gönderildi.");
          }
        } catch (tgError) {
          logger.error(
            { err: tgError },
            "Telegram bildirim hatası (Email Summary)",
          );
        }

        const images =
          msg.attachments?.filter(
            (attr: any) =>
              attr.contentType?.startsWith("image/") ||
              /\.(jpg|png|jpeg)$/i.test(attr.filename),
          ) || [];

        let excelProcessed = false;
        if (msg.attachments && msg.attachments.length > 0) {
          for (const attr of msg.attachments) {
            if (/\.xlsx?$/i.test(attr.filename)) {
              const filename = attr.filename;
              logger.info(`🔍 Excel dosyası ayrıştırılıyor: ${filename}`);
              try {
                const excelRows = await XlsxUtils.parseExcel(attr.content);
                const promptData = excelRows.map((r: any) => {
                  const copy = { ...r };
                  delete copy._imageBuffer;
                  return copy;
                });

                const order = await orderService.parseAndCreateOrder(
                  msg.subject,
                  JSON.stringify(promptData, null, 2),
                  msg.uid.toString(),
                  msg.attachments,
                );

                if (!order) {
                  logger.warn(
                    { filename },
                    "⚠️ Sipariş ayrıştırılamadı (order is null)",
                  );
                  continue;
                }

                if (order.isDuplicate) {
                  logger.info(
                    { orderNumber: (order as any).orderNumber },
                    "⏭️ Mükerrer sipariş atlanıyor.",
                  );
                  excelProcessed = true; // TEXT fallback'ın çalışmasını engelle
                  continue;
                }

                console.log(
                  `🚀 [FLOW] Sipariş işleme süreci başlıyor: ${order.orderNumber}`,
                );

                try {
                  await orderService.archiveOrderFile(
                    attr.filename,
                    attr.content,
                  );
                } catch (archErr) {
                  console.error("❌ [FLOW] Arşivleme hatası:", archErr);
                }

                orderService
                  .saveToVisualMemory(order)
                  .catch((e: any) =>
                    logger.warn({ err: e }, "⚠️ Görsel hafıza hatası."),
                  );

                // Gerekli değişkenlerin tanımlanması
                const draftId = `draft_${Date.now()}`;
                draftOrderService.saveDraft(draftId, { order, images });

                const visualReport = orderService.generateVisualTable(order);
                if (!marinaId) {
                  console.error("❌ marinaId (Patron/Süpervizör) eksik!");
                  continue;
                }

                const fabricItems = order.items.filter((i: any) =>
                  i.department.toLowerCase().includes("kumaş"),
                );
                const hasManualDepts = order.items.some((i: any) =>
                  isManualDept(i.department),
                );

                // PDF Önizleme Resmi Oluşturma (Opsiyonel)
                let pdfPreviewImg: Buffer | undefined;
                try {
                  // Burada preview generation logic varsa eklenebilir, şimdilik undefined
                } catch {}

                const autoDepts = Array.from(
                  new Set(order.items.map((i: any) => i.department)),
                ).filter((d: any) => !isManualDept(d)) as string[];

                // --- SİLSİLE (TIMING) BAŞLANGICI ---
                // 1. ADIM: ANINDA OTOMATİK departmanlara gönder
                if (autoDepts.length > 0) {
                  const autoDistPromise = (async () => {
                    try {
                      console.log(
                        `🚀 [FLOW] Otomatik birimler işleniyor... (${order.orderNumber})`,
                      );
                      const report = await processOrderDistribution(
                        order,
                        images,
                        excelRows,
                        undefined,
                        autoDepts,
                        false,
                      );
                      // Bildirim metni oluştur
                      const totalDepts =
                        report.success.length + report.failed.length;
                      if (totalDepts > 0) {
                        let notifyMsg = `🚀 <b>Автоматическое распределение:</b>\n`;
                        if (report.success.length > 0) {
                          notifyMsg += `✅ Отправлено: ${report.success.join(", ")}\n`;
                        }
                        if (report.failed.length > 0) {
                          notifyMsg += `⚠️ Ошибка: ${report.failed.join(", ")}\n`;
                        }

                        await bot.api.sendMessage(marinaId, notifyMsg, {
                          parse_mode: "HTML",
                        });
                      }

                      return report;
                    } catch (autoErr) {
                      const errMsg =
                        autoErr instanceof Error
                          ? autoErr.message
                          : String(autoErr);
                      logger.error(
                        { err: autoErr, orderNumber: order.orderNumber },
                        `❌ [FLOW] Otomatik dağıtım hatası: ${errMsg}`,
                      );
                      throw autoErr;
                    }
                  })();
                  // Promise'i beklemeden devam et, hataları yakala
                  autoDistPromise.catch((err) => {
                    console.error("❌ [AUTO_DIST] Hata:", err);
                  });
                }

                // 2. ADIM: ANINDA — Manuel dept varsa atama UI gönder
                if (hasManualDepts) {
                  (async () => {
                    const keyboard = new InlineKeyboard();
                    const deptsToAssign = Array.from(
                      new Set(
                        order.items
                          .filter((i: any) => isManualDept(i.department))
                          .map((i: any) => i.department as string),
                      ),
                    );

                    deptsToAssign.forEach((d) => {
                      keyboard
                        .text(
                          getDeptButtonLabel(d, false) as string,
                          `select_dept_staff:${draftId}|${d}`,
                        )
                        .row();
                    });

                    keyboard
                      .text(
                        "🚀 ЗАПУСТИТЬ ДИСТРИБУЦИЮ",
                        `auto_distribute:${draftId}`,
                      )
                      .row();
                    keyboard.text("❌ Отменить", `reject_order:${draftId}`);

                    const reportCaption = `📝 <b>Отчёт по заказу</b>\n\n${visualReport}\n\n<b>Ожидается назначение сотрудников:</b>`;
                    console.log(
                      `🚀 [FLOW] Manuel dept atama UI gönderiliyor... (${order.orderNumber})`,
                    );

                    if (pdfPreviewImg) {
                      await bot.api.sendPhoto(
                        marinaId,
                        new InputFile(pdfPreviewImg, "preview.png"),
                        {
                          caption: reportCaption,
                          parse_mode: "HTML",
                          reply_markup: keyboard,
                        },
                      );
                    } else {
                      await bot.api.sendMessage(marinaId, reportCaption, {
                        parse_mode: "HTML",
                        reply_markup: keyboard,
                      });
                    }
                  })();
                } else {
                  // Sadece otomatik deptler — Bildirim gönder
                  (async () => {
                    const finalMsg = `📝 <b>Заказ обработан автоматически</b>\n\n${visualReport}\n\n<i>Все отделы уведомлены автоматически, назначение не требуется.</i>`;
                    if (pdfPreviewImg) {
                      await bot.api.sendPhoto(
                        marinaId,
                        new InputFile(pdfPreviewImg, "preview.png"),
                        {
                          caption: finalMsg,
                          parse_mode: "HTML",
                        },
                      );
                    } else {
                      await bot.api.sendMessage(marinaId, finalMsg, {
                        parse_mode: "HTML",
                      });
                    }
                    console.log(
                      `✅ [FLOW] Sipariş tam otomatik dağıtıldı: ${order.orderNumber}`,
                    );
                  })();
                }

                // 3. ADIM: Kumaş bilgisi — sessizce kayıt (bildirim gönderilmez)
                if (fabricItems.length > 0) {
                  console.log(
                    `🧶 [FLOW] Kumaş kalemleri kayıt altına alındı: ${order.orderNumber} (${fabricItems.length} kalem)`,
                  );
                }

                excelProcessed = true;
              } catch (excelErr) {
                const errMsg =
                  excelErr instanceof Error
                    ? excelErr.message
                    : String(excelErr);
                const stack =
                  excelErr instanceof Error ? excelErr.stack : undefined;
                logger.error(
                  { err: excelErr, filename, stack, uid: msg.uid },
                  `❌ Excel işleme hatası (${filename}): ${errMsg}`,
                );
                continue;
              }
            }
          }
        }

        // ── ADIM 2: EĞER EXCEL YOKSA VEYA İŞLENEMEDİYSE TEXT ANALİZİ YAP ──────────
        if (!excelProcessed) {
          const hasImage = images && images.length > 0;
          const hasAttch = msg.attachments && msg.attachments.length > 0;
          const hasContent = msg.content && msg.content.trim().length >= 1;

          if (hasContent || hasImage || hasAttch) {
            console.log(
              `📝 [FLOW] Metin/Resim analizi başlatılıyor (UID: ${msg.uid})...`,
            );
            try {
              const order = await orderService.parseAndCreateOrder(
                msg.subject,
                msg.content,
                msg.uid.toString(),
                msg.attachments,
              );

              if (order) {
                const draftId = `draft_${Date.now()}`;
                // 'images' artık üst kapsamda (satır 897) tanımlı, ReferenceError oluşmaz
                draftOrderService.saveDraft(draftId, { order, images });
                const visualReport = orderService.generateVisualTable(order);

                const keyboard = new InlineKeyboard();
                const deptsToAssign = Array.from(
                  new Set(
                    order.items
                      .filter((i: any) =>
                        MANUAL_DEPARTMENTS.includes(i.department),
                      )
                      .map((i: any) => i.department as string),
                  ),
                );

                deptsToAssign.forEach((d) => {
                  keyboard
                    .text(
                      getDeptButtonLabel(d, false) as string,
                      `select_dept_staff:${draftId}|${d}`,
                    )
                    .row();
                });

                keyboard
                  .text(
                    "🚀 ЗАПУСТИТЬ ДИСТРИБУЦИЮ",
                    `auto_distribute:${draftId}`,
                  )
                  .row();
                keyboard.text("❌ Отменить", `reject_order:${draftId}`);

                const autoDepts = Array.from(
                  new Set(order.items.map((i: any) => i.department)),
                ).filter((d: any) => !isManualDept(d)) as string[];

                // 1. ADIM: ANINDA OTOMATİK birimler (Text)
                if (autoDepts.length > 0) {
                  const textDistPromise = (async () => {
                    try {
                      console.log(
                        `🚀 [FLOW] (Text) Otomatik birimler işleniyor... (${order.orderNumber})`,
                      );
                      const report = await processOrderDistribution(
                        order,
                        images,
                        [],
                        undefined,
                        autoDepts,
                        false,
                      );
                      if (report.failed.length > 0) {
                        logger.error(
                          {
                            orderNumber: order.orderNumber,
                            failedDepts: report.failed,
                          },
                          `⚠️ [FLOW] (Text) Otomatik dağıtımda bazı departmanlar başarısız: ${report.failed.join(", ")}`,
                        );
                      }
                      return report;
                    } catch (distErr) {
                      const errMsg =
                        distErr instanceof Error
                          ? distErr.message
                          : String(distErr);
                      logger.error(
                        { err: distErr, orderNumber: order.orderNumber },
                        `❌ [FLOW] (Text) Otomatik dağıtım hatası: ${errMsg}`,
                      );
                      throw distErr;
                    }
                  })();
                  textDistPromise.catch(() => {});
                }

                // 2. ADIM: Manuel dept varsa atama UI gönder
                const hasManualDeptsText = order.items.some((i: any) =>
                  MANUAL_DEPARTMENTS.includes(i.department),
                );
                if (hasManualDeptsText) {
                  (async () => {
                    const reportCaption = `📝 <b>Sipariş Raporu</b>\n\n${visualReport}\n\n<b>Ожидается назначение сотрудников:</b>`;
                    console.log(
                      `🚀 [FLOW] (Text) Manuel dept atama UI gönderiliyor... (${order.orderNumber})`,
                    );
                    if (marinaId) {
                      await bot.api.sendMessage(marinaId, reportCaption, {
                        parse_mode: "HTML",
                        reply_markup: keyboard,
                      });
                    }
                  })();
                }
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              logger.error(
                { err, uid: msg.uid },
                `❌ Sipariş analiz hatası (Text): ${errMsg}`,
              );
            }
          } else {
            logger.warn(
              { uid: msg.uid },
              "⚠️ Sipariş içeriği veya resim bulunamadı, atlanıyor.",
            );
          }
        }

        // Bitti. (Baştaki işaretleme yeterli)
      });
    } catch (e) {
      logger.error({ err: e }, "Gmail check error");
    } finally {
      isProcessingEmail = false;
    }
  }, 60 * 1000);
}

// Sunucu Başlatma
const botEnabled = process.env.BOT_ENABLED !== "false";
if (botEnabled) {
  const httpPort = Number(process.env.PORT) || 3000;
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200);
      res.end("OK");
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(httpPort, "0.0.0.0", () => {
    console.log(`📡 Health check server on port ${httpPort}`);

    // Cron servisini başlat (Sabah brifingi, hatırlatıcılar vb.)
    try {
      const activeSupervisorId = marinaId || bossId;
      if (activeSupervisorId && activeSupervisorId !== 0) {
        const cronService = CronService.getInstance(bot, activeSupervisorId);
        cronService.init();
        console.log("⏰ Cron Service initialized and started.");
      } else {
        console.warn(
          "⚠️ Cron Service skipped: TELEGRAM_MARINA_ID and TELEGRAM_BOSS_ID missing.",
        );
      }
    } catch (cronErr) {
      console.error("❌ Cron Service start error:", cronErr);
    }

    // Bellek servisinin dizinlerini oluştur
    memoryService.initialize().catch((err) => {
      console.error("❌ Memory Service initialization error:", err);
    });

    // Botu başlat
    console.log("🚀 AYÇA BOT BAŞLATILIYOR... (Terminal Kontrol)");
    bot.start().catch((e) => console.error("Bot start error:", e));
  });
}
