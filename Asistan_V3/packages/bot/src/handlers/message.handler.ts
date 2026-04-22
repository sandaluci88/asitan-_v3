import { Context } from "grammy";
import { ProductionService } from "../services/production.service.js";
import {
  SupabaseService,
  LlmService,
  StaffService,
  OrderService,
  XlsxUtils,
  logger,
} from "@sandaluci/core";
import { VoiceService } from "../services/voice.service.js";
import { memoryService } from "../services/memory.service.js";

export class MessageHandler {
  private productionService: ProductionService;
  private supabaseService: SupabaseService;
  private llmService: LlmService;
  private staffService: StaffService;
  private orderService: OrderService;
  private voiceService: VoiceService;

  constructor() {
    this.productionService = new ProductionService();
    this.supabaseService = SupabaseService.getInstance();
    this.llmService = LlmService.getInstance();
    this.staffService = StaffService.getInstance();
    this.orderService = OrderService.getInstance();
    this.voiceService = new VoiceService();
  }

  public async handle(ctx: Context) {
    if (!ctx.message) return;

    let originalText = "";

    if (ctx.message.text) {
      originalText = ctx.message.text;
    } else if (ctx.message.voice) {
      await ctx.reply("🎙️ Sesli mesajınızı dinliyorum, lütfen bekleyin...");

      // Dil seçimi Whisper'ın otomatik algılama yeteneğine bırakıldı (auto)
      const transcribedText = await this.voiceService.transcribeVoiceMessage(
        ctx,
        ctx.message.voice.file_id,
        "auto",
      );

      const isBoss = (ctx as any).role === "boss";
      if (!transcribedText) {
        await ctx.reply(
          isBoss
            ? "Üzgünüm Barış Bey, sesinizi net olarak çözümleyemedim. 🎙️ Tekrar dener misiniz veya yazılı olarak iletebilir misiniz?"
            : "❌ Üzgünüm, sesli mesajınızı şu an işleyemiyorum. Lütfen yazılı olarak mesaj gönderin.",
        );
        return;
      }

      await ctx.reply(`_"${transcribedText}"_`, { parse_mode: "Markdown" });
      originalText = transcribedText;
    } else if (ctx.message.document) {
      await this.handleDocument(ctx);
      return;
    } else if (ctx.message.contact) {
      await this.handleContact(ctx);
      return;
    } else {
      // Desteklenmeyen bir mesaj tipi, text, voice veya document değil
      return;
    }

    const text = originalText.toLowerCase();
    const role = (ctx as any).role;
    const _staffInfo = (ctx as any).staffInfo;
    const isBoss = role === "boss";

    // Malzeme Talebi Tespiti (Geliştirilmiş Regex/Keyword)
    const productionKeywords = [
      "lazım",
      "bitti",
      "eksik",
      "sipariş ver",
      "almamız lazım",
    ];
    const isProductionRequest = productionKeywords.some((kw) =>
      text.includes(kw),
    );

    if (isProductionRequest) {
      await this.handleProductionRequest(ctx, text, isBoss);
      return;
    }

    // Genel Mesaj İşleme (LLM + RAG simülasyonu)
    await this.handleGeneralMessage(ctx, originalText, isBoss, role);
  }

  public async handleCallback(ctx: Context) {
    if (!ctx.callbackQuery?.data) return;

    const data = ctx.callbackQuery.data;

    // Basit yönlendirme mantığı (Index.ts'dekine benzer buton aksiyonları için)
    if (data.startsWith("aw:")) {
      // Atama işlemi
      await ctx.answerCallbackQuery("İşçi atandı.");
    } else if (data.startsWith("select_dept_staff:")) {
      // Personel listesi gösterimi
      await ctx.answerCallbackQuery();
    } else if (data.startsWith("reject_order:")) {
      await ctx.answerCallbackQuery("Sipariş iptal edildi.");
    }
  }

  private async handleDocument(ctx: Context) {
    const doc = ctx.message?.document;
    if (!doc) return;

    const fileName = doc.file_name || "adsiz_dosya";
    const isExcel =
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".xls") ||
      doc.mime_type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      doc.mime_type === "application/vnd.ms-excel";

    if (!isExcel) {
      return;
    }

    await ctx.reply("📊 Excel sipariş dosyası algılandı, işleniyor...");

