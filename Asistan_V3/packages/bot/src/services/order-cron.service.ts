/**
 * OrderCronService — Sipariş bazlı otomatik takip cron job'ları
 *
 * Hermes Agent'tan ilham: Context-scoped cron jobs
 * Her sipariş geldiğinde 4 job otomatik oluşur:
 *
 * 1. delivery_warning   → teslimden 5 gün önce Barış Bey'e bildirim (tek seferlik)
 * 2. fabric_check       → her 24 saat Marina'ya kumaş durumu sor (tekrarlayan)
 * 3. production_followup → dağıtımdan 5 iş günü sonra personele "bitti mi?" (tekrarlayan)
 * 4. status_check       → günlük durum özeti brifinge eklenir (tekrarlayan)
 *
 * Sipariş tamamlandığında → removeOrderJobs() ile hepsi silinir.
 * Bot restart'ta → restoreActiveJobs() ile yeniden schedule edilir.
 */

import cron from "node-cron";
import { Bot, InlineKeyboard } from "grammy";
import { SupabaseService, t, translateDepartment, logger } from "@sandaluci/core";
import type { Language } from "@sandaluci/core";

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

export interface OrderCronJob {
  id: string;
  orderId: string;
  jobType: "delivery_warning" | "fabric_check" | "production_followup" | "status_check";
  cronExpression: string;
  isActive: boolean;
  isOneShot: boolean;
  nextRun: string | null;
  lastRun: string | null;
  lastResult: string | null;
  metadata: Record<string, any>;
  createdAt: string;
  completedAt: string | null;
}

// ────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────

export class OrderCronService {
  private db: SupabaseService;
  private bot: Bot;
  private targetChatId: string | number;
  private staffService: any;
  private orderService: any;

  /** In-memory: aktif schedule edilmiş node-cron job'ları */
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();

  constructor(
    bot: Bot,
    chatId: string | number,
    staffService: any,
    orderService: any,
  ) {
    this.bot = bot;
    this.targetChatId = chatId;
    this.staffService = staffService;
    this.orderService = orderService;
    this.db = SupabaseService.getInstance();
  }

  // ────────────────────────────────────────────────────────
  // Job Oluşturma
  // ────────────────────────────────────────────────────────

  /**
   * Yeni sipariş geldiğinde tüm takip job'larını oluştur
   */
  async createOrderJobs(order: any): Promise<void> {
    const orderId = String(order.id);

    try {
      // 1. DELIVERY WARNING — teslimden 5 gün önce (tek seferlik)
      if (order.deliveryDate) {
        const deliveryDate = this.parseDeliveryDate(order.deliveryDate);
        if (deliveryDate) {
          const warningDate = new Date(deliveryDate);
          warningDate.setDate(warningDate.getDate() - 5);

          // Sadece gelecekteki tarihler için oluştur
          if (warningDate > new Date()) {
            const cronExpr = this.dateToCron(warningDate, 10, 0);
            await this.createJob(orderId, "delivery_warning", cronExpr, true, {
              customerName: order.customerName,
              orderNumber: order.orderNumber,
              deliveryDate: order.deliveryDate,
            });
          }
        }
      }

      // 2. FABRIC CHECK — kumaş gerektiren item'lar için her gün 09:00
      const fabricItems = (order.items || []).filter(
        (i: any) => i.fabricDetails,
      );
      if (fabricItems.length > 0) {
        await this.createJob(orderId, "fabric_check", "0 9 * * 1-6", false, {
          targetItems: fabricItems.map((i: any) => i.id),
        });
      }

      // 3. PRODUCTION FOLLOWUP — dağıtımdan 5 iş günü sonra
      const assignedItems = (order.items || []).filter(
        (i: any) => i.assignedWorker,
      );
      if (assignedItems.length > 0) {
        const followupDate = this.addBusinessDays(new Date(), 5);
        const cronExpr = this.dateToCron(followupDate, 10, 30);
        await this.createJob(
          orderId,
          "production_followup",
          cronExpr,
          false,
          {
            targetItems: assignedItems.map((i: any) => i.id),
            workers: assignedItems.map((i: any) => i.assignedWorker),
            checkIntervalDays: 5,
          },
        );
      }

      // 4. STATUS CHECK — günlük durum özeti (haftaiçi 08:30)
      await this.createJob(orderId, "status_check", "30 8 * * 1-5", false, {
        customerName: order.customerName,
        orderNumber: order.orderNumber,
      });

      logger.info({ orderId }, "OrderCron: Jobs created for order");
    } catch (err) {
      logger.warn({ err, orderId }, "OrderCron: Failed to create jobs");
    }
  }

