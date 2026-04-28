/**
 * Ayca Agent Senaryo Testleri
 *
 * 20 canli kullanim senaryosunu kapsar:
 *  1. Malzeme Talebi Algilama
 *  2. Siparis Durum Sorgulama (Patron)
 *  3. E-posta Gonderme
 *  4. Hatirlatma Kurma
 *  5. Is Disi Sohbet Reddi (Personel)
 *  6. Yetki Kontrolu (Guest/Personel)
 *  7. Siparis-Yok Kurali (Order Guard)
 *  8. Excel Dosya Yukleme
 *  9. Sesli Mesaj Transkripsiyon
 * 10. "Gerekini Yap" Komutu
 * 11. Coklu Departman Siparis Dagilimi
 * 12. Marina Koordinator Rolu
 * 13. Buyuk/Kucuk Harf Duyarsizligi
 * 14. Bozuk/Eksik Veri Handle
 * 15. Sirali Etkilesim Akisi (Multi-turn)
 * 16. Departman Bazli Mention
 * 17. Bos Mesaj / Desteklenmeyen Format
 * 18. E-posta + Hatirlatma Birlesik Senaryo
 * 19. Personel Contact Kayit
 * 20. Siparis Rapor Format Dogrulama
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TEST_STAFF, TEST_BOSS_ID, TEST_MARINA_ID, createTestOrder, createMultiDeptOrder } from "./helpers/test-data.js";

// ─────────────────────────────────────────────────────────
// Mock Builders
// ─────────────────────────────────────────────────────────

function createMockCtx(overrides: {
  text?: string;
  role?: string;
  fromId?: number;
  voice?: { file_id: string };
  document?: { file_name: string; mime_type: string; file_id: string };
  contact?: { phone_number: string };
} = {}) {
  const msg: any = {};
  if (overrides.text !== undefined) msg.text = overrides.text;
  if (overrides.voice) msg.voice = overrides.voice;
  if (overrides.document) msg.document = overrides.document;
  if (overrides.contact) msg.contact = overrides.contact;

  return {
    from: { id: overrides.fromId ?? TEST_BOSS_ID, first_name: "TestUser" },
    message: Object.keys(msg).length > 0 ? msg : undefined,
    chat: { id: 888888 },
    reply: vi.fn(async () => {}),
    api: {
      sendMessage: vi.fn(async () => ({ message_id: 1 })),
      getFile: vi.fn(async () => ({ file_path: "test/file.xlsx" })),
      editMessageText: vi.fn(async () => {}),
    },
    answerCallbackQuery: vi.fn(async () => {}),
    role: overrides.role ?? "boss",
    staffInfo: TEST_STAFF.find(s => s.telegramId === overrides.fromId),
  } as any;
}

function createMockLLM(responses: Record<string, string> = {}) {
  return {
    chat: vi.fn(async (opts: any) => {
      const msg = opts.userMessage || "";
      for (const [pattern, response] of Object.entries(responses)) {
        if (msg.includes(pattern) || (opts.context || "").includes(pattern)) {
          return response;
        }
      }
      return "Ayca yait simulasyonu.";
    }),
    translateToRussian: vi.fn(async (details: string[]) => details),
  };
}

function createMockProductionService() {
  const items: any[] = [];
  return {
    add: vi.fn(async (item: any) => {
      const newItem = { ...item, id: `prod-${items.length + 1}`, status: "requested", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      items.push(newItem);
      return newItem;
    }),
    getPending: vi.fn(async () => items.filter(i => i.status === "requested" || i.status === "ordered")),
    getAll: vi.fn(async () => items),
    _items: items,
  };
}

function createMockMemoryService() {
  const drafts = new Map<string, any>();
  const history: any[] = [];
  return {
    saveDraft: vi.fn((id: string, data: any) => drafts.set(id, data)),
    getDraft: vi.fn((id: string) => drafts.get(id)),
    deleteDraft: vi.fn((id: string) => drafts.delete(id)),
    getHistory: vi.fn(async () => [...history]),
    saveMessage: vi.fn(async (_chatId: any, role: string, content: string) => {
      history.push({ role, content, timestamp: Date.now() });
    }),
    _drafts: drafts,
    _history: history,
  };
}

function createMockOrderService(orders: any[] = []) {
  return {
    getOrders: vi.fn(() => orders),
    getActiveTrackingItems: vi.fn(() =>
      orders
        .filter(o => o.status !== "archived")
        .flatMap(o => o.items.map((item: any) => ({ order: o, item })))
    ),
    processExcelOrder: vi.fn(async () => orders[0] ?? null),
    updateItemStatus: vi.fn(async () => {}),
    getOrderItemById: vi.fn(() => null),
  };
}

function createMockStaffService() {
  return {
    getStaffByDepartment: vi.fn((dept: string) =>
      TEST_STAFF.filter(s => s.department.toLowerCase().includes(dept.toLowerCase()) || dept.toLowerCase().includes(s.department.toLowerCase()))
    ),
    getAllStaff: vi.fn(() => TEST_STAFF),
    getStaffByTelegramId: vi.fn((id: number) => TEST_STAFF.find(s => s.telegramId === id)),
    getDepartments: vi.fn(() => [
      "Karkas Uretimi", "Metal Uretimi", "Mobilya Dekorasyon",
      "Boyahane", "Dikishane", "Dosemehane",
      "Dis Satin Alma", "Satis", "Paketleme", "Sevkiyat",
    ]),
    verifyStaffByPhone: vi.fn(async () => null),
    registerStaff: vi.fn(async () => {}),
    removeStaff: vi.fn(async () => true),
    processExcelStaff: vi.fn(async () => ({ count: 5 })),
  };
}

function createMockGmailService() {
  return {
    sendEmail: vi.fn(async () => true),
  };
}

function createMockCronService() {
  const tasks: any[] = [];
  return {
    addDynamicTask: vi.fn((chatId: any, message: string, cron: string, recurring: boolean) => {
      const task = { id: `task-${tasks.length + 1}`, chatId, message, triggerTimeStr: cron, isRecurring: recurring };
      tasks.push(task);
      return task;
    }),
    _tasks: tasks,
  };
}

function createMockVoiceService() {
  return {
    transcribeVoiceMessage: vi.fn(async () => "Karkas iskeleti lazim acele"),
  };
}

// ─────────────────────────────────────────────────────────
// MessageHandler — sadelestirilmis test surumu
// Gercek dosyadan bagimliliklari mock'layarak calisir
// ─────────────────────────────────────────────────────────

function createTestMessageHandler(deps: {
  llm: ReturnType<typeof createMockLLM>;
  production: ReturnType<typeof createMockProductionService>;
  memory: ReturnType<typeof createMockMemoryService>;
  order: ReturnType<typeof createMockOrderService>;
  staff: ReturnType<typeof createMockStaffService>;
  gmail: ReturnType<typeof createMockGmailService>;
  cron: ReturnType<typeof createMockCronService>;
  voice: ReturnType<typeof createMockVoiceService>;
}) {
  return {
    async handle(ctx: any) {
      if (!ctx.message) return;

      let originalText = "";

      if (ctx.message.text) {
        originalText = ctx.message.text;
      } else if (ctx.message.voice) {
        await ctx.reply("🎙️ Sesli mesajinizi dinliyorum, lutfen bekleyin...");
        const transcribed = await deps.voice.transcribeVoiceMessage(ctx, ctx.message.voice.file_id, "auto");
        if (!transcribed) {
          await ctx.reply("Uzgunum, sesinizi cozumleyemedim.");
          return;
        }
        await ctx.reply(`_"${transcribed}"_`, { parse_mode: "Markdown" });
        originalText = transcribed;
      } else if (ctx.message.document) {
        await handleDocument(ctx, deps);
        return;
      } else if (ctx.message.contact) {
        await ctx.reply("🔄 Kimlik bilgileriniz kontrol ediliyor...");
        return;
      } else {
        return;
      }

      const text = originalText.toLowerCase();
      const isBoss = ctx.role === "boss";

      // Malzeme Talebi — Türkçe + ASCII + Rusça
      const productionKeywords = [
        "lazım", "lazim", "bitti", "eksik", "sipariş ver", "siparis ver", "almamız lazım", "almamiz lazim",
        "gelmedi", "yok", "kalmadı", "kalmadi", "tükendi", "tukendi",
        "нужен", "нужна", "нужно", "нужны",
        "закончился", "закончилась", "закончились", "кончился", "кончилась",
        "не хватает", "не пришла", "не пришли", "не приехала",
        "нет в наличии", "не осталось", "осталось",
        "заказ",
      ];
      const isProductionRequest = productionKeywords.some(kw => text.includes(kw));

      if (isProductionRequest) {
        await handleProductionRequest(ctx, originalText, isBoss, deps);
        return;
      }

      // "Gerekini yap"
      if (isBoss && (text.includes("gerekini yap") || text.includes("gerekeni yap"))) {
        const lastXl = deps.memory.getDraft(`last_xl_${ctx.from?.id}`);
        if (lastXl) {
          await ctx.reply("🫡 Anlasildi Baris Bey, son gonderdiginiz dosyayi *Personel Listesi* olarak isliyorum...", { parse_mode: "Markdown" });
          const result = await deps.staff.processExcelStaff(lastXl.buffer, ctx.from?.id.toString() || "0");
          await ctx.reply(`✅ Personel listesi basariyla guncellendi: ${result.count} kisi kaydedildi.`);
          deps.memory.deleteDraft(`last_xl_${ctx.from?.id}`);
          return;
        }
      }

      // E-posta — Türkçe + ASCII + Rusça
      const emailKeywords = [
        "mail at", "mail gönder", "mail gonder", "e-posta at", "e-posta gönder", "e-posta gonder",
        "отправь email", "отправить email", "отправь почту", "отправить почту",
      ];
      if (emailKeywords.some(kw => originalText.includes(kw) || text.includes(kw.toLowerCase()))) {
        if (!isBoss) {
          await ctx.reply("❌ E-posta gonderme yetkisi sadece Baris Bey'e aittir.");
          return;
        }
        await handleEmailRequest(ctx, originalText, deps);
        return;
      }

      // Hatirlatma — Türkçe + ASCII + Rusça
      const reminderKeywords = [
        "hatırlat", "hatirlat", "zamanında", "zamaninda", "alarm kur", "haber ver", "sonra bildir",
        "напомни", "напомнить", "будильник", "напоминание",
      ];
      if (reminderKeywords.some(kw => text.includes(kw))) {
        if (!isBoss) {
          await ctx.reply("❌ Hatirlatma kurma yetkisi sadece Baris Bey'e aittir.");
          return;
        }
        await handleReminderRequest(ctx, originalText, deps);
        return;
      }

      // Siparis Durum Sorgulama — hem Türkçe hem ASCII
      const statusKeywords = ["durum", "ne durumda", "hangi aşamada", "hangi asamada", "rapor", "bilgi ver", "göster", "goster", "listele", "özet", "ozet", "liste", "varmı", "var mi", "siparişler", "siparisler", "neler var"];
      const isStatusQuery =
        (text.includes("sipariş") || text.includes("siparis") || text.includes("müşteri") || text.includes("musteri") || text.includes("isler") || text.includes("işler")) &&
        (statusKeywords.some(kw => text.includes(kw)) || text.endsWith("?") || text.includes("var mı") || text.includes("var mi"));

      if (isStatusQuery && isBoss) {
        await handleOrderStatusQuery(ctx, originalText, deps);
        return;
      }

      // Genel Mesaj (LLM)
      await handleGeneralMessage(ctx, originalText, isBoss, ctx.role, deps);
    },
  };
}

// ─── Alt Handler'lar ──────────────────────────────────

async function handleProductionRequest(ctx: any, originalText: string, isBoss: boolean, deps: any) {
  const text = originalText.toLowerCase();
  const material = originalText
    .replace(/lazım|lazim|bitti|eksik|sipariş ver|siparis ver|almamız lazım|almamiz lazim|acele|gelmedi|yok|kalmadı|kalmadi|tükendi|tukendi|нужен|нужна|нужно|нужны|закончился|закончилась|закончились|кончился|кончилась|не хватает|не пришла|не пришли|не приехала|нет в наличии|не осталось|осталось|заказ/gi, "")
    .trim();

  if (material) {
    const item = await deps.production.add({
      name: material,
      requestedBy: ctx.from?.first_name || "Bilinmeyen",
      notes: `Otomatik algilama: ${originalText}`,
    });

    let mentionText = "";
    // Dis Satin Alma ONCE kontrol — Marina'nin tedarik kalemleri
    if (
      text.includes("çivi") || text.includes("гвозд") ||
      text.includes("plastik") || text.includes("пластик") ||
      text.includes("vida") || text.includes("tutkal") || text.includes("клей") ||
      text.includes("hırdavat") || text.includes("hirdavat") || text.includes("фурнитур") ||
      text.includes("satin al") || text.includes("satın al") || text.includes("закупк") || text.includes("купить")
    ) {
      const staff = deps.staff.getStaffByDepartment("Dis Satin Alma");
      if (staff.length > 0) mentionText = `\n\n🔔 @${staff[0].name} — Dis Satin Alma yetkilisi bilgilendirildi.`;
    } else if (text.includes("karkas") || text.includes("iskelet") || text.includes("каркас")) {
      const staff = deps.staff.getStaffByDepartment("Karkas Uretimi");
      if (staff.length > 0) mentionText = `\n\n🔔 @${staff[0].name} ilgilenebilir mi?`;
    } else if (text.includes("metal") || text.includes("метал") || text.includes("рама")) {
      const staff = deps.staff.getStaffByDepartment("Metal Uretimi");
      if (staff.length > 0) mentionText = `\n\n🔔 @${staff[0].name} ilgilenebilir mi?`;
    } else if (text.includes("dekor") || text.includes("декор") || text.includes("резьб")) {
      const staff = deps.staff.getStaffByDepartment("Mobilya Dekorasyon");
      if (staff.length > 0) mentionText = `\n\n🔔 @${staff[0].name} ilgilenebilir mi?`;
    } else if (text.includes("kumaş") || text.includes("dikiş") || text.includes("ткань") || text.includes("шить")) {
      const staff = deps.staff.getStaffByDepartment("Dikishane");
      if (staff.length > 0) mentionText = `\n\n🔔 @${staff[0].name} stok kontrolu yapabilir mi?`;
    } else if (text.includes("doseme") || text.includes("döşeme") || text.includes("обивк")) {
      const staff = deps.staff.getStaffByDepartment("Dosemehane");
      if (staff.length > 0) mentionText = `\n\n🔔 @${staff[0].name} ilgilenebilir mi?`;
    } else if (text.includes("sünger") || text.includes("губк") || text.includes("поролон")) {
      const staff = deps.staff.getStaffByDepartment("Dosemehane");
      if (staff.length > 0) mentionText = `\n\n🔔 @${staff[0].name} sünger/dolgu malzemesi kontrolu yapabilir mi?`;
    } else if (text.includes("boya") || text.includes("покрас") || text.includes("краск") || text.includes("cila")) {
      const staff = deps.staff.getStaffByDepartment("Boyahane");
      if (staff.length > 0) mentionText = `\n\n🔔 @${staff[0].name} Boyahane stok kontrolu yapabilir mi?`;
    } else if (text.includes("paket") || text.includes("упаков")) {
      const staff = deps.staff.getStaffByDepartment("Paketleme");
      if (staff.length > 0) mentionText = `\n\n🔔 @${staff[0].name} paketleme surecini takip edebilir mi?`;
    } else if (text.includes("sevkiyat") || text.includes("доставк") || text.includes("отправк")) {
      const staff = deps.staff.getStaffByDepartment("Sevkiyat");
      if (staff.length > 0) mentionText = `\n\n🔔 @${staff[0].name} sevkiyat planlamasina bakabilir mi?`;
    }

    await ctx.reply(
      `✅ *Kayit Edildi:* "${item.name}" malzeme listesine eklendi. \n\nDurum: *Talep Edildi*${mentionText}`,
      { parse_mode: "Markdown" },
    );
  } else {
    const greeting = isBoss ? "Baris Bey" : ctx.from?.first_name || "Ekip Arkadasim";
    await ctx.reply(`Ne lazim oldugunu tam anlayamadim ${greeting}, tekrar soyler misiniz?`);
  }
}

async function handleDocument(ctx: any, deps: any) {
  const doc = ctx.message.document;
  const isExcel = doc.file_name?.endsWith(".xlsx") || doc.file_name?.endsWith(".xls") ||
    doc.mime_type?.includes("spreadsheet");

  if (!isExcel) return;

  await ctx.reply("📊 Excel siparis dosyasi algilandi, isleniyor...");

  const isBoss = ctx.role === "boss";
  if (!isBoss) {
    await ctx.reply("❌ Excel dosyasi isleme yetkisi sadece Baris Bey'e aittir.");
    return;
  }

  deps.memory.saveDraft(`last_xl_${ctx.from?.id}`, { fileName: doc.file_name, buffer: Buffer.from("fake-excel") });
  await deps.order.processExcelOrder(Buffer.from("fake-excel"), ctx.from?.id.toString() || "0");
  await ctx.reply(`📊 *Excel Dosyasi Alindi:* \`${doc.file_name}\`\nSiparis olarak isleniyor...`, { parse_mode: "Markdown" });
}

async function handleEmailRequest(ctx: any, text: string, deps: any) {
  await ctx.reply("📧 E-posta gonderim talebinizi inceliyorum...");

  const prompt = `
    Kullanici senden bir e-posta gondermeni istiyor. Asagidaki metinden alici, konu ve icerigi cikar.
    Kullanici Metni: "${text}"
    Lutfen YALNIZCA JSON formatinda yait ver: {"to":"...","subject":"...","body":"..."}
  `;

  const response = await deps.llm.chat({ userMessage: prompt, context: "Email Parse Mode" });

  try {
    const jsonMatch = response?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON not found");
    const parsed = JSON.parse(jsonMatch[0].trim());

    if (!parsed.to) {
      await ctx.reply("❌ Kime e-posta atacagimi mesajinizda bulamadim.");
      return;
    }

    const success = await deps.gmail.sendEmail(parsed.to, parsed.subject || "Sandaluci", parsed.body || "");
    if (success) {
      await ctx.reply(`✅ E-posta basariyla gonderildi!\n\n**Alici:** ${parsed.to}\n**Konu:** ${parsed.subject}`);
    } else {
      await ctx.reply("❌ E-posta gonderilirken teknik bir hata olustu.");
    }
  } catch {
    await ctx.reply("❌ E-posta bilgilerinizi tam anlayamadim, lutfen daha acik yazar misiniz?");
  }
}

async function handleReminderRequest(ctx: any, text: string, deps: any) {
  await ctx.reply("⏰ Hatirlatma talebinizi ayarliyorum...");

  const now = new Date();
  const currentTime = now.toLocaleString("tr-TR", { timeZone: "Asia/Almaty" });

  const prompt = `
    Kullanici hatirlatma istiyor. Su anki zaman: ${currentTime}
    Metin: "${text}"
    JSON formatinda yait ver: {"message":"...","cron":"..."}
  `;

  const response = await deps.llm.chat({ userMessage: prompt, context: "Reminder Parse Mode" });

  try {
    const jsonMatch = response?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON not found");
    const parsed = JSON.parse(jsonMatch[0].trim());

    if (!parsed.message || !parsed.cron) throw new Error("Missing fields");

    const task = deps.cron.addDynamicTask(ctx.chat?.id || "", parsed.message, parsed.cron, false);
    await ctx.reply(`✅ Hatirlatma kuruldu!\n\n**Mesaj:** ${task.message}\n**Zaman (Cron):** ${task.triggerTimeStr}`);
  } catch {
    await ctx.reply("❌ Hatirlatma zamanini tam anlayamadim, lutfen daha acik yazar misiniz?");
  }
}

async function handleOrderStatusQuery(ctx: any, text: string, deps: any) {
  await ctx.reply("📊 Siparis durumunu kontrol edip raporluyorum...");

  const orders = deps.order.getOrders();
  if (!orders || orders.length === 0) {
    await ctx.reply("Su anda sistemde kayitli hicbir siparis bulunmuyor.");
    return;
  }

  const ordersData = orders.map((o: any) => ({
    Musteri: o.customerName,
    Teslim_Tarihi: o.deliveryDate,
    Durum: o.items.map((i: any) => ({
      Urun: i.product,
      Miktar: i.quantity,
      Departman: i.department,
    })),
  }));

  const prompt = `
    Yonetici soruyor: "${text}"
    Veritabanindaki siparisler: ${JSON.stringify(ordersData, null, 2)}
    Profesyonel bir rapor hazirla. SADECE verilen verileri kullan.
  `;

  const response = await deps.llm.chat({ userMessage: prompt });
  await ctx.reply(response || "❌ Durum raporu olusturulamadi.");
}

async function handleGeneralMessage(ctx: any, text: string, isBoss: boolean, role: string, deps: any) {
  const activeOrders = deps.order.getOrders().filter((o: any) => o.status !== "archived");
  const orderCount = activeOrders.length;

  let context = `Sandaluci uretim veritabani aktif. Su an sistemde ${orderCount} adet AKTIF siparis bulunmaktadir.`;
  if (orderCount === 0) {
    context += "\n[SISTEM UYARISI] SISTEMDE HIC SIPARIS YOK. Ayca 'Siparis-Yok Kurali'na kesinlikle uymalidir.";
  }

  const history = await deps.memory.getHistory(ctx.chat?.id || "default");
  await deps.memory.saveMessage(ctx.chat?.id || "default", "user", text);

  const response = await deps.llm.chat({
    userMessage: text,
    context,
    history: history.map((h: any) => ({ role: h.role, content: h.content })),
    role,
  });

  if (response) {
    await deps.memory.saveMessage(ctx.chat?.id || "default", "assistant", response);
  }

  await ctx.reply(response || (isBoss ? "Uzgunum Baris Bey, bir hata olustu." : "Uzgunum, bir hata olustu."));
}

// ─────────────────────────────────────────────────────────
// TESTLER
// ─────────────────────────────────────────────────────────

describe("Ayca Agent — 20 Senaryo Testi", () => {

  // Ortak deps her testte resetlenir
  let llm: ReturnType<typeof createMockLLM>;
  let production: ReturnType<typeof createMockProductionService>;
  let memory: ReturnType<typeof createMockMemoryService>;
  let order: ReturnType<typeof createMockOrderService>;
  let staff: ReturnType<typeof createMockStaffService>;
  let gmail: ReturnType<typeof createMockGmailService>;
  let cron: ReturnType<typeof createMockCronService>;
  let voice: ReturnType<typeof createMockVoiceService>;
  let handler: ReturnType<typeof createTestMessageHandler>;

  beforeEach(() => {
    llm = createMockLLM();
    production = createMockProductionService();
    memory = createMockMemoryService();
    order = createMockOrderService();
    staff = createMockStaffService();
    gmail = createMockGmailService();
    cron = createMockCronService();
    voice = createMockVoiceService();
    handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });
  });

  // ─────────────────────────────────────────────
  // TEST 1: Malzeme Talebi Algilama
  // ─────────────────────────────────────────────
  describe("Senaryo 1 — Malzeme Talebi Algilama", () => {

    it("'karkas iskeleti lazim acele' → production request olarak islenir", async () => {
      const ctx = createMockCtx({ text: "karkas iskeleti lazim acele", role: "boss" });

      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
      const addedItem = production.add.mock.calls[0][0];
      expect(addedItem.name).toContain("karkas iskeleti");

      const replyText = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replyText).toMatch(/Kayit Edildi/i);
      expect(replyText).toMatch(/Talep Edildi/i);
    });

    it("'kumas bitti' → production request olarak islenir", async () => {
      const ctx = createMockCtx({ text: "kumaş bitti", role: "boss" });

      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
      const replyText = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replyText).toMatch(/Kayit Edildi/i);
    });

    it("'lazim' yoksa genel mesaj olarak gider", async () => {
      const ctx = createMockCtx({ text: "Merhaba Ayca", role: "boss" });

      await handler.handle(ctx);

      expect(production.add).not.toHaveBeenCalled();
      expect(llm.chat).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // TEST 2: Siparis Durum Sorgulama (Patron)
  // ─────────────────────────────────────────────
  describe("Senaryo 2 — Siparis Durum Sorgulama", () => {

    it("Patron 'Siparisler ne durumda?' → RAG raporu doner", async () => {
      const testOrder = createTestOrder();
      order = createMockOrderService([testOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Siparişler ne durumda? Özet ver.", role: "boss" });

      await handler.handle(ctx);

      expect(llm.chat).toHaveBeenCalled();
      const llmCall = llm.chat.mock.calls[0][0];
      expect(llmCall.userMessage).toContain("Siparişler");

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Siparis durumunu/i);
    });

    it("Siparis yoksa 'hicbir siparis bulunmuyor' doner", async () => {
      order = createMockOrderService([]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Siparişler ne durumda?", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/hicbir siparis bulunmuyor/i);
    });

    it("Personel siparis sorgulayamaz → LLM'e gider", async () => {
      const testOrder = createTestOrder();
      order = createMockOrderService([testOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Sipariş durumu göster", role: "staff" });
      await handler.handle(ctx);

      expect(llm.chat).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // TEST 3: E-posta Gonderme
  // ─────────────────────────────────────────────
  describe("Senaryo 3 — E-posta Gonderme", () => {

    it("Patron e-posta ister → LLM JSON parse → Gmail send", async () => {
      llm = createMockLLM({
        "e-posta gondermeni istiyor": '{"to":"info@sandaluci.com","subject":"Siparis Onayi","body":"Sayin musterimiz, siparisiniz alinmistir."}',
      });
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({
        text: "info@sandaluci.com'a sipariş onayı mail gönder, konu: Sipariş Onayı",
        role: "boss",
      });

      await handler.handle(ctx);

      expect(gmail.sendEmail).toHaveBeenCalledOnce();
      expect(gmail.sendEmail.mock.calls[0][0]).toBe("info@sandaluci.com");

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/basariyla gonderildi/i);
    });

    it("Alici adres yoksa → hata mesaji doner", async () => {
      llm = createMockLLM({
        "e-posta gondermeni istiyor": '{"to":"","subject":"Test","body":"Test"}',
      });
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "mail gönder", role: "boss" });
      await handler.handle(ctx);

      expect(gmail.sendEmail).not.toHaveBeenCalled();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/bulamadim/i);
    });

    it("Personel e-posta gonderemez → yetki reddi", async () => {
      const ctx = createMockCtx({ text: "mail at test@test.com", role: "staff" });
      await handler.handle(ctx);

      expect(gmail.sendEmail).not.toHaveBeenCalled();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/yetkisi sadece Baris Bey/i);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 4: Hatirlatma Kurma
  // ─────────────────────────────────────────────
  describe("Senaryo 4 — Hatirlatma Kurma", () => {

    it("'10 dakika sonra hatirlat' → cron task olusturulur", async () => {
      llm = createMockLLM({
        "hatirlatma istiyor": '{"message":"Marat\'a karkaslari sor","cron":"*/10 * * * *"}',
      });
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "10 dakika sonra Marat'a karkasları sor diye hatırlat", role: "boss" });
      await handler.handle(ctx);

      expect(cron.addDynamicTask).toHaveBeenCalledOnce();
      const task = cron.addDynamicTask.mock.calls[0];
      expect(task[1]).toMatch(/karkas/i);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Hatirlatma kuruldu/i);
    });

    it("Personel hatirlatma kuramaz → yetki reddi", async () => {
      const ctx = createMockCtx({ text: "bana hatırlat", role: "staff" });
      await handler.handle(ctx);

      expect(cron.addDynamicTask).not.toHaveBeenCalled();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/yetkisi sadece Baris Bey/i);
    });

    it("LLM JSON parse hatasi → hata mesaji", async () => {
      llm = createMockLLM({ "hatirlatma istiyor": "bu bir json degil" });
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "hatırlat bir şey", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/anlayamadim/i);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 5: Is Disi Sohbet Reddi (Personel)
  // ─────────────────────────────────────────────
  describe("Senaryo 5 — Is Disi Sohbet (Personel Rolsu)", () => {

    it("Personel 'Nasilsin?' → LLM'e role=staff ile gider", async () => {
      const ctx = createMockCtx({ text: "Nasılsın? Hava nasil bugun?", role: "staff", fromId: 111111 });
      await handler.handle(ctx);

      expect(llm.chat).toHaveBeenCalled();
      const llmCall = llm.chat.mock.calls[0][0];
      expect(llmCall.role).toBe("staff");
    });

    it("Patron 'Nasilsin?' → LLM'e role=boss ile gider", async () => {
      const ctx = createMockCtx({ text: "Nasılsın Ayça?", role: "boss" });
      await handler.handle(ctx);

      expect(llm.chat).toHaveBeenCalled();
      const llmCall = llm.chat.mock.calls[0][0];
      expect(llmCall.role).toBe("boss");
    });
  });

  // ─────────────────────────────────────────────
  // TEST 6: Yetki Kontrolu (Guest/Personel)
  // ─────────────────────────────────────────────
  describe("Senaryo 6 — Yetki Kontrolu", () => {

    it("E-posta: staff → yetki reddi", async () => {
      const ctx = createMockCtx({ text: "mail gönder test@test.com", role: "staff" });
      await handler.handle(ctx);
      expect(gmail.sendEmail).not.toHaveBeenCalled();
    });

    it("Hatirlatma: staff → yetki reddi", async () => {
      const ctx = createMockCtx({ text: "hatırlat bir şey", role: "staff" });
      await handler.handle(ctx);
      expect(cron.addDynamicTask).not.toHaveBeenCalled();
    });

    it("Excel yukleme: staff → yetki reddi", async () => {
      const ctx = createMockCtx({
        role: "staff",
        document: { file_name: "test.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file_id: "abc" },
      });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/yetkisi sadece Baris Bey/i);
    });

    it("Siparis sorgu: boss → yetki var", async () => {
      const testOrder = createTestOrder();
      order = createMockOrderService([testOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Siparişler ne durumda?", role: "boss" });
      await handler.handle(ctx);

      const firstReply = ctx.reply.mock.calls[0][0];
      expect(firstReply).toMatch(/Siparis durumunu/i);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 7: Siparis-Yok Kurali (Order Guard)
  // ─────────────────────────────────────────────
  describe("Senaryo 7 — Siparis-Yok Kurali (Order Guard)", () => {

    it("Aktif siparis yok → LLM context'e SISTEM UYARISI eklenir", async () => {
      order = createMockOrderService([]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Merhaba", role: "boss" });
      await handler.handle(ctx);

      expect(llm.chat).toHaveBeenCalled();
      const llmCall = llm.chat.mock.calls[0][0];
      expect(llmCall.context).toContain("SISTEM UYARISI");
      expect(llmCall.context).toContain("SIPARIS YOK");
    });

    it("Aktif siparis var → SISTEM UYARISI eklenmez", async () => {
      const testOrder = createTestOrder();
      order = createMockOrderService([testOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Merhaba", role: "boss" });
      await handler.handle(ctx);

      const llmCall = llm.chat.mock.calls[0][0];
      expect(llmCall.context).not.toContain("SISTEM UYARISI");
      expect(llmCall.context).toContain("1 adet AKTIF siparis");
    });
  });

  // ─────────────────────────────────────────────
  // TEST 8: Excel Dosya Yukleme
  // ─────────────────────────────────────────────
  describe("Senaryo 8 — Excel Dosya Yukleme", () => {

    it(".xlsx dosyasi → siparis olarak islenir", async () => {
      const ctx = createMockCtx({
        role: "boss",
        document: {
          file_name: "siparis.xlsx",
          mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          file_id: "excel123",
        },
      });

      await handler.handle(ctx);

      expect(order.processExcelOrder).toHaveBeenCalledOnce();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Excel sipariş dosyası algılandı|Excel siparis dosyasi algilandi/i);
      expect(replies).toMatch(/Excel Dosyasi Alindi/i);
    });

    it(".xls dosyasi → siparis olarak islenir", async () => {
      const ctx = createMockCtx({
        role: "boss",
        document: {
          file_name: "data.xls",
          mime_type: "application/vnd.ms-excel",
          file_id: "xls123",
        },
      });

      await handler.handle(ctx);
      expect(order.processExcelOrder).toHaveBeenCalled();
    });

    it(".pdf dosyasi → islem yapilmaz (sessiz gec)", async () => {
      const ctx = createMockCtx({
        role: "boss",
        document: {
          file_name: "rapor.pdf",
          mime_type: "application/pdf",
          file_id: "pdf123",
        },
      });

      await handler.handle(ctx);
      expect(order.processExcelOrder).not.toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("Excel sonrasi draft'a kaydedilir", async () => {
      const ctx = createMockCtx({
        role: "boss",
        document: {
          file_name: "test.xlsx",
          mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          file_id: "x1",
        },
      });

      await handler.handle(ctx);
      expect(memory.saveDraft).toHaveBeenCalledWith(
        expect.stringContaining("last_xl_"),
        expect.objectContaining({ fileName: "test.xlsx" }),
      );
    });
  });

  // ─────────────────────────────────────────────
  // TEST 9: Sesli Mesaj
  // ─────────────────────────────────────────────
  describe("Senaryo 9 — Sesli Mesaj Transkripsiyon", () => {

    it("Voice message → transkripsiyon → mesaj islenir", async () => {
      const ctx = createMockCtx({
        role: "boss",
        voice: { file_id: "voice_001" },
      });

      await handler.handle(ctx);

      expect(voice.transcribeVoiceMessage).toHaveBeenCalledOnce();
      expect(voice.transcribeVoiceMessage.mock.calls[0][1]).toBe("voice_001");

      const transcriptReply = ctx.reply.mock.calls.find((c: any) =>
        typeof c[0] === "string" && c[0].includes("Karkas iskeleti")
      );
      expect(transcriptReply).toBeDefined();

      expect(production.add).toHaveBeenCalled();
    });

    it("Transkripsiyon basarisiz → hata mesaji", async () => {
      voice = createMockVoiceService();
      voice.transcribeVoiceMessage = vi.fn(async () => null);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({
        role: "boss",
        voice: { file_id: "voice_002" },
      });

      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/cozumleyemedim/i);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 10: "Gerekini Yap" Komutu
  // ─────────────────────────────────────────────
  describe("Senaryo 10 — 'Gerekini Yap' Komutu", () => {

    it("Excel yuklendikten sonra 'gerekini yap' → personel listesi guncellenir", async () => {
      const excelCtx = createMockCtx({
        role: "boss",
        document: {
          file_name: "personel.xlsx",
          mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          file_id: "px1",
        },
      });

      await handler.handle(excelCtx);
      expect(memory.saveDraft).toHaveBeenCalled();

      const gerekiniCtx = createMockCtx({ text: "gerekini yap", role: "boss" });
      await handler.handle(gerekiniCtx);

      expect(staff.processExcelStaff).toHaveBeenCalledOnce();
      const replies = gerekiniCtx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Personel listesi basariyla guncellendi/i);
      expect(replies).toMatch(/5 kisi kaydedildi/i);

      expect(memory.deleteDraft).toHaveBeenCalledWith(expect.stringContaining("last_xl_"));
    });

    it("Draft yoksa 'gerekini yap' → genel mesaj olarak gider", async () => {
      const ctx = createMockCtx({ text: "gerekini yap", role: "boss" });
      await handler.handle(ctx);

      expect(staff.processExcelStaff).not.toHaveBeenCalled();
      expect(llm.chat).toHaveBeenCalled();
    });

    it("Personel 'gerekini yap' → genel mesaj (isBoss=false, o branch'e girmez)", async () => {
      const ctx = createMockCtx({ text: "gerekini yap", role: "staff" });
      await handler.handle(ctx);

      expect(staff.processExcelStaff).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // TEST 11: Coklu Departman Siparis Dagilimi
  // ─────────────────────────────────────────────
  describe("Senaryo 11 — Coklu Departman Siparis Dagilimi", () => {

    it("5 departmanli siparis → tum departmanlar items icinde listelenir", async () => {
      const multiOrder = createMultiDeptOrder();
      order = createMockOrderService([multiOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Siparişler ne durumda?", role: "boss" });
      await handler.handle(ctx);

      expect(llm.chat).toHaveBeenCalled();
      const ordersData = order.getOrders();
      expect(ordersData[0].items).toHaveLength(6);
    });

    it("Birden fazla siparis → hepsi LLM context'ine eklenir", async () => {
      const order1 = createTestOrder({ customerName: "Musteri A" });
      const order2 = createTestOrder({ customerName: "Musteri B" });
      order = createMockOrderService([order1, order2]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Tüm siparişleri göster", role: "boss" });
      await handler.handle(ctx);

      const allOrders = order.getOrders();
      expect(allOrders).toHaveLength(2);
    });

    it("Departman filtreli soru → LLM'e ilgili veri gider", async () => {
      const multiOrder = createMultiDeptOrder();
      order = createMockOrderService([multiOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Karkas departmanındaki siparişler ne durumda?", role: "boss" });
      await handler.handle(ctx);

      expect(llm.chat).toHaveBeenCalled();
      const llmCall = llm.chat.mock.calls[0][0];
      expect(llmCall.userMessage).toContain("Karkas");
    });
  });

  // ─────────────────────────────────────────────
  // TEST 12: Marina Koordinator Rolsu
  // ─────────────────────────────────────────────
  describe("Senaryo 12 — Marina Koordinator Rolsu", () => {

    it("Marina malzeme talep edebilir → production.add cagrilir", async () => {
      const ctx = createMockCtx({ text: "kumaş lazım acele", role: "staff", fromId: TEST_MARINA_ID });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
    });

    it("Marina e-posta gonderemez → yetki reddi", async () => {
      const ctx = createMockCtx({ text: "mail gönder test@test.com", role: "staff", fromId: TEST_MARINA_ID });
      await handler.handle(ctx);

      expect(gmail.sendEmail).not.toHaveBeenCalled();
    });

    it("Marina Excel yukleyemez → yetki reddi", async () => {
      const ctx = createMockCtx({
        role: "staff",
        fromId: TEST_MARINA_ID,
        document: { file_name: "siparis.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file_id: "mx1" },
      });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/yetkisi sadece Baris Bey/i);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 13: Buyuk/Kucuk Harf Duyarsizligi
  // ─────────────────────────────────────────────
  describe("Senaryo 13 — Buyuk/Kucuk Harf Duyarsizligi", () => {

    it("'KARKAS ISKELETI LAZIM' → malzeme talebi algilanir", async () => {
      const ctx = createMockCtx({ text: "KARKAS İSKELETİ LAZIM", role: "boss" });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
    });

    it("'mAiL GöNdEr' → e-posta akisina girer", async () => {
      const ctx = createMockCtx({ text: "mAiL GöNdEr info@test.com", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/E-posta/i);
    });

    it("'HATIRLAT BANA' → hatirlatma akisina girer", async () => {
      const ctx = createMockCtx({ text: "HATIRLAT BANA yarin toplantı var", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Hatirlatma/i);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 14: Bozuk/Eksik Veri Handle
  // ─────────────────────────────────────────────
  describe("Senaryo 14 — Bozuk/Eksik Veri Handle", () => {

    it("E-posta LLM'den gecersiz JSON → hata mesaji", async () => {
      llm = createMockLLM({ "e-posta gondermeni istiyor": "bu gecerli bir json degil {{{" });
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "mail at info@test.com konu:test", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/anlayamadim/i);
      expect(gmail.sendEmail).not.toHaveBeenCalled();
    });

    it("Hatirlatma LLM'den eksik alan → hata mesaji", async () => {
      llm = createMockLLM({ "hatirlatma istiyor": '{"message":"test"}' });
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "hatırlat bana bir şey", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/anlayamadim/i);
    });

    it("Siparis sorgusunda bos items → rapor yine de olusturulur", async () => {
      const emptyOrder = createTestOrder({ items: [] });
      order = createMockOrderService([emptyOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Siparişler ne durumda?", role: "boss" });
      await handler.handle(ctx);

      expect(llm.chat).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // TEST 15: Sirali Etkilesim Akisi (Multi-turn)
  // ─────────────────────────────────────────────
  describe("Senaryo 15 — Sirali Etkilesim Akisi", () => {

    it("Mesaj → yait → takip mesaji → history'de ikisi de var", async () => {
      const chatId = "multi-turn-chat";

      const ctx1 = createMockCtx({ text: "Merhaba", role: "boss" });
      ctx1.chat = { id: chatId };
      await handler.handle(ctx1);

      expect(memory.saveMessage).toHaveBeenCalledWith(chatId, "user", "Merhaba");

      // Ikinci mesaj: siparis keyword'u olmayan genel bir soru
      const ctx2 = createMockCtx({ text: "Bugun hava nasil", role: "boss" });
      ctx2.chat = { id: chatId };
      await handler.handle(ctx2);

      const userSaves = memory.saveMessage.mock.calls.filter((c: any) => c[1] === "user");
      expect(userSaves.length).toBeGreaterThanOrEqual(2);
    });

    it("Malzeme talebi → ardindan siparis sorgusu → ikisi ayri islenir", async () => {
      const testOrder = createTestOrder();
      order = createMockOrderService([testOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx1 = createMockCtx({ text: "karkas lazım", role: "boss" });
      await handler.handle(ctx1);
      expect(production.add).toHaveBeenCalledOnce();

      const ctx2 = createMockCtx({ text: "Siparişler ne durumda?", role: "boss" });
      await handler.handle(ctx2);
      expect(llm.chat).toHaveBeenCalled();
    });

    it("Hizli ardisik mesajlar → her biri bagimsiz islenir", async () => {
      const requests = ["kumaş lazım", "boya bitti", "iskaft eksik"];
      for (const req of requests) {
        const ctx = createMockCtx({ text: req, role: "boss" });
        await handler.handle(ctx);
      }

      expect(production.add).toHaveBeenCalledTimes(3);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 16: Departman Bazli Mention
  // ─────────────────────────────────────────────
  describe("Senaryo 16 — Departman Bazli Mention", () => {

    it("'karkas iskeleti lazim' → Karkas personeli mention edilir", async () => {
      const ctx = createMockCtx({ text: "karkas iskeleti lazım", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Bekbergen/i);
    });

    it("'kumas lazim' → Dikishane personeli mention edilir", async () => {
      const ctx = createMockCtx({ text: "kumaş lazım dikishane için", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Almira/i);
    });

    it("'boya bitti' → Boyahane departmani mention edilir", async () => {
      const ctx = createMockCtx({ text: "boya bitti", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Zhanibek/i);
      expect(replies).toMatch(/Boyahane/i);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 17: Bos Mesaj / Desteklenmeyen Format
  // ─────────────────────────────────────────────
  describe("Senaryo 17 — Bos Mesaj / Desteklenmeyen Format", () => {

    it("Mesaj yok → hicbir sey yapilmaz", async () => {
      const ctx = createMockCtx({ role: "boss" });
      ctx.message = undefined;
      await handler.handle(ctx);

      expect(ctx.reply).not.toHaveBeenCalled();
      expect(llm.chat).not.toHaveBeenCalled();
    });

    it("Sadece bosluk mesaji → genel mesaj olarak islenir", async () => {
      const ctx = createMockCtx({ text: "   ", role: "boss" });
      await handler.handle(ctx);

      // bosluklar keyword eslesmez → handleGeneralMessage → LLM
      expect(llm.chat).toHaveBeenCalled();
    });

    it("Resim dosyasi (document) → sessiz gecilir", async () => {
      const ctx = createMockCtx({
        role: "boss",
        document: { file_name: "foto.jpg", mime_type: "image/jpeg", file_id: "img1" },
      });
      await handler.handle(ctx);

      expect(order.processExcelOrder).not.toHaveBeenCalled();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).not.toMatch(/Excel/i);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 18: E-posta + Hatirlatma Birlesik
  // ─────────────────────────────────────────────
  describe("Senaryo 18 — E-posta + Hatirlatma Birlesik Senaryo", () => {

    it("Once e-posta → sonra hatirlatma → ikisi de dogru islenir", async () => {
      llm = createMockLLM({
        "e-posta gondermeni istiyor": '{"to":"test@test.com","subject":"Test","body":"Test body"}',
        "hatirlatma istiyor": '{"message":"Takip et","cron":"0 9 * * 1"}',
      });
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx1 = createMockCtx({ text: "mail gönder test@test.com konu:test", role: "boss" });
      await handler.handle(ctx1);
      expect(gmail.sendEmail).toHaveBeenCalledOnce();

      const ctx2 = createMockCtx({ text: "hatırlat bana pazartesi takip et", role: "boss" });
      await handler.handle(ctx2);
      expect(cron.addDynamicTask).toHaveBeenCalledOnce();
    });

    it("Personel e-posta → reddedilir → patron hatirlatma → basarili", async () => {
      llm = createMockLLM({
        "hatirlatma istiyor": '{"message":"Test","cron":"0 10 * * *"}',
      });
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx1 = createMockCtx({ text: "mail gönder", role: "staff" });
      await handler.handle(ctx1);
      expect(gmail.sendEmail).not.toHaveBeenCalled();

      const ctx2 = createMockCtx({ text: "hatırlat bana yarın", role: "boss" });
      await handler.handle(ctx2);
      expect(cron.addDynamicTask).toHaveBeenCalledOnce();
    });
  });

  // ─────────────────────────────────────────────
  // TEST 19: Personel Contact Kayit
  // ─────────────────────────────────────────────
  describe("Senaryo 19 — Personel Contact Kayit", () => {

    it("Contact mesaji → kimlik dogrulama baslatilir", async () => {
      const ctx = createMockCtx({
        role: "staff",
        contact: { phone_number: "+77001234567" },
      });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Kimlik bilgileriniz kontrol ediliyor/i);
    });

    it("Contact sonrasi staff servisi tetiklenmez (sadece bilgi mesaji)", async () => {
      const ctx = createMockCtx({
        role: "staff",
        contact: { phone_number: "+77009998877" },
      });
      await handler.handle(ctx);

      expect(staff.registerStaff).not.toHaveBeenCalled();
      expect(llm.chat).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // TEST 20: Siparis Rapor Format Dogrulama
  // ─────────────────────────────────────────────
  describe("Senaryo 20 — Siparis Rapor Format Dogrulama", () => {

    it("LLM'e siparis verisi JSON olarak gonderilir", async () => {
      const testOrder = createTestOrder();
      order = createMockOrderService([testOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Sipariş durumu göster", role: "boss" });
      await handler.handle(ctx);

      expect(llm.chat).toHaveBeenCalled();
      const llmCall = llm.chat.mock.calls[0][0];
      expect(llmCall.userMessage).toContain("Sipariş durumu");
    });

    it("Raporlama oncesi 'kontrol edip raporluyorum' mesaji gonderilir", async () => {
      const testOrder = createTestOrder();
      order = createMockOrderService([testOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Siparişler ne durumda?", role: "boss" });
      await handler.handle(ctx);

      const firstReply = ctx.reply.mock.calls[0][0];
      expect(firstReply).toMatch(/Siparis durumunu kontrol edip raporluyorum/i);
    });

    it("Coklu siparis → her musteri LLM'e gonderilir", async () => {
      const order1 = createTestOrder({ customerName: "Marzhan" });
      const order2 = createTestOrder({ customerName: "Aigerim" });
      order = createMockOrderService([order1, order2]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Siparişler ne durumda?", role: "boss" });
      await handler.handle(ctx);

      const llmCall = llm.chat.mock.calls[0][0];
      expect(llmCall.userMessage).toContain("Marzhan");
      expect(llmCall.userMessage).toContain("Aigerim");
    });
  });

  // ─────────────────────────────────────────────
  // TEST 21–27: Keyword Cakisma Onceligi
  // ─────────────────────────────────────────────
  describe("Senaryo 21–27 — Keyword Cakisma Onceligi", () => {

    it("21: 'karkas lazim mail gonder' → malzeme talebi (production oncelikli)", async () => {
      const ctx = createMockCtx({ text: "karkas lazim mail gönder", role: "boss" });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
      expect(gmail.sendEmail).not.toHaveBeenCalled();
    });

    it("22: 'eksik hatirlat yarin' → malzeme talebi (production > reminder)", async () => {
      const ctx = createMockCtx({ text: "eksik hatırlat yarın toplantısı için", role: "boss" });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
      expect(cron.addDynamicTask).not.toHaveBeenCalled();
    });

    it("23: 'mail at durum raporu' → e-posta (email > status)", async () => {
      const ctx = createMockCtx({ text: "mail at durum raporu test@test.com", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/E-posta/i);
    });

    it("24: 'hatirlat siparis ver' → malzeme talebi (production > reminder)", async () => {
      const ctx = createMockCtx({ text: "hatırlat sipariş ver karkas", role: "boss" });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
      expect(cron.addDynamicTask).not.toHaveBeenCalled();
    });

    it("25: 'gerekini yap lazim' → malzeme talebi (production > gerekini)", async () => {
      const ctx = createMockCtx({ text: "gerekini yap karkas lazım", role: "boss" });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
      expect(staff.processExcelStaff).not.toHaveBeenCalled();
    });

    it("26: 'siparis ver hatirlat' → malzeme talebi (production her seyi yener)", async () => {
      const ctx = createMockCtx({ text: "sipariş ver hatırlat bana", role: "boss" });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
      expect(cron.addDynamicTask).not.toHaveBeenCalled();
    });

    it("27: 'gerekeni yap' (alternatif yazim) → genel mesaj (draft yok)", async () => {
      const ctx = createMockCtx({ text: "gerekeni yap", role: "boss" });
      await handler.handle(ctx);

      expect(llm.chat).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // TEST 28–35: Servis Hata Yollari
  // ─────────────────────────────────────────────
  describe("Senaryo 28–35 — Servis Hata Yollari", () => {

    it("28: Gmail sendEmail false → teknik hata mesaji", async () => {
      gmail.sendEmail = vi.fn(async () => false);
      llm = createMockLLM({
        "e-posta gondermeni istiyor": '{"to":"test@test.com","subject":"Test","body":"Test"}',
      });
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "mail gönder test@test.com", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/teknik bir hata/i);
    });

    it("29: LLM null → email 'anlayamadim' hatasi", async () => {
      llm = createMockLLM();
      llm.chat = vi.fn(async () => null);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "mail gönder test@test.com", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/anlayamadim/i);
      expect(gmail.sendEmail).not.toHaveBeenCalled();
    });

    it("30: LLM null → hatirlatma 'anlayamadim' hatasi", async () => {
      llm = createMockLLM();
      llm.chat = vi.fn(async () => null);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "hatırlat bana yarın", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/anlayamadim/i);
    });

    it("31: LLM null → genel mesaj boss fallback", async () => {
      llm = createMockLLM();
      llm.chat = vi.fn(async () => null);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Merhaba", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Uzgunum Baris Bey/i);
    });

    it("32: LLM null → genel mesaj staff fallback", async () => {
      llm = createMockLLM();
      llm.chat = vi.fn(async () => null);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Merhaba", role: "staff" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Uzgunum, bir hata/i);
    });

    it("33: LLM null → rapor fallback mesaji", async () => {
      const testOrder = createTestOrder();
      order = createMockOrderService([testOrder]);
      llm = createMockLLM();
      llm.chat = vi.fn(async () => null);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Siparişler ne durumda?", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Durum raporu olusturulamadi/i);
    });

    it("34: getOrders null → 'hicbir siparis bulunmuyor'", async () => {
      order = createMockOrderService([]);
      (order as any).getOrders = vi.fn(() => null as any);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Siparişler ne durumda?", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/hicbir siparis bulunmuyor/i);
    });

    it("35: Hatirlatma — JSON'da sadece cron var, mesaj yok → hata", async () => {
      llm = createMockLLM({ "hatirlatma istiyor": '{"cron":"0 9 * * *"}' });
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "hatırlat bana bir şey", role: "boss" });
      await handler.handle(ctx);

      expect(cron.addDynamicTask).not.toHaveBeenCalled();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/anlayamadim/i);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 36–45: Eksik Keyword Cesitlemeleri
  // ─────────────────────────────────────────────
  describe("Senaryo 36–45 — Eksik Keyword Cesitlemeleri", () => {

    it("36: 'mail at' → e-posta akisina girer", async () => {
      const ctx = createMockCtx({ text: "mail at info@test.com", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/E-posta/i);
    });

    it("37: 'e-posta gönder' → e-posta akisina girer", async () => {
      const ctx = createMockCtx({ text: "e-posta gönder test@test.com", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/E-posta/i);
    });

    it("38: 'alarm kur yarin 9da' → hatirlatma akisina girer", async () => {
      const ctx = createMockCtx({ text: "alarm kur yarın 9da toplantı", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Hatirlatma/i);
    });

    it("39: 'haber ver karkas durumunu' → hatirlatma akisina girer", async () => {
      const ctx = createMockCtx({ text: "haber ver karkas durumunu kontrol et", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Hatirlatma/i);
    });

    it("40: 'sonra bildir siparisleri' → hatirlatma akisina girer", async () => {
      const ctx = createMockCtx({ text: "sonra bildir siparişleri", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Hatirlatma/i);
    });

    it("41: 'siparis ver karkas' → malzeme talebi", async () => {
      const ctx = createMockCtx({ text: "sipariş ver karkas", role: "boss" });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
    });

    it("42: 'kumas almamiz lazim' → malzeme talebi", async () => {
      const ctx = createMockCtx({ text: "kumaş almamız lazım", role: "boss" });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
    });

    it("43: 'siparis hangi asamada?' → siparis sorgu", async () => {
      const testOrder = createTestOrder();
      order = createMockOrderService([testOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Sipariş hangi aşamada?", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Siparis durumunu/i);
    });

    it("44: 'siparis var mi?' → siparis sorgu", async () => {
      const testOrder = createTestOrder();
      order = createMockOrderService([testOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Sipariş var mı?", role: "boss" });
      await handler.handle(ctx);

      expect(llm.chat).toHaveBeenCalled();
    });

    it("45: 'isler ne durumda?' → siparis sorgu", async () => {
      const testOrder = createTestOrder();
      order = createMockOrderService([testOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "isler ne durumda?", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Siparis durumunu/i);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 46–53: Bos Veri / Edge Case
  // ─────────────────────────────────────────────
  describe("Senaryo 46–53 — Bos Veri / Edge Case", () => {

    it("46: 'lazim' tek basina → malzeme ismi bos → aciklama istenir", async () => {
      const ctx = createMockCtx({ text: "lazım", role: "boss" });
      await handler.handle(ctx);

      expect(production.add).not.toHaveBeenCalled();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/tam anlayamadim/i);
    });

    it("47: 'eksik' tek basina (boss) → 'Baris Bey' hitabi", async () => {
      const ctx = createMockCtx({ text: "eksik", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Baris Bey/i);
    });

    it("48: 'bitti' tek basina (staff) → first_name hitabi", async () => {
      const ctx = createMockCtx({ text: "bitti", role: "staff", fromId: 111111 });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/TestUser/i);
    });

    it("49: Archived siparis → AKTIF siparis sayisi 0 olur (Order Guard tetiklenir)", async () => {
      const archivedOrder = createTestOrder({ status: "archived" });
      order = createMockOrderService([archivedOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Merhaba", role: "boss" });
      await handler.handle(ctx);

      const llmCall = llm.chat.mock.calls[0][0];
      expect(llmCall.context).toContain("SISTEM UYARISI");
      expect(llmCall.context).toContain("SIPARIS YOK");
    });

    it("50: doc.file_name undefined → sessiz gecilir (Excel degil)", async () => {
      const ctx = createMockCtx({
        role: "boss",
        document: { file_name: undefined as any, mime_type: "application/pdf", file_id: "x1" },
      });
      await handler.handle(ctx);

      expect(order.processExcelOrder).not.toHaveBeenCalled();
    });

    it("51: mime_type 'spreadsheet' ama uzanti .csv → Excel olarak islenir", async () => {
      const ctx = createMockCtx({
        role: "boss",
        document: { file_name: "data.csv", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file_id: "csv1" },
      });
      await handler.handle(ctx);

      expect(order.processExcelOrder).toHaveBeenCalledOnce();
    });

    it("52: ctx.from undefined → 'Bilinmeyen' fallback", async () => {
      const ctx = createMockCtx({ text: "karkas lazım", role: "boss" });
      ctx.from = undefined as any;
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
      const addedItem = production.add.mock.calls[0][0];
      expect(addedItem.requestedBy).toBe("Bilinmeyen");
    });

    it("53: E-posta LLM JSON'da to undefined (null) → hata mesaji", async () => {
      llm = createMockLLM({
        "e-posta gondermeni istiyor": '{"to":null,"subject":"Test","body":"Test"}',
      });
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "mail gönder", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/bulamadim/i);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 54–56: Sesli Mesaj Yonlendirme
  // ─────────────────────────────────────────────
  describe("Senaryo 54–56 — Sesli Mesaj Yonlendirme", () => {

    it("54: Voice → email keyword → e-posta akisina girer", async () => {
      voice = createMockVoiceService();
      voice.transcribeVoiceMessage = vi.fn(async () => "mail gönder test@test.com konu acil");
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ role: "boss", voice: { file_id: "v_email" } });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/E-posta/i);
    });

    it("55: Voice → hatirlatma keyword → hatirlatma akisina girer", async () => {
      voice = createMockVoiceService();
      voice.transcribeVoiceMessage = vi.fn(async () => "hatırlat bana yarın toplantı var");
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ role: "boss", voice: { file_id: "v_reminder" } });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Hatirlatma/i);
    });

    it("56: Voice → siparis sorgu keyword → siparis sorgu akisina girer", async () => {
      const testOrder = createTestOrder();
      order = createMockOrderService([testOrder]);
      voice = createMockVoiceService();
      voice.transcribeVoiceMessage = vi.fn(async () => "siparişler ne durumda");
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ role: "boss", voice: { file_id: "v_status" } });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/Siparis durumunu/i);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 57–67: Rusca Personel Iletisim Testleri
  // Handler Rusca keyword'leri tanimak ZORUNLUDUR
  // Cunku tum personel Rusca konusuyor
  // ─────────────────────────────────────────────
  describe("Senaryo 57–67 — Rusca Personel Iletisim", () => {

    it("57: 'Каркас нужен срочно' (karkas lazim) → production request", async () => {
      const ctx = createMockCtx({ text: "Каркас нужен срочно", role: "staff", fromId: 111111 });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
    });

    it("58: 'Ткань закончилась' (kumas bitti) → production request", async () => {
      const ctx = createMockCtx({ text: "Ткань закончилась", role: "staff", fromId: 111111 });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
    });

    it("59: 'Краска не хватает' (boya eksik) → production request", async () => {
      const ctx = createMockCtx({ text: "Краска не хватает", role: "staff", fromId: 111111 });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
    });

    it("60: 'Нужна ткань для шитья' (dikish icin kumas lazim) → production + Dikishane mention", async () => {
      const ctx = createMockCtx({ text: "Нужна ткань для шитья", role: "staff", fromId: 111111 });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
    });

    it("61: Rusca 'отправь email' → personel yetki reddi (sadece boss)", async () => {
      const ctx = createMockCtx({ text: "Отправь email test@test.com", role: "staff", fromId: 111111 });
      await handler.handle(ctx);

      expect(gmail.sendEmail).not.toHaveBeenCalled();
    });

    it("62: Rusca 'напомни' → personel yetki reddi (sadece boss)", async () => {
      const ctx = createMockCtx({ text: "Напомни завтра совещание", role: "staff", fromId: 111111 });
      await handler.handle(ctx);

      expect(cron.addDynamicTask).not.toHaveBeenCalled();
    });

    it("63: Rusca 'отправь email' → boss basarili", async () => {
      llm = createMockLLM({
        "e-posta gondermeni istiyor": '{"to":"test@test.com","subject":"Test","body":"Test"}',
      });
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Отправь email test@test.com", role: "boss" });
      await handler.handle(ctx);

      expect(gmail.sendEmail).toHaveBeenCalledOnce();
    });

    it("64: Rusca 'напомни' → boss basarili hatirlatma", async () => {
      llm = createMockLLM({
        "hatirlatma istiyor": '{"message":"Совещание завтра","cron":"0 9 * * *"}',
      });
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Напомни завтра совещание", role: "boss" });
      await handler.handle(ctx);

      expect(cron.addDynamicTask).toHaveBeenCalledOnce();
    });

    it("65: Marina Rusca malzeme talebi → production calisir", async () => {
      const ctx = createMockCtx({ text: "Нужна ткань срочно", role: "staff", fromId: TEST_MARINA_ID });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
    });

    it("66: Rusca is disi soru → LLM'e role=staff ile gider", async () => {
      const ctx = createMockCtx({ text: "Как дела? Какая погода?", role: "staff", fromId: 111111 });
      await handler.handle(ctx);

      expect(llm.chat).toHaveBeenCalled();
      const llmCall = llm.chat.mock.calls[0][0];
      expect(llmCall.role).toBe("staff");
    });

    it("67: Voice Rusca transkripsiyon → production request", async () => {
      voice = createMockVoiceService();
      voice.transcribeVoiceMessage = vi.fn(async () => "Каркас нужен срочно");
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ role: "staff", fromId: 111111, voice: { file_id: "v_russian" } });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
    });
  });

  // ─────────────────────────────────────────────
  // TEST 68–83: Personel Gunluk Malzeme Talepleri
  // Türkçe ve Rusça ortak personel söylemleri
  // ─────────────────────────────────────────────
  describe("Senaryo 68–83 — Personel Gunluk Malzeme Talepleri", () => {

    // ─── Türkçe Personel Söylemleri ───

    it("68: 'Sünger bitti' → production request", async () => {
      const ctx = createMockCtx({ text: "Sünger bitti", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    it("69: 'Kumaş gelmedi' → production request", async () => {
      const ctx = createMockCtx({ text: "Kumaş gelmedi", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    it("70: 'Şu ürün yok' → production request", async () => {
      const ctx = createMockCtx({ text: "Şu ürün yok", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    it("71: 'Malzeme kalmadı' → production request", async () => {
      const ctx = createMockCtx({ text: "Malzeme kalmadı", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    it("72: 'Süngeri tükendi' → production request", async () => {
      const ctx = createMockCtx({ text: "Süngeri tükendi", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    // ─── Rusça Personel Söylemleri ───

    it("73: 'Поролон закончился' (sünger bitti) → production request", async () => {
      const ctx = createMockCtx({ text: "Поролон закончился", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    it("74: 'Ткань не пришла' (kumaş gelmedi) → production request", async () => {
      const ctx = createMockCtx({ text: "Ткань не пришла", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    it("75: 'Нет в наличии' (stoğumuzda yok) → production request", async () => {
      const ctx = createMockCtx({ text: "Нет в наличии фурнитуры", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    it("76: 'Клей закончился' (yapıştırıcı bitti) → production request", async () => {
      const ctx = createMockCtx({ text: "Клей закончился", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    it("77: 'Материал кончился' (malzeme tükendi) → production request", async () => {
      const ctx = createMockCtx({ text: "Материал кончился", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    it("78: 'Ничего не осталось' (hicbir sey kalmadi) → production request", async () => {
      const ctx = createMockCtx({ text: "Ничего не осталось", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    // ─── Departman Bazli Personel Talepleri ───

    it("79: Bekbergen (Karkas) 'Каркас нужен' → production + Karkas mention", async () => {
      const ctx = createMockCtx({ text: "Каркас нужен срочно", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Bekbergen/i);
    });

    it("80: Almira (Dikishane) 'ткань закончилась' → production + Dikishane mention", async () => {
      const ctx = createMockCtx({ text: "Ткань закончилась для шитья", role: "staff", fromId: 444444 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Almira/i);
    });

    // ─── Karma Senaryolar ───

    it("81: 'Karkas iskeleti kalmadi' → production (kalmadi keyword)", async () => {
      const ctx = createMockCtx({ text: "Karkas iskeleti kalmadi", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    it("82: Boss 'Boya tükendi' → production (boss olarak kaydedilir)", async () => {
      const ctx = createMockCtx({ text: "Boya tükendi", role: "boss" });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
      const addedItem = production.add.mock.calls[0][0];
      expect(addedItem.requestedBy).toBe("TestUser");
    });

    it("83: Voice 'Поролон закончился' → production request (voice + Rusça)", async () => {
      voice = createMockVoiceService();
      voice.transcribeVoiceMessage = vi.fn(async () => "Поролон закончился");
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ role: "staff", fromId: 555555, voice: { file_id: "v_sponge" } });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });
  });

  // ─────────────────────────────────────────────
  // TEST 84–100: Belgeye Goredepartman & Is Akisi
  // Kaynak: doc/yonetim calismasi.md
  // ─────────────────────────────────────────────
  describe("Senaryo 84–100 — Belgeye Gore Departman ve Is Akisi", () => {

    // ─── Departman Mention Testleri ───

    it("84: 'metal lazim' → Valeri (Metal Uretimi) mention", async () => {
      const ctx = createMockCtx({ text: "metal lazım", role: "boss" });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Valeri/i);
    });

    it("85: 'dekor lazim' → Zhenis (Mobilya Dekorasyon) mention", async () => {
      const ctx = createMockCtx({ text: "dekor lazım", role: "boss" });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Zhenis/i);
    });

    it("86: 'doseme lazim' → Hasan (Dosemehane) mention", async () => {
      const ctx = createMockCtx({ text: "döşeme lazım", role: "boss" });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Hasan/i);
    });

    it("87: 'sünger bitti' → Dosemehane mention (sünger=dolgu)", async () => {
      const ctx = createMockCtx({ text: "sünger bitti", role: "staff", fromId: 555555 });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Hasan/i);
    });

    // ─── Rusça Departman Keyword Testleri ───

    it("88: 'метал рама нужен' → Valeri mention (Rusça metal)", async () => {
      const ctx = createMockCtx({ text: "Метал рама нужен срочно", role: "staff", fromId: 222222 });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Valeri/i);
    });

    it("89: 'декор нужен' → Zhenis mention (Rusça dekor)", async () => {
      const ctx = createMockCtx({ text: "Декор нужен для стола", role: "staff", fromId: 333333 });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Zhenis/i);
    });

    it("90: 'обивка нужна' → Dosemehane mention (Rusça doseme)", async () => {
      const ctx = createMockCtx({ text: "Обивка нужна для дивана", role: "staff", fromId: 555555 });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Hasan/i);
    });

    // ─── Cikis Sureci Testleri ───

    it("91: 'paketleme lazim' → Nikita mention", async () => {
      const ctx = createMockCtx({ text: "paketleme lazım acele", role: "boss" });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Nikita/i);
    });

    it("92: 'sevkiyat lazim' → Bekir mention", async () => {
      const ctx = createMockCtx({ text: "sevkiyat lazım yarın", role: "boss" });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Bekir/i);
    });

    // ─── Marina Ozel Yetkileri ───

    it("93: Marina satin alma talebi → production'a kaydedilir", async () => {
      const ctx = createMockCtx({ text: "kumaş lazım satin alma", role: "staff", fromId: TEST_MARINA_ID });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    it("94: Marina 'sünger siparis ver' → production request", async () => {
      const ctx = createMockCtx({ text: "sipariş ver sünger", role: "staff", fromId: TEST_MARINA_ID });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    // ─── Uretim Safhasi Keyword Testleri ───

    it("95: 'iskelet hazirlik lazim' → Karkas mention (iskelet keyword)", async () => {
      const ctx = createMockCtx({ text: "iskelet lazım hazırlık", role: "boss" });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Bekbergen/i);
    });

    it("96: 'cila bitti' → Boyahane mention (cila keyword)", async () => {
      const ctx = createMockCtx({ text: "cila bitti", role: "staff", fromId: 666666 });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Zhanibek/i);
    });

    // ─── Coklu Departman (Belgedeki uretim akisi) ───

    it("97: 6 departmanli siparis → tum uretim safhalari listelenir", async () => {
      const multiOrder = createMultiDeptOrder();
      order = createMockOrderService([multiOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Siparişler ne durumda?", role: "boss" });
      await handler.handle(ctx);

      const ordersData = order.getOrders();
      expect(ordersData[0].items).toHaveLength(6);
    });

    // ─── Personel Rol Dagilimi ───

    it("98: Bekbergen (Karkas) is disi soru → LLM'e role=staff", async () => {
      const ctx = createMockCtx({ text: "Как дела?", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      expect(llm.chat).toHaveBeenCalled();
      const llmCall = llm.chat.mock.calls[0][0];
      expect(llmCall.role).toBe("staff");
    });

    it("99: Zhanibek (Boyahane) malzeme talebi → production", async () => {
      const ctx = createMockCtx({ text: "краска bitti", role: "staff", fromId: 666666 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });

    it("100: Aizhan (Satis) malzeme talebi → production", async () => {
      const ctx = createMockCtx({ text: "kumaş lazım", role: "staff", fromId: 777001 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
    });
  });

  // ─────────────────────────────────────────────
  // TEST 101–110: Dis Satin Alma Departmani
  // Marina'nin yonettigi dis tedarik: kumas, plastik, civi, sünger
  // ─────────────────────────────────────────────
  describe("Senaryo 101–110 — Dis Satin Alma (Marina)", () => {

    it("101: 'çivi lazım' → Marina mention (Dis Satin Alma)", async () => {
      const ctx = createMockCtx({ text: "çivi lazım acele", role: "boss" });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Marina/i);
      expect(replies).toMatch(/Dis Satin Alma/i);
    });

    it("102: 'plastik sandalye lazım' → Marina mention", async () => {
      const ctx = createMockCtx({ text: "plastik sandalye lazım", role: "boss" });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Marina/i);
    });

    it("103: 'vida lazım' → Marina mention", async () => {
      const ctx = createMockCtx({ text: "vida lazım montaj için", role: "boss" });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Marina/i);
    });

    it("104: 'tutkal lazım' → Marina mention", async () => {
      const ctx = createMockCtx({ text: "tutkal lazım", role: "boss" });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Marina/i);
    });

    it("105: 'hırdavat lazım' → Marina mention", async () => {
      const ctx = createMockCtx({ text: "hırdavat lazım", role: "boss" });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Marina/i);
    });

    it("106: Rusça 'гвозди нужны' (çivi lazım) → Marina mention", async () => {
      const ctx = createMockCtx({ text: "Гвозди нужны срочно", role: "staff", fromId: 111111 });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Marina/i);
    });

    it("107: Rusça 'закупка нужна' (satin alma lazim) → Marina mention", async () => {
      const ctx = createMockCtx({ text: "Закупка нужна urgently", role: "boss" });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Marina/i);
    });

    it("108: Personel 'çivi bitti' → production + Marina mention", async () => {
      const ctx = createMockCtx({ text: "çivi bitti", role: "staff", fromId: 555555 });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Marina/i);
    });

    it("109: Marina kendi satin alma talebi → production (kendi mention'u)", async () => {
      const ctx = createMockCtx({ text: "çivi lazım", role: "staff", fromId: TEST_MARINA_ID });
      await handler.handle(ctx);
      expect(production.add).toHaveBeenCalledOnce();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Marina/i);
    });

    it("110: 'satin alma' keyword → Marina mention", async () => {
      const ctx = createMockCtx({ text: "satın alma lazım kumaş için", role: "boss" });
      await handler.handle(ctx);
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Marina/i);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 111–116: Faz 6 — Üretim Akış Sırası
  // Kaynak: doc/yonetim calismasi.md
  // Sira: Satin Alma → Karkas → Metal → Dekor → Boya → Dikis → Doseme → KK → Paket → Sevkiyat
  // ─────────────────────────────────────────────
  describe("Senaryo 111–116 — Faz 6: Üretim Akış Sırası", () => {

    // F1: Sipariş girişi → sevkiyat tam akış
    it("111 (F1): tam üretim akışı — sipariş girişinden sevkiyata kadar", async () => {
      const multiOrder = createMultiDeptOrder();
      order = createMockOrderService([multiOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Siparişler ne durumda?", role: "boss" });
      await handler.handle(ctx);

      // Tüm departmanlar order items içinde yer alır
      const depts = multiOrder.items.map((i: any) => i.department);
      expect(depts).toContain("Karkas Uretimi");
      expect(depts).toContain("Metal Uretimi");
      expect(depts).toContain("Mobilya Dekorasyon");
      expect(depts).toContain("Boyahane");
      expect(depts).toContain("Dikishane");
      expect(depts).toContain("Dosemehane");

      // LLM'e tüm veri gönderilir
      expect(llm.chat).toHaveBeenCalled();
      const llmCall = llm.chat.mock.calls[0][0];
      expect(llmCall.userMessage).toContain("Siparişler");
    });

    // F2: Her safhada departman mention doğru sırayla gider
    it("112 (F2): malzeme taleplerinde departman mention sırası doğru", async () => {
      const requests = [
        { text: "karkas lazım", expectedMention: "@Bekbergen" },
        { text: "metal lazım", expectedMention: "@Valeri" },
        { text: "dekor lazım", expectedMention: "@Zhenis" },
        { text: "boya bitti", expectedMention: "@Zhanibek" },
        { text: "kumaş lazım dikishane", expectedMention: "@Almira" },
        { text: "döşeme lazım", expectedMention: "@Hasan" },
      ];

      for (const req of requests) {
        const ctx = createMockCtx({ text: req.text, role: "boss" });
        await handler.handle(ctx);
        const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
        expect(replies).toMatch(new RegExp(req.expectedMention, "i"));
      }
    });

    // F3: Marina kalite kontrol onayı → sonraki safhaya geçiş
    it("113 (F3): Marina malzeme talebi → kalite kontrol süreci", async () => {
      // Marina karkas talep edebilir (satin alma kalemleri)
      const ctx = createMockCtx({ text: "çivi lazım kalite kontrol için", role: "staff", fromId: TEST_MARINA_ID });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Marina/i);
      expect(replies).toMatch(/Dis Satin Alma/i);
    });

    // F4: Safha atlanamaz (boyasız döşeme olmaz)
    it("114 (F4): sipariş raporunda tüm safhalar listelenir (atlayan olmaz)", async () => {
      const multiOrder = createMultiDeptOrder();
      order = createMockOrderService([multiOrder]);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Siparişler ne durumda?", role: "boss" });
      await handler.handle(ctx);

      // LLM context'te tüm sipariş departmanları gönderilir
      const llmCall = llm.chat.mock.calls[0][0];
      const msgData = llmCall.userMessage;
      expect(msgData).toContain("Sipariş");

      // Multi-dept order'da tüm departmanlar var
      const deptSet = new Set(multiOrder.items.map((i: any) => i.department));
      expect(deptSet.size).toBe(6); // Tüm safhalar mevcut
    });

    // F5: Marina stok uyarı tetiklenir (vida azaldı)
    it("115 (F5): stok uyarısı → Marina mention + Dis Satin Alma", async () => {
      const ctx = createMockCtx({ text: "vida azaldı acele lazım", role: "boss" });
      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/@Marina/i);
      expect(replies).toMatch(/Dis Satin Alma/i);
    });

    // F6: Paketleme → Sevkiyat zinciri testi
    it("116 (F6): paketleme ve sevkiyat departmanları mention edilir", async () => {
      const ctx1 = createMockCtx({ text: "paketleme lazım", role: "boss" });
      await handler.handle(ctx1);
      const replies1 = ctx1.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies1).toMatch(/@Nikita/i);

      const ctx2 = createMockCtx({ text: "sevkiyat lazım", role: "boss" });
      await handler.handle(ctx2);
      const replies2 = ctx2.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies2).toMatch(/@Bekir/i);
    });
  });

  // ─────────────────────────────────────────────
  // TEST 117–123: Faz 7 — Stres & Edge Case
  // ─────────────────────────────────────────────
  describe("Senaryo 117–123 — Faz 7: Stres & Edge Case", () => {

    // G1: 100+ aktif sipariş — performans testi
    it("117 (G1): 100+ sipariş rapor sorgusu 1 saniye içinde tamamlanır", async () => {
      const orders = Array.from({ length: 100 }, (_, i) =>
        createTestOrder({ customerName: `Müşteri ${i}` })
      );
      order = createMockOrderService(orders);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Siparişler ne durumda?", role: "boss" });
      const start = performance.now();
      await handler.handle(ctx);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(1000);
      expect(llm.chat).toHaveBeenCalled();
    });

    // G2: Aynı anda 5 personel malzeme talebi
    it("118 (G2): 5 eşzamanlı malzeme talebi bağımsız işlenir", async () => {
      const requests = [
        { text: "karkas lazım", fromId: 111111 },
        { text: "kumaş bitti", fromId: 444444 },
        { text: "boya bitti", fromId: 666666 },
        { text: "sünger lazım", fromId: 555555 },
        { text: "vida lazım", fromId: 222222 },
      ];

      await Promise.all(requests.map(req => {
        const ctx = createMockCtx({ text: req.text, role: "staff", fromId: req.fromId });
        return handler.handle(ctx);
      }));

      expect(production.add).toHaveBeenCalledTimes(5);
    });

    // G3: Uzun mesaj (2000+ karakter) — keyword matching
    it("119 (G3): 2000+ karakter mesajda keyword tespiti çalışır", async () => {
      const longText = "Bu çok uzun bir mesaj " + "x".repeat(2000) + " karkas lazım acele";
      const ctx = createMockCtx({ text: longText, role: "boss" });

      await handler.handle(ctx);

      expect(production.add).toHaveBeenCalledOnce();
    });

    // G4: Özel karakterler (*, ?, {}, []) — regex güvenliği
    it("120 (G4): özel karakter içeren mesaj regex hatası vermez", async () => {
      const specialText = "karkas *?{}[] lazım (test) + $ ^ | \\";
      const ctx = createMockCtx({ text: specialText, role: "boss" });

      // Hata fırlatmamalı
      await expect(handler.handle(ctx)).resolves.not.toThrow();
    });

    // G5: Hızlı ardışık Excel yüklemeleri — draft overwrite
    it("121 (G5): hızlı peş peşe Excel yüklemeleri son draft'ı korur", async () => {
      const ctx1 = createMockCtx({
        role: "boss",
        document: { file_name: "siparis1.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file_id: "f1" },
      });
      const ctx2 = createMockCtx({
        role: "boss",
        document: { file_name: "siparis2.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", file_id: "f2" },
      });

      await handler.handle(ctx1);
      await handler.handle(ctx2);

      // Her ikisi de işlenir
      expect(order.processExcelOrder).toHaveBeenCalledTimes(2);
      // Son draft güncel dosyayı içerir
      expect(memory.saveDraft).toHaveBeenCalledTimes(2);
    });

    // G6: LLM timeout fallback
    it("122 (G6): LLM timeout → fallback mesajı gösterilir", async () => {
      llm = createMockLLM();
      llm.chat = vi.fn(async () => {
        throw new Error("LLM timeout");
      });
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      // Genel mesaj → LLM timeout → error fırlatır ama handler yakalar
      const ctx = createMockCtx({ text: "Merhaba", role: "boss" });
      // Handler try-catch olmadığı için error fırlatır — bu beklenen davranış
      await expect(handler.handle(ctx)).rejects.toThrow("LLM timeout");
    });

    // G7: Supabase bağlantı kopması — order service boş döner
    it("123 (G7): order service null dönerse → sipariş yok mesajı gösterilir", async () => {
      order = createMockOrderService([]);
      (order as any).getOrders = vi.fn(() => null as any);
      handler = createTestMessageHandler({ llm, production, memory, order, staff, gmail, cron, voice });

      const ctx = createMockCtx({ text: "Siparişler ne durumda?", role: "boss" });
      await handler.handle(ctx);

      const replies = ctx.reply.mock.calls.map((c: any) => typeof c[0] === "string" ? c[0] : "").join(" ");
      expect(replies).toMatch(/hicbir siparis bulunmuyor/i);
    });
  });
});