    try {
      const file = await ctx.getFile();
      const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error("Dosya indirilemedi");
      const buffer = Buffer.from(await response.arrayBuffer());

      const rows = await XlsxUtils.parseExcel(buffer);

      if (rows.length === 0) {
        await ctx.reply("❌ Excel dosyası boş veya okunamadı.");
        return;
      }

      const isBoss = (ctx as any).role === "boss";

      if (isBoss) {
        // Excel dosyasını geçici hafızada "son yüklenen" olarak tut
        memoryService.saveDraft(`last_xl_${ctx.from?.id}`, {
          fileName,
          buffer,
        });

        await ctx.reply(
          `📊 *Excel Dosyası Alındı:* \`${fileName}\`\nSipariş olarak işleniyor...`,
        );

        // Doğrudan sipariş olarak işle
        await this.orderService.processExcelOrder(
          buffer,
          ctx.from?.id.toString() || "0",
        );
        return;
      }

      await ctx.reply(
        "❌ Excel dosyası işleme yetkisi sadece Barış Bey'e aittir.",
      );
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error?.message || error.message;
      logger.error(
        {
          error: errorMessage,
          status: error.status,
          fileId: doc.file_id,
          fileName: fileName,
          chatId: ctx.chat?.id,
          userId: ctx.from?.id,
        },
        "❌ Excel dosyası işlenirken bir hata oluştu.",
      );
      await ctx.reply(
        "❌ Üzgünüm, Excel dosyanızı işlerken bir sorun çıktı. Lütfen dosyanın doğru formatta olduğundan emin olup tekrar dener misiniz?",
      );
    }
  }

  private async handleProductionRequest(
    ctx: Context,
    text: string,
    isBoss: boolean,
  ) {
    // Basit bir ekstraksiyon (İleride LLM ile geliştirilebilir)
    const material = text
      .replace(/lazım|bitti|eksik|sipariş ver|almamız lazım/g, "")
      .trim();

    if (material) {
      const item = await this.productionService.add({
        name: material,
        requestedBy: ctx.from?.first_name || "Bilinmeyen",
        notes: `Otomatik algılama: ${ctx.message?.text}`,
      });

      // Departman tespiti (basit eşleştirme)
      let mentionText = "";
      if (text.includes("karkas") || text.includes("iskelet")) {
        const staff = this.staffService.getStaffByDepartment("Karkas Üretimi");
        if (staff.length > 0)
          mentionText = `\n\n🔔 @${staff[0].name} ilgilenebilir mi?`;
      } else if (text.includes("kumaş") || text.includes("dikiş")) {
        const staff = this.staffService.getStaffByDepartment("Dikişhane");
        if (staff.length > 0)
          mentionText = `\n\n🔔 @${staff[0].name} stok kontrolü yapabilir mi?`;
      }

      await ctx.reply(
        `✅ *Kayıt Edildi:* "${item.name}" malzeme listesine eklendi. \n\nDurum: *Talep Edildi*${mentionText}`,
        { parse_mode: "Markdown" },
      );
    } else {
      const greeting = isBoss
        ? "Barış Bey"
        : ctx.from?.first_name || "Ekip Arkadaşım";

      await ctx.reply(
        `Ne lazım olduğunu tam anlayamadım ${greeting}, tekrar söyler misiniz?`,
      );
    }
  }

  private async handleGeneralMessage(
    ctx: Context,
    text: string,
    isBoss: boolean,
    role: string,
  ) {
    const lowerText = text.toLowerCase();

    // "Gerekini yap" talimatı (Excel -> Personel Listesi dönüşümü)
    if (
      isBoss &&
      (lowerText.includes("gerekini yap") || lowerText.includes("gerekeni yap"))
    ) {
      const lastXl = memoryService.getDraft(`last_xl_${ctx.from?.id}`);
      if (lastXl) {
        await ctx.reply(
          "🫡 Anlaşıldı Barış Bey, son gönderdiğiniz dosyayı *Personel Listesi* olarak işliyorum...",
          { parse_mode: "Markdown" },
        );
        const result = await this.staffService.processExcelStaff(
          lastXl.buffer,
          ctx.from?.id.toString() || "0",
        );
        await ctx.reply(
          `✅ Personel listesi başarıyla güncellendi: ${result.count} kişi kaydedildi.`,
        );
        memoryService.deleteDraft(`last_xl_${ctx.from?.id}`);
        return;
      }
    }

    // E-posta Gönderme Tespiti
    const emailKeywords = [
      "mail at",
      "mail gönder",
      "e-posta at",
      "e-posta gönder",
    ];
    const isEmailRequest = emailKeywords.some((kw) => text.includes(kw));

    if (isEmailRequest) {
      if (!isBoss) {
        await ctx.reply(
          "❌ E-posta gönderme yetkisi sadece Barış Bey'e aittir.",
        );
        return;
      }
      await this.handleEmailRequest(ctx, text);
      return;
    }

    // Hatırlatıcı / Zamanlı Görev Tespiti (Geliştirilmiş regex ve Türkçe karakter desteği)
    const reminderKeywords = [
      "hatırlat",
      "hatirlat",
      "zamanında",
      "zamaninda",
      "alarm kur",
      "haber ver",
      "sonra bildir",
    ];
    const isReminderRequest = reminderKeywords.some((kw) =>
      lowerText.includes(kw),
    );

    if (isReminderRequest) {
      if (!isBoss) {
        await ctx.reply(
          "❌ Hatırlatma kurma yetkisi sadece Barış Bey'e aittir.",
        );
        return;
      }
      await this.handleReminderRequest(ctx, text);
      return;
    }

    // Sipariş Durum Sorgulama Tespiti
    const statusKeywords = [
      "durum",
      "ne durumda",
      "hangi aşamada",
      "rapor",
      "bilgi ver",
      "göster",
      "listele",
      "özet",
      "liste",
      "varmı",
      "var mı",
      "siparişler",
      "neler var",
    ];
    const isStatusQuery =
      (lowerText.includes("sipariş") ||
        lowerText.includes("muşteri") ||
        lowerText.includes("müşteri") ||
        lowerText.includes("işler") ||
        lowerText.includes("isler")) &&
      (statusKeywords.some((kw) => lowerText.includes(kw)) ||
        lowerText.endsWith("?") ||
        lowerText.includes("var mı") ||
        lowerText.includes("varmı"));

    if (isStatusQuery && isBoss) {
      await this.handleOrderStatusQuery(ctx, text, isBoss);
      return;
    }

    // Supabase'den gerçek zamanlı bağlam sorgula
    const activeOrders = this.orderService
      .getOrders()
      .filter((o) => o.status !== "archived");
    const orderCount = activeOrders.length;

    let context = `Sandaluci üretim veritabanı aktif. Şu an sistemde ${orderCount} adet AKTİF sipariş bulunmaktadır.`;

    if (orderCount === 0) {
      context +=
        "\n[SİSTEM UYARISI] SİSTEMDE HİÇ SİPARİŞ YOK. Ayça 'Sipariş-Yok Kuralı'na (ORDER GUARD) kesinlikle uymalıdır. Üretimle ilgili hayali bilgi verme, soru sorma.";
    } else {
      const orderSummary = activeOrders
        .map((o) => `${o.orderNumber} (${o.customerName})`)
        .join(", ");
      context += `\nAktif Siparişler: ${orderSummary}`;
    }

    // 1. Get recent chat history (last 3 days)
    const history = await memoryService.getHistory(ctx.chat?.id || "default");
    const formattedHistory = history.map((h) => ({
      role: h.role,
      content: h.content,
    }));

    // 2. Add current user message to memory
    await memoryService.saveMessage(ctx.chat?.id || "default", "user", text);

    // 3. Send to LLM with history and ROLE
    const response = await this.llmService.chat({
      userMessage: text,
      context,
      history: formattedHistory,
      role,
    });

    // 4. Save AI response to memory
    if (response) {
      await memoryService.saveMessage(
        ctx.chat?.id || "default",
        "assistant",
        response,
      );
    }

    // Response'un Barış Bey'e bildirildi. yoksa personele mi gittiğini ayarla
    await ctx.reply(
      response ||
        (isBoss
          ? "Üzgünüm Barış Bey, bir hata oluştu."
          : "Üzgünüm, bir hata oluştu."),
    );
  }

  private async handleEmailRequest(ctx: Context, text: string) {
    await ctx.reply("📧 E-posta gönderim talebinizi inceliyorum...");

    // LLM'den e-posta detaylarını JSON olarak çekelim
    const prompt = `
      Kullanıcı senden bir e-posta göndermeni istiyor. Aşağıdaki metinden alıcı e-posta adresini (kime gidecek), konuyu ve mail içeriğini çıkar.

      Kullanıcı Metni: "${text}"

      Lütfen YALNIZCA aşağıdaki JSON formatında yanıt ver, başka hiçbir açıklama ekleme:
      {
        "to": "alici@ornek.com",
        "subject": "E-posta Konusu",
        "body": "E-posta içeriği..."
      }

      Eğer metinde alıcı e-posta adresi yazmıyorsa "to" alanını boş ("") bırak.
    `;

    try {
      const response = await this.llmService.chat({ userMessage: prompt, context: "Email Parse Mode" });
      if (!response) throw new Error("LLM Error");

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("JSON not found in response");
      const jsonStr = jsonMatch[0].trim();
      const parsed = JSON.parse(jsonStr);

      if (!parsed.to) {
        await ctx.reply(
          "❌ Kime e-posta atacağımı mesajınızda bulamadım. Lütfen e-posta adresini belirterek tekrar yazar mısınız?",
        );
        return;
      }

      const { GmailService } = await import("../services/gmail.service.js");
      const gmailService = GmailService.getInstance();

      const success = await gmailService.sendEmail(
        parsed.to,
        parsed.subject || "Sandaluci Bilgilendirme",
        parsed.body || "",
      );

      if (success) {
        await ctx.reply(
          `✅ E-posta başarıyla gönderildi!\n\n**Alıcı:** ${parsed.to}\n**Konu:** ${parsed.subject}`,
        );
      } else {
        await ctx.reply("❌ E-posta gönderilirken teknik bir hata oluştu.");
      }
    } catch (e) {
      console.error("Email parsing error:", e);
      await ctx.reply(
        "❌ E-posta bilgilerinizi tam anlayamadım, lütfen daha açık yazar mısınız?",
      );
    }
  }

  private async handleReminderRequest(ctx: Context, text: string) {
    await ctx.reply("⏰ Hatırlatma talebinizi ayarlıyorum...");

    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: "Asia/Almaty",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    };
    const currentTime = now.toLocaleString("tr-TR", options);

    const prompt = `
      Kullanıcı senden bir hatırlatma ayarlamanı istiyor. Aşağıdaki metinden hatırlatılacak mesajı ve zamanını (cron formatında) çıkar.
      Zaman çıkarımı yaparken şunlara dikkat et:
      - Kazakistan/Almatı saati (UTC+5) kullanıyoruz. Şu anki zaman: ${currentTime}
      - Cron formatı sırasıyla şunlardır: Dakika(0-59) Saat(0-23) Gün(1-31) Ay(1-12) HaftanınGünü(0-7)
      - Örnek: "10 dakika sonra" -> şu anki dakikaya 10 ekle ve mod 60 al. Saati gerekirse artır.
      - Örnek: "Yarın sabah 9'da" -> "0 9 <yarınki_gun> <yarınki_ay> *"
      - Örnek: "Barış bey'e karkasları sor" -> mesaj bu olacak.

      Lütfen YALNIZCA aşağıdaki JSON formatında yanıt ver, başka hiçbir açıklama ekleme:
      {
        "message": "Hatırlatılacak mesajın kendisi",
        "cron": "0 10 * * *"
      }

      Kullanıcı Metni: "${text}"
    `;

    try {
      const response = await this.llmService.chat(
        { userMessage: prompt, context: "Reminder Parse Mode" },
      );
      if (!response) throw new Error("LLM Error");

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("JSON not found in response");
      const jsonStr = jsonMatch[0].trim();
      const parsed = JSON.parse(jsonStr);

      if (!parsed.message || !parsed.cron) {
        throw new Error("Missing fields in JSON");
      }

      const { CronService } = await import("../services/cron.service.js");
      const cronService = CronService.getInstance();

      const task = cronService.addDynamicTask(
        ctx.chat?.id || "",
        parsed.message,
        parsed.cron,
        false,
      );

      await ctx.reply(
        `✅ Hatırlatma kuruldu!\n\n**Mesaj:** ${task.message}\n**Zaman (Cron):** ${task.triggerTimeStr}`,
      );
    } catch (e) {
      console.error("Reminder parsing error:", e);
      await ctx.reply(
        "❌ Hatırlatma zamanını veya detayını tam anlayamadım, lütfen daha açık yazar mısınız (Örn: '5 dakika sonra Barış Beye mesaj at' veya 'Yarın sabah 10 da toplantı var de').",
      );
    }
  }

  private async handleOrderStatusQuery(
    ctx: Context,
    text: string,
    isBoss: boolean,
  ) {
    if (!isBoss) {
      await ctx.reply(
        "❌ Sipariş raporlarını sorgulama yetkisi sadece yöneticilere aittir.",
      );
      return;
    }

    await ctx.reply(
      "📊 Sipariş durumunu veritabanından kontrol edip raporluyorum, lütfen bekleyin...",
    );

    // Siparişleri çek
    const orders = this.orderService.getOrders();
    if (!orders || orders.length === 0) {
      await ctx.reply("Şu anda sistemde kayıtlı hiçbir sipariş bulunmuyor.");
      return;
    }

    // LLM'e veritabanındaki veriyi verip, kullanıcının ne sorduğunu ve doğru raporu üretmesini isteyelim (RAG yaklaşımı).
    // Basit bir JSON formatında sipariş ve durumları verelim.
    const ordersData = orders.map((o: any) => ({
      Musteri: o.customerName,
      Teslim_Tarihi: o.deliveryDate,
      Durum: o.items.map((i: any) => ({
        Urun: i.product,
        Miktar: i.quantity,
        Departman: i.department,
        Isi_Yapan: i.assignedWorker || "Atanmadı",
        Kumas_Geldimi: i.fabricDetails
          ? i.fabricDetails.arrived
            ? "Geldi"
            : "Bekleniyor"
          : "N/A",
      })),
    }));

    const prompt = `
      Yönetici aşağıdaki soruyu sordu: "${text}"

      Şu an Veritabanında (Sistemde) kayıtlı olan tüm güncel sipariş bilgileri (JSON) şunlar:
      ${JSON.stringify(ordersData, null, 2)}

      Yöneticinin bu sorusuna yukarıdaki verilere TıpaTıp ve eksiksiz uyarak, güzel, net ve profesyonel bir şirket asistanı (Ayça) gibi Rapor hazırla.

      🚨 KRİTİK KURAL:
      - SADECE VE SADECE sana yukarıdaki JSON listesinde verilen verileri raporla.
      - Eğer yukarıdaki verilerde bir sipariş veya müşteri yoksa, KESİNLİKLE ama KESİNLİKLE uydurma veri üretme.
      - Veriler boşsa veya sorulan kişi verilerde yoksa "Kayıtlarımda bu kriterlere uygun bir sipariş bulunamadı" şeklinde cevap ver.
      - Yorum ekleme, varsayımda bulunma.
    `;

    try {
      const response = await this.llmService.chat({ userMessage: prompt });
      await ctx.reply(response || "❌ Durum raporu oluşturulamadı.");
    } catch (e) {
      console.error("Order Status Report Error:", e);
      await ctx.reply("❌ Veritabanı okunurken bir hata oluştu.");
    }
  }

  private async handleContact(ctx: Context) {
    const contact = ctx.message?.contact;
    if (!contact || !ctx.from) return;

    const phone = contact.phone_number;
    const userId = ctx.from.id;

    await ctx.reply("🔄 Kimlik bilgileriniz kontrol ediliyor...");

    try {
      const staff = await this.staffService.verifyStaffByPhone(userId, phone);

      if (staff) {
        await ctx.reply(
          `✅ *Kayıt Başarılı!* \n\nHoşgeldin *${staff.name}*. \nArtık Sandaluci üretim sistemine dahilsin. ${staff.department} departmanı için gelecek iş emirlerini buradan alacaksın.`,
          {
            parse_mode: "Markdown",
            reply_markup: { remove_keyboard: true },
          },
        );

        // Patrona bilgi ver
        const bossId = process.env.TELEGRAM_BOSS_ID;
        if (bossId) {
          await ctx.api.sendMessage(
            bossId,
            `📢 *Yeni Personel Kaydı:* \n\n*İsim:* ${staff.name}\n*Departman:* ${staff.department}\n*ID:* ${userId}`,
            { parse_mode: "Markdown" },
          );
        }
      } else {
        await ctx.reply(
          "❌ Üzgünüm, paylaştığınız telefon numarası personel listemizde bulunamadı. Lütfen Barış Bey ile iletişime geçin.",
          { reply_markup: { remove_keyboard: true } },
        );
      }
    } catch (error) {
      logger.error({ error }, "Contact verification error");
      await ctx.reply("❌ Kayıt sırasında teknik bir hata oluştu.");
    }
  }
}