  // ────────────────────────────────────────────────────────
  // Job Silme
  // ────────────────────────────────────────────────────────

  /**
   * Sipariş tamamlandığında/archivlendiğinde tüm job'ları deaktif et
   */
  async removeOrderJobs(orderId: string): Promise<number> {
    try {
      // In-memory job'ları durdur
      for (const [jobKey, task] of this.scheduledJobs.entries()) {
        if (jobKey.startsWith(`${orderId}:`)) {
          task.stop();
          this.scheduledJobs.delete(jobKey);
        }
      }

      // DB'de deaktif et
      const client = this.db.getClient();
      const { data, error } = await client
        .from("order_cron_jobs")
        .update({
          is_active: false,
          completed_at: new Date().toISOString(),
        })
        .eq("order_id", orderId)
        .eq("is_active", true);

      if (error) throw error;

      const count = (data as unknown as any[])?.length || 0;
      logger.info(
        { orderId, deactivatedCount: count },
        "OrderCron: Jobs deactivated for completed order",
      );
      return count;
    } catch (err) {
      logger.warn(
        { err, orderId },
        "OrderCron: Failed to deactivate jobs",
      );
      return 0;
    }
  }

  // ────────────────────────────────────────────────────────
  // Restore (Bot Restart)
  // ────────────────────────────────────────────────────────

  /**
   * Bot restart'ta Supabase'teki aktif job'ları yeniden schedule et
   */
  async restoreActiveJobs(): Promise<void> {
    try {
      const client = this.db.getClient();
      const { data: jobs, error } = await client
        .from("order_cron_jobs")
        .select("*")
        .eq("is_active", true)
        .order("order_id");

      if (error) throw error;

      let restoredCount = 0;

      for (const job of jobs || []) {
        const mapped = this.mapRow(job);
        const success = this.scheduleJob(mapped);
        if (success) restoredCount++;
      }

      logger.info(
        { total: jobs?.length || 0, restored: restoredCount },
        "OrderCron: Active jobs restored",
      );
    } catch (err) {
      logger.warn({ err }, "OrderCron: Failed to restore jobs");
    }
  }

  // ────────────────────────────────────────────────────────
  // Job Çalıştırma
  // ────────────────────────────────────────────────────────

  /**
   * Bir job'ı manuel olarak çalıştır (test için)
   */
  async runOrderJob(orderId: string, jobType: string): Promise<void> {
    switch (jobType) {
      case "delivery_warning":
        await this.executeDeliveryWarning(orderId);
        break;
      case "fabric_check":
        await this.executeFabricCheck(orderId);
        break;
      case "production_followup":
        await this.executeProductionFollowup(orderId);
        break;
      case "status_check":
        await this.executeStatusCheck(orderId);
        break;
    }
  }

  // ────────────────────────────────────────────────────────
  // Reconciliation — Eksik job'ları tespit et ve oluştur
  // ────────────────────────────────────────────────────────

  /**
   * Aktif siparişlerin hepsinin cron job'ı var mı kontrol et.
   * Job'suz siparişler için otomatik job oluştur.
   * Heartbeat'te veya `/cron` komutunda çağrılır.
   */
  async reconcile(): Promise<{ checked: number; created: number; issues: string[] }> {
    const result = { checked: 0, created: 0, issues: [] as string[] };

    try {
      if (!this.orderService?.getOrders) return result;

      const orders = this.orderService.getOrders();
      const activeOrders = orders.filter(
        (o: any) => o.status !== "archived" && o.status !== "completed",
      );

      result.checked = activeOrders.length;

      for (const order of activeOrders) {
        const orderId = String(order.id);

        // Bu siparişin aktif job'ı var mı?
        const existingJobs = await this.getActiveJobs(orderId);

        if (existingJobs.length === 0) {
          // Job yok → oluştur
          result.issues.push(`📦 ${order.orderNumber || orderId} (${order.customerName}) — jobsuz!`);
          await this.createOrderJobs(order);
          result.created++;
        }
      }
    } catch (err) {
      logger.warn({ err }, "OrderCron: Reconciliation failed");
    }

    if (result.created > 0) {
      logger.info(
        { checked: result.checked, created: result.created },
        "OrderCron: Reconciliation completed — missing jobs created",
      );
    }

    return result;
  }

