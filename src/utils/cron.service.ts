import cron from "node-cron";
import { Bot, InlineKeyboard } from "grammy";
import { ProductionService } from "./production.service";
import { CalendarService } from "./calendar.service";
import { StaffService } from "./staff.service";
import { OrderService } from "./order.service";
import { KenanService } from "./kenan.service";
import { ProactiveService } from "./proactive.service";
import { t, translateDepartment } from "./i18n";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export interface DynamicTask {
  id: string;
  chatId: string | number;
  message: string;
  triggerTimeStr: string; // Example: "30 15 4 3 *"
  isRecurring: boolean;
}

export class CronService {
  private static instance: CronService;

  private productionService: ProductionService;
  private calendarService: CalendarService;
  private staffService: StaffService;
  private orderService: OrderService;
  private kenanService: KenanService;
  private proactiveService: ProactiveService;
  private bot: Bot;
  private targetChatId: string | number;

  private tasksFile = path.resolve("./data/tasks.json");
  private activeDynamicJobs: Map<string, cron.ScheduledTask> = new Map();

  private constructor(bot: Bot, chatId: string | number) {
    this.bot = bot;
    this.targetChatId = chatId;
    this.productionService = new ProductionService();
    this.calendarService = new CalendarService();
    this.staffService = StaffService.getInstance();
    this.orderService = OrderService.getInstance();
    this.kenanService = new KenanService();
    this.proactiveService = new ProactiveService(bot, Number(chatId));

    // Klasör yoksa oluştur
    const dir = path.dirname(this.tasksFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public static getInstance(bot?: Bot, chatId?: string | number): CronService {
    if (!CronService.instance) {
      if (!bot || !chatId) {
        throw new Error(
          "CronService requires bot and chatId for initialization",
        );
      }
      CronService.instance = new CronService(bot, chatId);
    }
    return CronService.instance;
  }

  public init() {
    // Mevcut sabit görevler
    this.initStaticJobs();

    // Dinamik görevleri yükle ve başlat
    this.loadAndScheduleDynamicTasks();
  }

  private initStaticJobs() {
    // Sabah Brifingi (Haftaiçi 08:30)
    cron.schedule(
      "30 8 * * 1-5",
      () => {
        this.sendMorningBriefing();
      },
      { timezone: "Asia/Almaty" },
    );

    // Akşam Brifingi (Haftaiçi 18:00)
    cron.schedule(
      "0 18 * * 1-5",
      () => {
        this.sendEveningBriefing();
      },
      { timezone: "Asia/Almaty" },
    );

    // Barış Bey: Malzeme Takibi Hatırlatması (Her gün 10:00)
    cron.schedule(
      "0 10 * * *",
      () => {
        this.checkPendingMaterials();
      },
      { timezone: "Asia/Almaty" },
    );

    // --- PERSONEL KONTROL MESAJLARI ---
    cron.schedule(
      "0 9 * * 1-5",
      () => {
        this.sendStaffControlMessage("morning");
      },
      { timezone: "Asia/Almaty" },
    );
    cron.schedule(
      "30 13 * * 1-5",
      () => {
        this.sendStaffControlMessage("noon");
      },
      { timezone: "Asia/Almaty" },
    );
    cron.schedule(
      "30 17 * * 1-5",
      () => {
        this.sendStaffControlMessage("evening");
      },
      { timezone: "Asia/Almaty" },
    );

    // KUMAŞ & DIŞ ALIM TAKİP: Marina'ya hatırlatma (Pazar hariç 09:00)
    cron.schedule(
      "0 9 * * 1-6",
      () => {
        this.checkFabricAndPurchaseStatus();
      },
      { timezone: "Asia/Almaty" },
    );

    // TESLİM TARİHİ: 5 gün kala satıcıya bildirim (Her gün 10:00)
    cron.schedule(
      "0 10 * * *",
      () => {
        this.checkDeliveryApproaching();
      },
      { timezone: "Asia/Almaty" },
    );

    // ÜRETİM TAKİP: Dağıtımdan 5 iş günü sonra personel durum sorgusu (Pazar hariç 10:30)
    cron.schedule(
      "30 10 * * 1-6",
      () => {
        this.checkProductionStatus();
      },
      { timezone: "Asia/Almaty" },
    );

    // --- PROAKTİF KONTROL (HEARTBEAT) ---
    // Kazakistan saati ile sabah 06:00 - 20:00 arası her saat başı çalışır.
    cron.schedule(
      "0 6-20 * * *",
      () => {
        this.proactiveService.runHeartbeat();
      },
      { timezone: "Asia/Almaty" },
    );
  }

  // --- DINAMIK GÖREV YÖNETIMİ ---

  private getStoredTasks(): DynamicTask[] {
    if (!fs.existsSync(this.tasksFile)) {
      return [];
    }
    try {
      const data = fs.readFileSync(this.tasksFile, "utf-8");
      if (!data || data.trim() === "") return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? (parsed as DynamicTask[]) : [];
    } catch (error) {
      console.error("❌ tasks.json okunamadı veya geçersiz:", error);
      return [];
    }
  }

  private saveTasks(tasks: DynamicTask[]) {
    try {
      fs.writeFileSync(this.tasksFile, JSON.stringify(tasks, null, 2), "utf-8");
    } catch (error) {
      console.error("❌ tasks.json yazılamadı:", error);
    }
  }

  public addDynamicTask(
    chatId: string | number,
    message: string,
    triggerTimeStr: string,
    isRecurring: boolean = false,
  ): DynamicTask {
    const newTask: DynamicTask = {
      id: uuidv4(),
      chatId,
      message,
      triggerTimeStr,
      isRecurring,
    };

    const tasks = this.getStoredTasks();
    tasks.push(newTask);
    this.saveTasks(tasks);

    this.scheduleJob(newTask);
    return newTask;
  }

  private loadAndScheduleDynamicTasks() {
    const tasks = this.getStoredTasks();
    tasks.forEach((task) => this.scheduleJob(task));
    console.log(`✅ ${tasks.length} adet dinamik görev yüklendi.`);
  }

  private scheduleJob(task: DynamicTask) {
    if (!cron.validate(task.triggerTimeStr)) {
      console.error(
        `❌ Geçersiz cron verisi: ${task.triggerTimeStr} for task ${task.id}`,
      );
      this.removeTask(task.id);
      return;
    }

    const job = cron.schedule(
      task.triggerTimeStr,
      async () => {
        try {
          await this.bot.api.sendMessage(
            task.chatId,
            `⏰ *Hatırlatma:* \n\n${task.message}`,
            {
              parse_mode: "Markdown",
            },
          );
        } catch (err) {
          console.error(
            `❌ Hatırlatma gönderilemedi (Chat: ${task.chatId}):`,
            err,
          );
        }

        // Tek seferlikse dosyadan sil ve durdur
        if (!task.isRecurring) {
          job.stop();
          this.activeDynamicJobs.delete(task.id);
          this.removeTask(task.id);
        }
      },
      { timezone: "Asia/Almaty" },
    );

    this.activeDynamicJobs.set(task.id, job);
  }

  public removeTask(taskId: string) {
    let tasks = this.getStoredTasks();
    tasks = tasks.filter((t) => t.id !== taskId);
    this.saveTasks(tasks);

    const job = this.activeDynamicJobs.get(taskId);
    if (job) {
      job.stop();
      this.activeDynamicJobs.delete(taskId);
    }
  }

  // --- MEVCUT YARDIMCI FONKSIYONLAR ---

  async sendMorningBriefing() {
    const events = await this.calendarService.getTodayAgenda();
    let calendarSummary = "\n\n📅 *Bugünkü Ajandanız:*";
    if (events.length === 0) {
      calendarSummary += "\nBugün için bir program gözükmüyor.";
    } else {
      events.forEach((event) => {
        const start = new Date(event.start).toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        calendarSummary += `\n⏰ ${start} - ${event.summary}`;
      });
    }
    const message = `☀️ *Günaydın Barış Bey!*\n\nBugünün üretim planı ve personel yoklaması için Ayça hazır. \n\n📌 *Stratejik Odak:* Bugün "Hoshin Kanri" hedeflerimize uygun olarak üretim darboğazlarını ve israfları (Muda) minimize etmeye odaklanalım.${calendarSummary}`;
    await this.bot.api.sendMessage(this.targetChatId, message, {
      parse_mode: "Markdown",
    });
  }

  async sendEveningBriefing() {
    const message = `🌙 *İyi Akşamlar Barış Bey!*\n\nBugünün üretim raporu hazırlandı. Personel ile akşam check-pointleri tamamlandı. Standartlaştırılmış süreçlerimiz sayesinde yarın daha hızlı olacağız. İyi dinlenmeler! ✨`;
    await this.bot.api.sendMessage(this.targetChatId, message, {
      parse_mode: "Markdown",
    });
  }

  async checkPendingMaterials() {
    const pending = await this.productionService.getPending();
    if (pending.length > 0) {
      let list = `⚠️ *Barış Bey, Bekleyen Malzeme Talepleri:*\n\n`;
      pending.forEach((item, index) => {
        list += `${index + 1}. ${item.name} (${item.quantity || "N/A"}) - *${item.status}*\n`;
      });
      await this.bot.api.sendMessage(this.targetChatId, list, {
        parse_mode: "Markdown",
      });
    }
  }

  async sendStaffControlMessage(type: "morning" | "noon" | "evening") {
    // ORDER GUARD: Aktif sipariş yoksa personel kontrol mesajı gönderme
    const activeItems = this.orderService.getActiveTrackingItems();
    if (activeItems.length === 0) {
      console.log("📭 Aktif sipariş yok, personel kontrol mesajı atlanıyor.");
      return;
    }

    const staff = this.staffService.getAllStaff();
    const bossId = Number((process.env.TELEGRAM_BOSS_ID || "").trim());
    for (const member of staff) {
      if (!member.telegramId) continue;
      // Patron'a personel kontrol mesajı gönderme
      if (member.telegramId === bossId) continue;
      // Marina'ya da personel kontrol mesajı gönderme (koordinatördür, usta değil)
      if (this.staffService.isCoordinator(member.telegramId)) continue;
      let message = "";
      switch (type) {
        case "morning":
          // EĞER KENAN AKTİFSE: Özel sabah mesajı oluştur
          if (process.env.ENABLE_KENAN === "true") {
            message = await this.kenanService.generateCoachingMessage(
              member,
              "Sabah ve güne başlama motivasyonu",
            );
          } else {
            message = `☀️ *Günaydın ${member.name}!* \n\nBugün *${member.department}* bölümünde her şey hazır mı? İşini daha iyi yapabilmen için önünde bir engel veya eksik malzeme var mı?`;
          }
          break;
        case "noon":
          message = `🕛 *Selam ${member.name}!* \n\nGünün yarısı bitti. Planın neresindeyiz? Seni engelleyen bir durum (İnsan, Makine, Malzeme, Metot) var mı?`;
          break;
        case "evening":
          message = `🌙 *İyi Akşamlar ${member.name}!* \n\nBugün bölümünde neler başardın? Karşılaştığın problemleri kalıcı olarak çözmek için bir standart geliştirebildin mi? Yarın için bir hazırlığın var mı?`;
          break;
      }
      try {
        await this.bot.api.sendMessage(member.telegramId, message, {
          parse_mode: "Markdown",
        });
      } catch (error) {
        console.error(
          `❌ Personel mesajı gönderilemedi (${member.name}):`,
          error,
        );
      }
    }
  }

  async checkFabricAndPurchaseStatus() {
    try {
      const pendingItems = this.orderService.getPendingFabricReminders();
      if (pendingItems.length === 0) return;

      const marina = this.staffService.getMarina();
      if (!marina || !marina.telegramId) {
        console.warn("⚠️ Marina bulunamadı, kumaş/dış alım hatırlatması atlanıyor.");
        return;
      }

      const lang = (marina.language || "ru") as any;
      let message = t("fabric_purchase_reminder", lang);

      const keyboard = new InlineKeyboard();
      let count = 0;

      for (const { order, item } of pendingItems) {
        count++;
        const fabricInfo = item.fabricDetails?.name
          ? `\n   ${t("dept_fabric", lang)}: ${item.fabricDetails.name}`
          : "";

        message += t("fabric_purchase_item", lang, {
          num: String(count),
          customer: order.customerName,
          product: item.product,
          quantity: String(item.quantity),
          department: translateDepartment(item.department, lang),
          fabricInfo,
        });

        keyboard
          .text(
            t("btn_fabric_arrived", lang),
            `fabric_purchase_ok:${item.id}`,
          )
          .text(
            t("btn_fabric_not_arrived", lang),
            `fabric_purchase_pending:${item.id}`,
          )
          .text(
            t("btn_fabric_ordered", lang),
            `fabric_purchase_ordered:${item.id}`,
          );

        if (count < pendingItems.length) {
          keyboard.row();
        }

        // lastReminderAt güncelle
        item.lastReminderAt = new Date().toISOString();
        item.updatedAt = new Date().toISOString();
      }

      await this.bot.api.sendMessage(marina.telegramId, message, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });

      console.log(
        `🧶 Kumaş/dış alım hatırlatması: ${count} kalem Marina'ya gönderildi.`,
      );
    } catch (error) {
      console.error("❌ Kumaş/dış alım hatırlatma hatası:", error);
    }
  }

  async runManualTest() {
    await this.sendMorningBriefing();
    await this.checkPendingMaterials();
    await this.checkFabricAndPurchaseStatus();
    await this.sendStaffControlMessage("morning");
  }

  /**
   * Üretim Takip: Dağıtımdan 5 iş günü sonra personele "Bitti mi?" sorusu.
   * "Devam ediyor" denilirse her 5 günde bir tekrar sorulur, teslimata kadar.
   * Tüm personelle RUSÇA iletişim kurulur.
   * Marina'ya özet gönderilir.
   */
  async checkProductionStatus() {
    try {
      const itemsToCheck = this.orderService.getItemsNeedingFollowUp();
      if (itemsToCheck.length === 0) return;

      console.log(
        `🔍 Üretim takip: ${itemsToCheck.length} kalem kontrol ediliyor...`,
      );
      const summaryLines: string[] = [];

      for (const { order, item } of itemsToCheck) {
        const workerName = item.assignedWorker;
        if (!workerName) continue;

        const worker = this.staffService.getStaffByName(workerName);
        if (!worker || !worker.telegramId) {
          console.warn(`⚠️ Personel bulunamadı: ${workerName}`);
          continue;
        }

        // Tüm personelle RUSÇA iletişim (Barış Bey hariç — ama o zaten listede yok)
        const workerLang = "ru";

        // Son hatırlatmadan 5 gün geçmediyse atla
        if (item.lastReminderAt) {
          const lastReminder = new Date(item.lastReminderAt);
          const daysSinceLast = Math.floor(
            (Date.now() - lastReminder.getTime()) / (1000 * 60 * 60 * 24),
          );
          if (daysSinceLast < 5) continue;
        }

        const questionMsg = t("followup_question", workerLang as any, {
          customer: order.customerName,
          product: item.product,
          quantity: String(item.quantity),
        });

        const keyboard = new InlineKeyboard()
          .text(
            t("btn_yes_done", workerLang as any),
            `production_done:${item.id}`,
          )
          .text(
            t("btn_no_ongoing", workerLang as any),
            `production_ongoing:${item.id}`,
          );

        await this.bot.api.sendMessage(worker.telegramId, questionMsg, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });

        // lastReminderAt güncelle
        item.lastReminderAt = new Date().toISOString();
        item.updatedAt = new Date().toISOString();

        summaryLines.push(
          `• ${order.customerName} - ${item.product} → ${workerName} soruldu`,
        );
      }

      // Değişiklikler repository üzerinden yapıldığı için kaydetme işlemi otomatik (Dosya fallback açıksa)
      // Siparişleri repository.save() ile kaydetmeye gerek yok çünkü updateOrderItem zaten kaydediyor.

      // Marina'ya özet gönder
      if (summaryLines.length > 0) {
        const marina = this.staffService.getMarina();
        if (marina && marina.telegramId) {
          const marinaLang = marina.language || "ru";
          const summaryText = t("followup_summary_marina", marinaLang as any, {
            summary: summaryLines.join("\n"),
          });
          await this.bot.api.sendMessage(marina.telegramId, summaryText, {
            parse_mode: "Markdown",
          });
        }
      }

      console.log(
        `✅ Üretim takip: ${summaryLines.length} personele soru gönderildi.`,
      );
    } catch (error) {
      console.error("❌ Üretim takip hatası:", error);
    }
  }

