import * as fs from "fs";
import * as path from "path";
import { Bot, InlineKeyboard, InputFile } from "grammy";
import {
  logger,
  translateDepartment,
  MANUAL_DEPARTMENTS,
  isManualDept,
  getDeptButtonLabel,
} from "@sandaluci/core";
import { DraftOrderService } from "./draft-order.service.js";
import { DistributionService } from "./distribution.service.js";

/**
 * Gmail'den düzenli olarak okunmamış mesajları çeker ve sipariş işleme sürecini başlatır.
 */
export class GmailPollingService {
  private bot: Bot;
  private orderService: any;
  private staffService: any;
  private draftOrderService: DraftOrderService;
  private distributionService: DistributionService;
  private chatId: string;
  private bossId: number;
  private marinaId: number;

  private uidStorePath: string;
  private processedUids = new Set<string>();
  private gmailService: any;
  private isProcessingEmail = false;

  constructor(
    bot: Bot,
    orderService: any,
    staffService: any,
    draftOrderService: DraftOrderService,
    distributionService: DistributionService,
    chatId: string,
    bossId: number,
    marinaId: number,
  ) {
    this.bot = bot;
    this.orderService = orderService;
    this.staffService = staffService;
    this.draftOrderService = draftOrderService;
    this.distributionService = distributionService;
    this.chatId = chatId;
    this.bossId = bossId;
    this.marinaId = marinaId;
    this.uidStorePath = path.join(process.cwd(), "data", "processed_uids.json");
  }

  start() {
    this.loadProcessedUids();

    setInterval(async () => {
      if (this.isProcessingEmail) {
        logger.warn("⏳ Önceki e-posta işleme henüz bitmedi, döngü atlanıyor.");
        return;
      }
      this.isProcessingEmail = true;

      try {
        this.loadProcessedUids();

        if (!this.gmailService) {
          const { GmailService } = await import("./gmail.service.js");
          this.gmailService = GmailService.getInstance();
        }
        logger.info("🔍 Gmail kontrol ediliyor...");

        await this.gmailService.processUnreadMessages(30, async (msg: any) => {
          await this.processMessage(msg);
        });
      } catch (e) {
        logger.error({ err: e }, "Gmail check error");
      } finally {
        this.isProcessingEmail = false;
      }
    }, 60 * 1000);
  }