  /**
   * Cron durum raporu — `/cron` komutu için
   */
  async getStatusReport(): Promise<string> {
    const lines: string[] = ["⏰ <b>SİPARİŞ CRON DURUMU</b>\n"];

    try {
      if (!this.orderService?.getOrders) {
        return "❌ OrderService erişilemez";
      }

      const orders = this.orderService.getOrders();
      const activeOrders = orders.filter(
        (o: any) => o.status !== "archived" && o.status !== "completed",
      );

      if (activeOrders.length === 0) {
        return "📭 Aktif sipariş yok — cron job bulunmuyor.";
      }

      const jobIcons: Record<string, string> = {
        delivery_warning: "📦",
        fabric_check: "🧶",
        production_followup: "🔍",
        status_check: "📊",
      };

      for (const order of activeOrders.slice(0, 10)) {
        const orderId = String(order.id);
        const jobs = await this.getActiveJobs(orderId);

        const orderLine = `\n<b>${order.orderNumber || "?"}</b> — ${order.customerName}`;
        lines.push(orderLine);

        if (jobs.length === 0) {
          lines.push("  ⚠️ <i>CRON JOB YOK — oluşturulacak!</i>");
        } else {
          for (const job of jobs) {
            const icon = jobIcons[job.jobType] || "⚙️";
            const lastRun = job.lastRun
              ? new Date(job.lastRun).toLocaleString("tr-TR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "henüz çalışmadı";
            lines.push(`  ${icon} ${job.jobType} — ${lastRun}`);
          }
        }
      }

      // Genel istatistik
      const allJobs = await this.getActiveJobs();
      lines.push(`\n━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`📋 Toplam: ${activeOrders.length} sipariş, ${allJobs.length} aktif job`);

      // Reconciliation çalıştır
      const recon = await this.reconcile();
      if (recon.created > 0) {
        lines.push(`\n🔧 <b>OTOMATİK DÜZELTME:</b> ${recon.created} eksik job oluşturuldu`);
        for (const issue of recon.issues) {
          lines.push(`  → ${issue}`);
        }
      } else {
        lines.push(`\n✅ Tüm siparişlerin cron job'ları mevcut`);
      }
    } catch (err) {
      lines.push(`\n❌ Hata: ${(err as Error).message}`);
    }

    return lines.join("\n");
  }

  // ────────────────────────────────────────────────────────
  // Aktif Job'ları Listele
  // ────────────────────────────────────────────────────────

  async getActiveJobs(orderId?: string): Promise<OrderCronJob[]> {
    try {
      const client = this.db.getClient();
      let query = client
        .from("order_cron_jobs")
        .select("*")
        .eq("is_active", true);

      if (orderId) {
        query = query.eq("order_id", orderId);
      }

      const { data, error } = await query.order("created_at");

      if (error) throw error;
      return (data || []).map((row: any) => this.mapRow(row));
    } catch {
      return [];
    }
  }

  // ────────────────────────────────────────────────────────
  // Job Execution — Her tip için ayrı implementasyon
  // ────────────────────────────────────────────────────────

  /**
   * 📦 DELIVERY WARNING — Teslim yaklaşınca Barış Bey'e bildirim
   */
  private async executeDeliveryWarning(orderId: string): Promise<void> {
    try {
      const client = this.db.getClient();
      const { data: jobs } = await client
        .from("order_cron_jobs")
        .select("metadata")
        .eq("order_id", orderId)
        .eq("job_type", "delivery_warning")
        .eq("is_active", true)
        .limit(1);

      const meta = jobs?.[0]?.metadata || {};

      const msg =
        `📦 <b>TESLİMAT YAKLAŞIYOR</b>\n\n` +
        `📌 Sipariş: <b>${meta.orderNumber || orderId}</b>\n` +
        `👤 Müşteri: <b>${meta.customerName || "Bilinmiyor"}</b>\n` +
        `📅 Teslim Tarihi: <b>${meta.deliveryDate || "N/A"}</b>\n\n` +
        `⚠️ <i>Teslimata 5 gün kaldı!</i>`;

      await this.bot.api.sendMessage(this.targetChatId, msg, {
        parse_mode: "HTML",
      });

      // Tek seferlik → deaktif et
      await this.deactivateJob(orderId, "delivery_warning");

      logger.info({ orderId }, "OrderCron: Delivery warning sent");
    } catch (err) {
      logger.warn({ err, orderId }, "OrderCron: Delivery warning failed");
    }
  }

  /**
   * 🧶 FABRIC CHECK — Marina'ya kumaş durumu sor
   */
  private async executeFabricCheck(orderId: string): Promise<void> {
    try {
      if (!this.staffService?.getMarina) return;
      const marina = this.staffService.getMarina();
      if (!marina?.telegramId) return;

      const client = this.db.getClient();

      // Job metadata'dan target items al
      const { data: jobs } = await client
        .from("order_cron_jobs")
        .select("metadata")
        .eq("order_id", orderId)
        .eq("job_type", "fabric_check")
        .eq("is_active", true)
        .limit(1);

      const meta = jobs?.[0]?.metadata || {};
      const targetItemIds: string[] = meta.targetItems || [];

      if (targetItemIds.length === 0) {
        // Kumaş item kalmadı → deaktif
        await this.deactivateJob(orderId, "fabric_check");
        return;
      }

      // Sipariş ve item bilgilerini al
      const order = this.findOrderById(orderId);
      if (!order) return;

      const fabricItems = order.items?.filter(
        (i: any) =>
          targetItemIds.includes(i.id) && !i.fabricDetails?.arrived,
      );

      if (!fabricItems || fabricItems.length === 0) {
        // Tüm kumaşlar geldi → deaktif
        await this.deactivateJob(orderId, "fabric_check");
        return;
      }

      const lang = (marina.language || "ru") as Language;
      let message = `🧶 <b>KUMAŞ/DIŞ ALIM HATIRLATMA</b>\n`;
      message += `📋 Sipariş: ${order.orderNumber} — ${order.customerName}\n\n`;

      const keyboard = new InlineKeyboard();

      for (const item of fabricItems) {
        const fabricInfo = item.fabricDetails?.name
          ? `\n   Ткань: ${item.fabricDetails.name}`
          : "";
        message += `• ${item.product} (×${item.quantity})${fabricInfo}\n`;

        keyboard
          .text("✅ Прибыла", `fabric_purchase_ok:${item.id}`)
          .text("❌ Нет", `fabric_purchase_pending:${item.id}`)
          .text("📦 Заказано", `fabric_purchase_ordered:${item.id}`);
        keyboard.row();
      }

      await this.bot.api.sendMessage(marina.telegramId, message, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });

      logger.info({ orderId, items: fabricItems.length }, "OrderCron: Fabric check sent to Marina");
    } catch (err) {
      logger.warn({ err, orderId }, "OrderCron: Fabric check failed");
    }
  }

