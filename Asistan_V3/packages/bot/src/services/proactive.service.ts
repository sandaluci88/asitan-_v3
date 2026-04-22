import { Bot } from "grammy";
import { logger, LlmService } from "@sandaluci/core";
import { DoctorService } from "./doctor.service.js";

export class ProactiveService {
  private doctorService: DoctorService;
  private orderService: any;
  private staffService: any;
  private llmService: LlmService;
  private bot: Bot;
  private supervisorId: number;

  constructor(bot: Bot, supervisorId: number, orderService: any, staffService: any) {
    this.bot = bot;
    this.supervisorId = supervisorId;
    this.orderService = orderService;
    this.staffService = staffService;
    this.doctorService = new DoctorService();
    this.llmService = LlmService.getInstance();
  }

  /**
   * Her saat başı çalışan "Heartbeat" (Kalp Atışı) kontrolü.
   * Kazakistan saat dilimine göre 06:00 - 20:00 arası tetiklenir.
   */
  public async runHeartbeat() {
    logger.info("💓 Proaktif kontrol başlatılıyor...");

    try {
      // 1. Teknik Sağlık Taraması
      const healthResults = await this.doctorService.runFullDiagnostics();
      const criticalErrors = healthResults.filter((r) => r.status === "ERROR");

      // 2. Operasyonel Kontrol (Görev Takibi)
      const activeItems = this.orderService.getActiveTrackingItems();

      // ORDER GUARD: Aktif sipariş yoksa ve kritik hata yoksa sessiz kal
      if (activeItems.length === 0 && criticalErrors.length === 0) {
        logger.info(
          "📭 Aktif sipariş yok ve hata yok, heartbeat sessiz kalıyor.",
        );
        return;
      }

      const pendingItems = activeItems.filter(
        (entry: any) =>
          ((entry.item.status as any) === "bekliyor" ||
            (entry.item.status as any) === "yeni") &&
          !entry.item.assignedWorker,
      );

      // Departman bazlı özet (Boss için daha anlamlı)
      const deptCounts: Record<string, number> = {};
      activeItems.forEach((entry: any) => {
        const dept = entry.item.department || "Diğer";
        deptCounts[dept] = (deptCounts[dept] || 0) + 1;
      });

      // 3. Format Data for LLM Evaluation
      let rawData = `Sistem Sağlık Raporu - ${new Date().toLocaleString("tr-TR")}\n`;
      rawData += `Kritik Hatalar: ${criticalErrors.length}\n`;
      rawData += `Aktif Görevler: ${activeItems.length}\n`;
      rawData += `Atama Bekleyen: ${pendingItems.length}\n`;
      rawData += `Departman Dağılımı: ${JSON.stringify(deptCounts)}\n`;

      if (criticalErrors.length > 0) {
        rawData += `Hata Detayları:\n`;
        criticalErrors.forEach((err) => {
          rawData += `- ${err.service}: ${err.message}\n`;
        });
      }

      const prompt = `
        Aşağıdaki sistem istatistiklerini sandaluci-koordinator skill kurallarına göre değerlendir.
        - Eğer sistemde hiçbir kritik hata yoksa ve atama bekleyen aşırı acil iş (3'ten az vs) yoksa, sadece ve sadece "HEARTBEAT_OK" cevabını ver. Başka hiçbir şey yazma.
        - Eğer bir sorun, kritik hata veya yığılma (3'ten fazla atama bekleyen vs.) varsa, durumu Süpervizör'e (Barış Bey'e) bildirmek için kısa, net, profesyonel ve KESİNLİKLE TÜRKÇE bir rapor hazırla.
        - Raporun dili kesinlikle Türkçe olmalıdır.

        Sistem Verileri:
        ${rawData}
      `;

      // 4. Send to LLM
      const response = await this.llmService.chat({
        userMessage: prompt,
        role: "boss",
      });

      if (response && response.trim().includes("HEARTBEAT_OK")) {
        logger.info("✅ Sistem stabil, LLM onayı alındı. Sessiz kalınıyor.");
      } else {
        // Send LLM's customized Turkish report to supervisor
        await this.bot.api.sendMessage(
          this.supervisorId,
          response || "Sistem raporu oluşturulamadı ama kontrol gerekli.",
          {
            parse_mode: "Markdown",
          },
        );
        logger.info("📩 Süpervizöre LLM tabanlı proaktif rapor gönderildi.");
      }
    } catch (error: any) {
      logger.error({ err: error }, "❌ Heartbeat çalışırken hata oluştu");
    }
  }
}