  private async processMessage(msg: any) {
    if (this.processedUids.has(msg.uid.toString())) {
      logger.info(`🔄 UID ${msg.uid} zaten işlendi, atlanıyor.`);
      return;
    }

    // Önemli: Takılmaları ve Telegram spamını önlemek için en başta işaretle
    this.processedUids.add(msg.uid.toString());
    this.saveProcessedUids();

    logger.info(`📩 Yeni e-posta işleniyor: ${msg.subject} (UID: ${msg.uid})`);

    const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const emailSummary = `📧 <b>Yeni E-posta</b> \n\n<b>Gönderen:</b> ${esc(msg.from)}\n<b>Konu:</b> ${esc(msg.subject)}`;
    logger.info(`💬 Telegram bildirimi gönderiliyor: ${this.chatId}`);
    try {
      if (this.chatId) {
        await this.distributionService.sendMessageWithDuplicateCheck(
          parseInt(this.chatId),
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

    // ── ADIM 1: EXCEL İŞLEME ──
    if (msg.attachments && msg.attachments.length > 0) {
      excelProcessed = await this.processExcelAttachments(
        msg,
        images,
        excelProcessed,
      );
    }

    // ── ADIM 2: EĞER EXCEL YOKSA VEYA İŞLENEMEDİYSE TEXT ANALİZİ YAP ──
    if (!excelProcessed) {
      await this.processTextAnalysis(msg, images);
    }
  }

  private async processExcelAttachments(
    msg: any,
    images: any[],
    _excelProcessed: boolean,
  ): Promise<boolean> {
    let excelProcessed = false;

    for (const attr of msg.attachments) {
      if (!/\.xlsx?$/i.test(attr.filename)) continue;
      const filename = attr.filename;
      logger.info(`🔍 Excel dosyası ayrıştırılıyor: ${filename}`);

      try {
        const { XlsxUtils } = await import("@sandaluci/core");
        const excelRows = await XlsxUtils.parseExcel(attr.content as Buffer);
        const promptData = excelRows.map((r: any) => {
          const copy = { ...r };
          delete copy._imageBuffer;
          return copy;
        });

        const order = await this.orderService.parseAndCreateOrder(
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
          excelProcessed = true;
          continue;
        }

        console.log(
          `🚀 [FLOW] Sipariş işleme süreci başlıyor: ${order.orderNumber}`,
        );

        try {
          await this.orderService.archiveOrderFile(attr.filename, attr.content);
        } catch (archErr) {
          console.error("❌ [FLOW] Arşivleme hatası:", archErr);
        }

        await this.handleOrderDistribution(order, images, excelRows);
        excelProcessed = true;
      } catch (excelErr) {
        const errMsg =
          excelErr instanceof Error ? excelErr.message : String(excelErr);
        const stack = excelErr instanceof Error ? excelErr.stack : undefined;
        logger.error(
          { err: excelErr, filename, stack, uid: msg.uid },
          `❌ Excel işleme hatası (${filename}): ${errMsg}`,
        );
        continue;
      }
    }

    return excelProcessed;
  }

  private async processTextAnalysis(msg: any, images: any[]) {
    const hasImage = images && images.length > 0;
    const hasAttch = msg.attachments && msg.attachments.length > 0;
    const hasContent = msg.content && msg.content.trim().length >= 1;

    if (!hasContent && !hasImage && !hasAttch) {
      logger.warn(
        { uid: msg.uid },
        "⚠️ Sipariş içeriği veya resim bulunamadı, atlanıyor.",
      );
      return;
    }

    console.log(
      `📝 [FLOW] Metin/Resim analizi başlatılıyor (UID: ${msg.uid})...`,
    );

    try {
      const order = await this.orderService.parseAndCreateOrder(
        msg.subject,
        msg.content,
        msg.uid.toString(),
        msg.attachments,
      );

      if (!order) return;

      const draftId = `draft_${Date.now()}`;
      this.draftOrderService.saveDraft(draftId, { order, images });
      const visualReport = this.orderService.generateVisualTable(order);

      const keyboard = new InlineKeyboard();
      const deptsToAssign = Array.from(
        new Set<string>(
          order.items
            .filter((i: any) => MANUAL_DEPARTMENTS.includes(i.department))
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
        .text("🚀 ЗАПУСТИТЬ ДИСТРИБУЦИЮ", `auto_distribute:${draftId}`)
        .row();
      keyboard.text("❌ Отменить", `reject_order:${draftId}`);

      const autoDepts = Array.from(
        new Set(order.items.map((i: any) => i.department)),
      ).filter((d: any) => !isManualDept(d)) as string[];

      // Otomatik dağıtım
      if (autoDepts.length > 0) {
        const textDistPromise = (async () => {
          try {
            console.log(
              `🚀 [FLOW] (Text) Otomatik birimler işleniyor... (${order.orderNumber})`,
            );
            const report =
              await this.distributionService.processOrderDistribution(
                order,
                images,
                [],
                undefined,
                autoDepts,
                false,
              );
            if (report.failed.length > 0) {
              logger.error(
                { orderNumber: order.orderNumber, failedDepts: report.failed },
                `⚠️ [FLOW] (Text) Otomatik dağıtımda bazı departmanlar başarısız: ${report.failed.join(", ")}`,
              );
            }
            return report;
          } catch (distErr) {
            const errMsg =
              distErr instanceof Error ? distErr.message : String(distErr);
            logger.error(
              { err: distErr, orderNumber: order.orderNumber },
              `❌ [FLOW] (Text) Otomatik dağıtım hatası: ${errMsg}`,
            );
            throw distErr;
          }
        })();
        textDistPromise.catch(() => {});
      }

      // Manuel dept atama UI
      const hasManualDeptsText = order.items.some((i: any) =>
        MANUAL_DEPARTMENTS.includes(i.department),
      );
      if (hasManualDeptsText) {
        (async () => {
          const reportCaption = `📝 <b>Отчет по заказу</b>\n\n${visualReport}\n\n<b>Ожидается назначение сотрудников:</b>`;
          console.log(
            `🚀 [FLOW] (Text) Manuel dept atama UI gönderiliyor... (${order.orderNumber})`,
          );
          if (this.marinaId) {
            await this.bot.api.sendMessage(this.marinaId, reportCaption, {
              parse_mode: "HTML",
              reply_markup: keyboard,
            });
          }
        })();
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, uid: msg.uid },
        `❌ Sipariş analiz hatası (Text): ${errMsg}`,
      );
    }
  }

  private async handleOrderDistribution(
    order: any,
    images: any[],
    excelRows: any[],
  ) {
    const draftId = `draft_${Date.now()}`;
    this.draftOrderService.saveDraft(draftId, { order, images });

    const visualReport = this.orderService.generateVisualTable(order);
    if (!this.marinaId) {
      console.error("❌ marinaId (Patron/Süpervizör) eksik!");
      return;
    }

    const fabricItems = order.items.filter((i: any) =>
      i.department.toLowerCase().includes("kumaş"),
    );
    const hasManualDepts = order.items.some((i: any) =>
      isManualDept(i.department),
    );

    let pdfPreviewImg: Buffer | undefined;

    const autoDepts = Array.from(
      new Set(order.items.map((i: any) => i.department)),
    ).filter((d: any) => !isManualDept(d)) as string[];

    // 1. ADIM: Otomatik departmanlara gönder
    if (autoDepts.length > 0) {
      const autoDistPromise = (async () => {
        try {
          console.log(
            `🚀 [FLOW] Otomatik birimler işleniyor... (${order.orderNumber})`,
          );
          const report =
            await this.distributionService.processOrderDistribution(
              order,
              images,
              excelRows,
              undefined,
              autoDepts,
              false,
            );
          const totalDepts = report.success.length + report.failed.length;
          if (totalDepts > 0) {
            let notifyMsg = `🚀 <b>Автоматическое распределение:</b>\n`;
            if (report.success.length > 0) {
              notifyMsg += `✅ Отправлено: ${report.success.map((d) => translateDepartment(d, "ru")).join(", ")}\n`;
            }
            if (report.failed.length > 0) {
              notifyMsg += `⚠️ Ошибка: ${report.failed.map((d) => translateDepartment(d, "ru")).join(", ")}\n`;
            }
            await this.bot.api.sendMessage(this.marinaId, notifyMsg, {
              parse_mode: "HTML",
            });
          }
          return report;
        } catch (autoErr) {
          const errMsg =
            autoErr instanceof Error ? autoErr.message : String(autoErr);
          logger.error(
            { err: autoErr, orderNumber: order.orderNumber },
            `❌ [FLOW] Otomatik dağıtım hatası: ${errMsg}`,
          );
          throw autoErr;
        }
      })();
      autoDistPromise.catch((err) => {
        console.error("❌ [AUTO_DIST] Hata:", err);
      });
    }

    // 2. ADIM: Manuel dept varsa atama UI gönder
    if (hasManualDepts) {
      (async () => {
        const keyboard = new InlineKeyboard();
        const deptsToAssign = Array.from(
          new Set<string>(
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

        // Bölüştürme butonları (Dikişhane, Döşemehane)
        deptsToAssign.forEach((d) => {
          keyboard
            .text(
              `📊 Разделить: ${translateDepartment(d, "ru")}`,
              `split_mode:${draftId}:${d}`,
            )
            .row();
        });

        keyboard
          .text("🚀 ЗАПУСТИТЬ ДИСТРИБУЦИЮ", `auto_distribute:${draftId}`)
          .row();
        keyboard.text("❌ Отменить", `reject_order:${draftId}`);

        const reportCaption = `📝 <b>Отчёт по заказу</b>\n\n${visualReport}\n\n<b>Ожидается назначение сотрудников:</b>`;
        console.log(
          `🚀 [FLOW] Manuel dept atama UI gönderiliyor... (${order.orderNumber})`,
        );

        if (pdfPreviewImg) {
          await this.bot.api.sendPhoto(
            this.marinaId,
            new InputFile(pdfPreviewImg, "preview.png"),
            {
              caption: reportCaption,
              parse_mode: "HTML",
              reply_markup: keyboard,
            },
          );
        } else {
          await this.bot.api.sendMessage(this.marinaId, reportCaption, {
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
        }
      })();
    } else {
      // Sadece otomatik deptler
      (async () => {
        const finalMsg = `📝 <b>Заказ обработан автоматически</b>\n\n${visualReport}\n\n<i>Все отделы уведомлены автоматически, назначение не требуется.</i>`;
        if (pdfPreviewImg) {
          await this.bot.api.sendPhoto(
            this.marinaId,
            new InputFile(pdfPreviewImg, "preview.png"),
            { caption: finalMsg, parse_mode: "HTML" },
          );
        } else {
          await this.bot.api.sendMessage(this.marinaId, finalMsg, {
            parse_mode: "HTML",
          });
        }
        console.log(
          `✅ [FLOW] Sipariş tam otomatik dağıtıldı: ${order.orderNumber}`,
        );
      })();
    }

    // 3. ADIM: Kumaş bilgisi sessizce kayıt
    if (fabricItems.length > 0) {
      console.log(
        `🧶 [FLOW] Kumaş kalemleri kayıt altına alındı: ${order.orderNumber} (${fabricItems.length} kalem)`,
      );
    }
  }

  // --- UID Yönetimi ---
  private loadProcessedUids() {
    try {
      if (fs.existsSync(this.uidStorePath)) {
        const data = fs.readFileSync(this.uidStorePath, "utf-8");
        const uids = JSON.parse(data);
        uids.forEach((uid: string) => this.processedUids.add(uid));
      }
    } catch (error) {
      logger.error({ error }, "❌ processed_uids.json yüklenemedi");
    }
  }

  private saveProcessedUids() {
    try {
      const data = JSON.stringify(Array.from(this.processedUids));
      if (!fs.existsSync(path.dirname(this.uidStorePath))) {
        fs.mkdirSync(path.dirname(this.uidStorePath), { recursive: true });
      }
      fs.writeFileSync(this.uidStorePath, data);
    } catch (error) {
      logger.error({ error }, "❌ processed_uids.json kaydedilemedi");
    }
  }
}