  /**
   * 🔍 PRODUCTION FOLLOWUP — Personele "bitti mi?" sor
   */
  private async executeProductionFollowup(orderId: string): Promise<void> {
    try {
      const client = this.db.getClient();
      const { data: jobs } = await client
        .from("order_cron_jobs")
        .select("metadata")
        .eq("order_id", orderId)
        .eq("job_type", "production_followup")
        .eq("is_active", true)
        .limit(1);

      const meta = jobs?.[0]?.metadata || {};
      const targetItemIds: string[] = meta.targetItems || [];

      if (targetItemIds.length === 0) return;

      const order = this.findOrderById(orderId);
      if (!order) return;

      const summaryLines: string[] = [];

      for (const itemId of targetItemIds) {
        const item = order.items?.find((i: any) => i.id === itemId);
        if (!item?.assignedWorker) continue;

        // Son hatırlatmadan beri 5 gün geçti mi?
        if (item.lastReminderAt) {
          const daysSince = Math.floor(
            (Date.now() - new Date(item.lastReminderAt).getTime()) /
              (1000 * 60 * 60 * 24),
          );
          if (daysSince < (meta.checkIntervalDays || 5)) continue;
        }

        // Hazır veya sevk edildiyse atla
        if (
          item.status === "hazir" ||
          item.status === "sevk_edildi" ||
          item.status === "arsivlendi"
        )
          continue;

        const worker = this.staffService.getStaffByName?.(item.assignedWorker);
        if (!worker?.telegramId) continue;

        const workerLang = "ru" as Language;
        const question = t("followup_question", workerLang, {
          customer: order.customerName,
          product: item.product,
          quantity: String(item.quantity),
        });

        const keyboard = new InlineKeyboard()
          .text(t("btn_yes_done", workerLang), `production_done:${item.id}`)
          .text(t("btn_no_ongoing", workerLang), `production_ongoing:${item.id}`);

        await this.bot.api.sendMessage(worker.telegramId, question, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });

        // lastReminderAt güncelle
        item.lastReminderAt = new Date().toISOString();

        summaryLines.push(
          `• ${order.customerName} — ${item.product} → ${item.assignedWorker}`,
        );
      }

      // Marina'ya özet
      if (summaryLines.length > 0) {
        const marina = this.staffService.getMarina?.();
        if (marina?.telegramId) {
          const marinaLang = (marina.language || "ru") as Language;
          const summaryText = t("followup_summary_marina", marinaLang, {
            summary: summaryLines.join("\n"),
          });
          await this.bot.api.sendMessage(marina.telegramId, summaryText, {
            parse_mode: "Markdown",
          });
        }
      }

      // Job'ın next_run'ını güncelle (5 gün sonrasına ayarla)
      const nextCheck = this.addBusinessDays(new Date(), meta.checkIntervalDays || 5);
      await client
        .from("order_cron_jobs")
        .update({
          next_run: nextCheck.toISOString(),
          last_run: new Date().toISOString(),
        })
        .eq("order_id", orderId)
        .eq("job_type", "production_followup")
        .eq("is_active", true);

      logger.info(
        { orderId, queried: summaryLines.length },
        "OrderCron: Production followup sent",
      );
    } catch (err) {
      logger.warn({ err, orderId }, "OrderCron: Production followup failed");
    }
  }

  /**
   * 📊 STATUS CHECK — Günlük durum özeti
   */
  private async executeStatusCheck(orderId: string): Promise<void> {
    try {
      const client = this.db.getClient();
      const { data: jobs } = await client
        .from("order_cron_jobs")
        .select("metadata")
        .eq("order_id", orderId)
        .eq("job_type", "status_check")
        .eq("is_active", true)
        .limit(1);

      const meta = jobs?.[0]?.metadata || {};

      const order = this.findOrderById(orderId);
      if (!order) return;

      // Sipariş tamamlandıysa deaktif et
      if (
        order.status === "archived" ||
        order.status === "completed"
      ) {
        await this.removeOrderJobs(orderId);
        return;
      }

      // Durum özeti
      const items = order.items || [];
      const completed = items.filter(
        (i: any) =>
          i.status === "hazir" ||
          i.status === "sevk_edildi" ||
          i.status === "arsivlendi",
      ).length;
      const total = items.length;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

      const msg =
        `📊 <b>GÜNLÜK SİPARİŞ DURUMU</b>\n\n` +
        `📌 Sipariş: <b>${meta.orderNumber || order.orderNumber}</b>\n` +
        `👤 Müşteri: <b>${meta.customerName || order.customerName}</b>\n` +
        `📅 Teslim: <b>${order.deliveryDate || "N/A"}</b>\n\n` +
        `✅ Tamamlanan: ${completed}/${total} (${percent}%)\n`;

      // Departman bazlı özet
      const deptStatus: Record<string, { done: number; total: number }> = {};
      for (const item of items) {
        const dept = item.department || "Bilinmiyor";
        if (!deptStatus[dept]) deptStatus[dept] = { done: 0, total: 0 };
        deptStatus[dept].total++;
        if (
          item.status === "hazir" ||
          item.status === "sevk_edildi" ||
          item.status === "arsivlendi"
        ) {
          deptStatus[dept].done++;
        }
      }

      let fullMsg = msg;
      for (const [dept, status] of Object.entries(deptStatus)) {
        fullMsg += `  ${dept}: ${status.done}/${status.total}\n`;
      }

      await this.bot.api.sendMessage(this.targetChatId, fullMsg, {
        parse_mode: "HTML",
      });

      // last_run güncelle
      await client
        .from("order_cron_jobs")
        .update({ last_run: new Date().toISOString() })
        .eq("order_id", orderId)
        .eq("job_type", "status_check")
        .eq("is_active", true);

      logger.info({ orderId, percent }, "OrderCron: Status check sent");
    } catch (err) {
      logger.warn({ err, orderId }, "OrderCron: Status check failed");
    }
  }

  // ────────────────────────────────────────────────────────
  // Internal: Job Schedule
  // ────────────────────────────────────────────────────────

  /**
   * DB'ye job kaydet ve node-cron ile schedule et
   */
  private async createJob(
    orderId: string,
    jobType: OrderCronJob["jobType"],
    cronExpression: string,
    isOneShot: boolean,
    metadata: Record<string, any>,
  ): Promise<void> {
    try {
      const client = this.db.getClient();
      const nextRun = this.calculateNextRun(cronExpression);

      const { data, error } = await client
        .from("order_cron_jobs")
        .insert({
          order_id: orderId,
          job_type: jobType,
          cron_expression: cronExpression,
          is_active: true,
          is_one_shot: isOneShot,
          next_run: nextRun?.toISOString(),
          metadata,
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        this.scheduleJob(this.mapRow(data));
      }
    } catch (err) {
      logger.warn({ err, orderId, jobType }, "OrderCron: Failed to create job");
    }
  }

  /**
   * node-cron ile job'ı schedule et
   */
  private scheduleJob(job: OrderCronJob): boolean {
    if (!cron.validate(job.cronExpression)) {
      logger.warn(
        { cron: job.cronExpression, jobId: job.id },
        "OrderCron: Invalid cron expression",
      );
      return false;
    }

    const jobKey = `${job.orderId}:${job.jobType}`;

    // Önceki schedule varsa durdur
    const existing = this.scheduledJobs.get(jobKey);
    if (existing) {
      existing.stop();
      this.scheduledJobs.delete(jobKey);
    }

    const task = cron.schedule(
      job.cronExpression,
      async () => {
        await this.runOrderJob(job.orderId, job.jobType);

        // Tek seferlikse bitirdikten sonra deaktif
        if (job.isOneShot) {
          task.stop();
          this.scheduledJobs.delete(jobKey);
          await this.deactivateJob(job.orderId, job.jobType);
        }
      },
      { timezone: "Asia/Almaty" },
    );

    this.scheduledJobs.set(jobKey, task);
    return true;
  }

  /**
   * Tek bir job'ı deaktif et
   */
  private async deactivateJob(
    orderId: string,
    jobType: string,
  ): Promise<void> {
    try {
      const client = this.db.getClient();
      await client
        .from("order_cron_jobs")
        .update({
          is_active: false,
          completed_at: new Date().toISOString(),
          last_run: new Date().toISOString(),
        })
        .eq("order_id", orderId)
        .eq("job_type", jobType)
        .eq("is_active", true);

      // In-memory'den de kaldır
      const jobKey = `${orderId}:${jobType}`;
      const task = this.scheduledJobs.get(jobKey);
      if (task) {
        task.stop();
        this.scheduledJobs.delete(jobKey);
      }
    } catch (err) {
      logger.warn({ err, orderId, jobType }, "OrderCron: Deactivate failed");
    }
  }

  // ────────────────────────────────────────────────────────
  // Internal: Helpers
  // ────────────────────────────────────────────────────────

  private findOrderById(orderId: string): any | null {
    if (!this.orderService?.getOrders) return null;
    const orders = this.orderService.getOrders();
    return orders.find((o: any) => String(o.id) === orderId) || null;
  }

  private parseDeliveryDate(raw: string): Date | null {
    const str = raw.trim();
    const dmy = str.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (dmy) {
      return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
    }
    const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
    }
    return null;
  }

  /**
   * Belirli bir günün saat:dk'sine karşılık gelen cron ifadesi
   */
  private dateToCron(date: Date, hour: number, minute: number): string {
    const d = new Date(date);
    d.setHours(hour, minute, 0, 0);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    return `${minute} ${hour} ${day} ${month} *`;
  }

  /**
   * İş günü ekle (hafta sonlarını atla)
   */
  private addBusinessDays(startDate: Date, days: number): Date {
    const date = new Date(startDate);
    let added = 0;
    while (added < days) {
      date.setDate(date.getDate() + 1);
      const day = date.getDay();
      if (day !== 0 && day !== 6) {
        added++;
      }
    }
    return date;
  }

  /**
   * Cron expression'dan next_run hesapla
   */
  private calculateNextRun(cronExpression: string): Date | null {
    try {
      // Basit yaklaşım: şimdiki zamanı döndür
      // node-cron kendi scheduling'ini yapacak
      return new Date();
    } catch {
      return null;
    }
  }

  private mapRow(row: any): OrderCronJob {
    return {
      id: row.id,
      orderId: row.order_id,
      jobType: row.job_type,
      cronExpression: row.cron_expression,
      isActive: row.is_active,
      isOneShot: row.is_one_shot,
      nextRun: row.next_run,
      lastRun: row.last_run,
      lastResult: row.last_result,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }
}
