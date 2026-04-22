import { Bot, InputFile } from "grammy";
import { logger, translateDepartment } from "@sandaluci/core";

/**
 * Sipariş dağıtım servisi — departmanlara PDF iş emri gönderimi.
 */
export class DistributionService {
  private bot: Bot;
  private orderService: any;
  private staffService: any;
  private bossId: number;
  private marinaId: number;

  // Mükerrer mesaj kontrolü
  private recentMessages = new Map<string, number>();
  private static DUPLICATE_WINDOW_MS = 5000;

  constructor(
    bot: Bot,
    orderService: any,
    staffService: any,
    bossId: number,
    marinaId: number,
  ) {
    this.bot = bot;
    this.orderService = orderService;
    this.staffService = staffService;
    this.bossId = bossId;
    this.marinaId = marinaId;
  }

  // --- Mükerrer mesaj kontrolü ---
  private generateMessageHash(content: string, targetId: string): string {
    return `${targetId}_${content.length}_${content.substring(0, 50)}`;
  }

  async sendMessageWithDuplicateCheck(
    targetId: number,
    message: string,
    options?: any,
  ): Promise<void> {
    const hash = this.generateMessageHash(message, targetId.toString());
    const now = Date.now();
    const lastSent = this.recentMessages.get(hash);

    if (lastSent && now - lastSent < DistributionService.DUPLICATE_WINDOW_MS) {
      logger.warn(
        { targetId, hash },
        "Mükerrer mesaj engellendi (5sn içinde tekrar)",
      );
      return;
    }

    this.recentMessages.set(hash, now);
    try {
      await this.bot.api.sendMessage(targetId, message, options);
    } catch (sendErr) {
      const errMsg =
        sendErr instanceof Error ? sendErr.message : String(sendErr);
      logger.warn(
        { err: sendErr, targetId, hash, error: errMsg },
        "⚠️ sendMessageWithDuplicateCheck hatası (bildirim gönderilmedi - spam önleme)",
      );
    }

    // Eski kayıtları temizle (10 dakikadan eski)
    const tenMinutesAgo = now - 10 * 60 * 1000;
    for (const [key, timestamp] of this.recentMessages.entries()) {
      if (timestamp < tenMinutesAgo) {
        this.recentMessages.delete(key);
      }
    }
  }

  // --- Sipariş dağıtım ---
  async processOrderDistribution(
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

      try {
        const pdfBuffer = await this.orderService.generateJobOrderPDF(
          deptItems as any[],
          order.customerName || "Bilinmiyor / Неизвестно",
          currentDept,
        );
        await this.orderService.archivePDF(currentDept, pdfBuffer);

        const safeCustomerName = (order.customerName || "Bilinmiyor")
          .replace(/[^a-zA-Z0-9]/g, "_")
          .substring(0, 30);
        const pdfFileName = `${safeCustomerName}_${currentDept}_Is_Emri.pdf`;

        let targetIds: number[] = [];

        const assignedWorkerName = deptItems.find(
          (i: any) => i.assignedWorker,
        )?.assignedWorker;

        if (assignedWorkerName) {
          const staff = this.staffService
            .getAllStaff()
            .find((s: any) => s.name === assignedWorkerName);
          if (staff?.telegramId) {
            targetIds = [staff.telegramId];
          }
        }

        if (targetIds.length === 0) {
          if (manualAssignments && manualAssignments[currentDept]) {
            targetIds = [manualAssignments[currentDept]];
          } else {
            const departmentalStaffIds = this.staffService
              .getStaffByDepartment(currentDept)
              .map((s: any) => s.telegramId)
              .filter((id: any) => !!id) as number[];

            if (departmentalStaffIds.length > 0) {
              targetIds = departmentalStaffIds;
            } else {
              console.log(
                `⚠️ ${currentDept} için personel yok, Marina'ya gönderiliyor.`,
              );
              targetIds = [this.bossId || this.marinaId];
            }
          }
        }

        let sentCount = 0;
        let lastPdfError = "";
        for (const targetId of targetIds) {
          if (!targetId) continue;

          const staff = this.staffService.getStaffByTelegramId(targetId);
          const lang =
            currentDept.toLowerCase() === "satınalma" ||
            currentDept.toLowerCase().includes("boya")
              ? "ru"
              : staff?.language || "ru";

          try {
            await this.bot.api.sendDocument(
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
                await this.orderService.updateItemStatus(dItem.id, "uretimde");
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
    if (
      report.success.length === 0 &&
      report.failed.length > 0 &&
      this.bossId
    ) {
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
      this.bot.api
        .sendMessage(this.bossId, criticalMsg, { parse_mode: "HTML" })
        .catch(() => {});
    }

    return report;
  }
}