  /**
   * Teslim tarihine 5 gün kala patrona bildirim gönderir.
   * Her sipariş için yalnızca bir kez tetiklenir.
   */
  async checkDeliveryApproaching() {
    try {
      const orders = this.orderService.getOrders();
      // ORDER GUARD: Sipariş yoksa teslimat kontrolü atla
      if (!orders || orders.length === 0) return;

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      for (const order of orders) {
        if (order.status === "archived" || order.status === "completed")
          continue;
        if (!order.deliveryDate) continue;

        // Teslim tarihini ayrıştır (DD.MM.YYYY veya YYYY-MM-DD veya serbest metin)
        let delivery: Date | null = null;
        const raw = order.deliveryDate.trim();
        const dmyMatch = raw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
        const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (dmyMatch) {
          delivery = new Date(
            parseInt(dmyMatch[3]),
            parseInt(dmyMatch[2]) - 1,
            parseInt(dmyMatch[1]),
          );
        } else if (isoMatch) {
          delivery = new Date(
            parseInt(isoMatch[1]),
            parseInt(isoMatch[2]) - 1,
            parseInt(isoMatch[3]),
          );
        }

        if (!delivery || isNaN(delivery.getTime())) continue;
        delivery.setHours(0, 0, 0, 0);

        const daysLeft = Math.round(
          (delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (daysLeft === 5) {
          const msg =
            `📦 <b>TESLİMAT YAKLAŞIYOR</b>\n\n` +
            `📌 Sipariş: <b>${order.orderNumber}</b>\n` +
            `👤 Müşteri: <b>${order.customerName}</b>\n` +
            `📅 Teslim Tarihi: <b>${order.deliveryDate}</b>\n\n` +
            `⚠️ <i>Teslimata 5 gün kaldı. Satıcıya/müşteriye bilgi verilmesi gerekiyor.</i>`;

          await this.bot.api.sendMessage(this.targetChatId, msg, {
            parse_mode: "HTML",
          });
          console.log(
            `🔔 Teslim tarihi yaklaşıyor: ${order.orderNumber} (${order.customerName}) — ${daysLeft} gün kaldı`,
          );
        }
      }
    } catch (error) {
      console.error("❌ Teslim tarihi kontrolü hatası:", error);
    }
  }
}
