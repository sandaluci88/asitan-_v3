import * as fs from "fs";
import * as path from "path";
import { LlmService } from "./llm.service.js";
import { StaffService } from "./staff.service.js";
import { ImageEmbeddingService } from "./image-embedding.service.js";
import { SupabaseService } from "./supabase.service.js";
import { t, translateDepartment } from "../utils/i18n.js";
import type { Language } from "../utils/i18n.js";
import { pino } from "pino";
import { OrderRepository } from "../repositories/order.repository.js";
// import { PDFService } from "./pdf.service.js"; // TODO: will be in bot package later
import { OrderDetail, OrderItem } from "../models/order.schema.js";
import { parseOrderExcel } from "./excel-order-parser.js";

const logger = pino();

// Re-export types from central schema for backward compatibility
export type { OrderItem, OrderDetail } from "../models/order.schema.js";

export class OrderService {
  private repository: OrderRepository;
  // private pdfService: PDFService; // TODO: will be in bot package later
  private llmService: LlmService;
  private staffService: StaffService;
  private imageEmbeddingService: ImageEmbeddingService;
  private supabase: SupabaseService;

  private static instance: OrderService;

  private constructor() {
    this.repository = OrderRepository.getInstance();
    // this.pdfService = PDFService.getInstance(); // TODO: will be in bot package later
    this.llmService = LlmService.getInstance();
    this.staffService = StaffService.getInstance();
    this.imageEmbeddingService = new ImageEmbeddingService();
    this.supabase = SupabaseService.getInstance();
    this.repository.loadOrders();
  }

  public static getInstance(): OrderService {
    if (!OrderService.instance) {
      OrderService.instance = new OrderService();
    }
    return OrderService.instance;
  }

  /** @deprecated Use repository.loadOrders() instead. Kept for backward compatibility. */
  public async loadOrdersFromSupabase(): Promise<void> {
    await this.repository.loadOrders();
  }

  // Departman ismini i18n uzerinden cevirir (varsayilan: ru)
  public getDeptTranslation(dept: string, lang: Language = "ru"): string {
    return translateDepartment(dept, lang);
  }

  /**
   * Email veya Excel icerigini analiz eder.
   */
  async parseAndCreateOrder(
    subject: string,
    content: string,
    uid: string,
    attachments?: any[],
  ): Promise<OrderDetail | null> {
    try {
      // SISTEM VE REKLAM MAILLERINI FILTRELE
      const lowerSubject = (subject || "").toLowerCase();
      const lowerContent = (content || "").toLowerCase();
      const hasImages = attachments?.some((a) =>
        a.contentType?.startsWith("image/"),
      );
      const hasExcel = attachments?.some(
        (a) => a.filename?.endsWith(".xlsx") || a.filename?.endsWith(".xls"),
      );

      const isSystemMail =
        (lowerSubject.includes("netlify") ||
          lowerSubject.includes("welcome") ||
          lowerSubject.includes("verification") ||
          lowerSubject.includes("security alert") ||
          lowerSubject.includes("deploy") ||
          lowerSubject.includes("netlify team") ||
          lowerContent.includes("netlify") ||
          lowerContent.includes("team is ready") ||
          lowerContent.includes("deploy your first app") ||
          lowerContent.includes("subscription") ||
          lowerContent.includes("billing")) &&
        !lowerSubject.includes("siparis") &&
        !lowerSubject.includes("siparis") &&
        !lowerContent.includes("siparis") &&
        !lowerContent.includes("siparis") &&
        !hasImages;

      if (isSystemMail && !hasExcel) {
        logger.info(
          `[SKIP] Sistem maili tespit edildi, siparis islemi atlaniyor: "${subject}"`,
        );
        return null;
      }

      const fullContent = `Konu: ${subject}\n\nIcerik:\n${content}`;

      // -- EXCEL EKI: Sabit parser ile isle (LLM gerekmez) --
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          const isXlsx =
            attachment.contentType ===
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            attachment.filename?.endsWith(".xlsx") ||
            attachment.filename?.endsWith(".xls");

          if (!isXlsx) continue;

          try {
            logger.info(
              `Sabit Excel parser baslatiliyor: ${attachment.filename}`,
            );
            const parsed = await parseOrderExcel(attachment.content);

            if (!parsed) {
              logger.warn(
                `Sabit parser sonuc dondurmedi: ${attachment.filename}`,
              );
              continue;
            }

            const { order: excelOrder } = parsed;

            // Mukerrer kontrolu
            const allOrders = this.repository.getAll();
            const oneDayAgo = new Date(
              Date.now() - 24 * 60 * 60 * 1000,
            ).toISOString();
            const recentOrders = allOrders.filter(
              (o: OrderDetail) => o.createdAt > oneDayAgo,
            );

            for (const existing of recentOrders) {
              if (
                excelOrder.orderNumber &&
                (existing.orderNumber === excelOrder.orderNumber ||
                  existing.orderNumber.startsWith(excelOrder.orderNumber + "-"))
              ) {
                logger.warn(
                  `Mukerrer siparis tamamen atlanıyor: ${excelOrder.orderNumber}`,
                );
                return { ...existing, isDuplicate: true };
              }
            }

            excelOrder.createdAt = new Date().toISOString();
            excelOrder.updatedAt = new Date().toISOString();

            await this.repository.save(excelOrder);

            // LLM Ceviri: Turkce detaylari Ruscaya cevir (personel icin)
            try {
              const detailsToTranslate = excelOrder.items.map(
                (item: any) => item.details || "",
              );
              const translations =
                await this.llmService.translateToRussian(
                  detailsToTranslate,
                );
              excelOrder.items.forEach((item: any, i: number) => {
                const translated = translations[i];
                if (translated && translated !== item.details) {
                  logger.info(
                    `[Ceviri] "${item.details?.substring(0, 40)}..." -> "${translated.substring(0, 40)}..."`,
                  );
                  item.details = translated;
                }
              });
              await this.repository.save(excelOrder);
            } catch (e) {
              logger.warn("Detay cevirisi atlandi:");
            }

            // Fire-and-forget: gorsel hafiza dagitimi engellemesin
            this.saveToVisualMemory(excelOrder).catch(() => {});
            await this.logOrder(excelOrder);

            logger.info(
              {
                orderNumber: excelOrder.orderNumber,
                items: excelOrder.items.length,
              },
              "Sabit Excel parser ile siparis olusturuldu",
            );
            return excelOrder;
          } catch (err) {
            logger.error(
              { err },
              `Sabit Excel parser hatasi: ${attachment.filename}`,
            );
          }
        }
      }

      const prompt = `
      Sen profesyonel bir Sandaluci Uretim Planlama Asistanisin. Gorevin, gelen veriyi (EXCEL tablosu veya E-POSTA govdesi) analiz ederek departmanlara gore hatasiz parcalamak ve CIFIT DILLI (Turkce ve Rusca) siparis verisi olusturmaktir.

      ONEMLI: Girdi bir E-POSTA metniyse (ozellikle "Fwd:" ile baslayan forwarded mailler), mailin alt kisimlarindaki asil siparis detaylarini bul ve odaklan.

      DIL KURALI:
      - Calisanlar Rusca, patron (Baris Bey) Turkce bilmektedir.
      - "product" ve "details" alanlarini HER ZAMAN "[TR] ... / [RU] ..." formatinda doldur.

      DEPARTMAN ATAMA KURALLARI:

      1. PLASTIK URUN KURALI (EN YUKSEK ONCELIK):
         - Urun adinda, malzeme sutununda veya notlarda plastik ifadesi varsa -> department = "Satialma"
         - Plastik urunler uretilmez, SATIN ALINIR.

      2. KARKAS/ISKELET: "yapilacak", "iskelet", "cerceve" varsa -> department = "Karkas Uretimi"

      3. DIKISHANE VE DOSEMEHANE:
         - Kumas kaplama, dikis, doseme gerektiren urunlerde MUTLAKA IKI AYRI kalem olustur

      4. KUMAS TEDARIK: Kumas adi/kodu varsa -> department = "Kumas"

      5. BOYA/CILA: Boya rengi veya cila notu varsa -> department = "Boyahane"

      Icerik:
      ${fullContent}

      SADECE SAF JSON DONDUR:
      {
        "orderNumber": "...",
        "customerName": "...",
        "items": [...],
        "deliveryDate": "..."
      }
    `;

      const response = await this.llmService.chat({
        userMessage: fullContent,
        context: prompt,
      });

      if (!response) return null;

      // Extract JSON block
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.error("LLM yanitinda JSON bulunamadi.");
        return null;
      }

      const jsonStr = jsonMatch[0].trim();
      let parsed: any;
      try {
        let cleanJsonStr = jsonStr
          .replace(/[ --]/g, "")
          .replace(/\\+"/g, '"')
          .trim();

        const firstBrace = cleanJsonStr.indexOf("{");
        const lastBrace = cleanJsonStr.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
          cleanJsonStr = cleanJsonStr.substring(firstBrace, lastBrace + 1);
        }

        parsed = JSON.parse(cleanJsonStr);
      } catch (parseErr) {
        logger.error({ err: parseErr }, "LLM JSON parse hatasi");
        return null;
      }

      // Icerik bazli mukerrer kontrolu
      const allOrders = this.repository.getAll();
      const customerName = (parsed.customerName || "").toLowerCase().trim();
      const newProducts = (parsed.items || [])
        .map((i: any) =>
          (i.product || "")
            .toLowerCase()
            .replace(/\[tr\].*?\[ru\].*?/gi, "")
            .trim(),
        )
        .sort()
        .join(",");

      const oneDayAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();
      const recentOrders = allOrders.filter(
        (o: OrderDetail) => o.createdAt > oneDayAgo,
      );

      for (const existingOrder of recentOrders) {
        const existingCustomerName = (existingOrder.customerName || "")
          .toLowerCase()
          .trim();
        const existingProducts = (existingOrder.items || [])
          .map((i: any) =>
            (i.product || "")
              .toLowerCase()
              .replace(/\[tr\].*?\[ru\].*?/gi, "")
              .trim(),
          )
          .sort()
          .join(",");

        const customerSimilarity = this.calculateSimilarity(
          customerName,
          existingCustomerName,
        );
        const productSimilarity = this.calculateSimilarity(
          newProducts,
          existingProducts,
        );

        if (customerSimilarity > 0.8 && productSimilarity > 0.7) {
          logger.warn(
            `Mukerrer siparis tespit edildi! Musteri: "${customerName}"`,
          );
          return { ...existingOrder, isDuplicate: true };
        }
      }

      const order: OrderDetail = {
        id: Date.now().toString(),
        ...parsed,
        status: "new",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Kalemleri zenginlestir
      order.items = order.items.map((item, index) => {
        let cleanProduct = item.product || "";
        let cleanDetails = item.details || "";

        // [TR] ... / [RU] ... formatindan sadece RU kismini al
        const trRuPatterns = [
          /\[TR\].*?\/.*?\[RU\]\s*(.*)/i,
          /\[TR\].*?\|.*?\[RU\]\s*(.*)/i,
          /\[RU\]\s*(.*)/i,
          /^.*?\/.*?\[RU\]\s*(.*)/i,
        ];

        let foundRu = false;
        for (const pattern of trRuPatterns) {
          const match = cleanProduct.match(pattern);
          if (match) {
            cleanProduct = match[1].trim();
            foundRu = true;
            break;
          }
        }

        if (!foundRu && cleanProduct.includes("/")) {
          const parts = cleanProduct.split("/");
          cleanProduct = parts[parts.length - 1].trim();
        }

        let foundRuDetails = false;
        for (const pattern of trRuPatterns) {
          const match = cleanDetails.match(pattern);
          if (match) {
            cleanDetails = match[1].trim();
            foundRuDetails = true;
            break;
          }
        }

        if (!foundRuDetails && cleanDetails.includes("/")) {
          const parts = cleanDetails.split("/");
          cleanDetails = parts[parts.length - 1].trim();
        }

        cleanProduct = cleanProduct.replace(/\[TR\]|\[RU\]/gi, "").trim();
        cleanDetails = cleanDetails.replace(/\[TR\]|\[RU\]/gi, "").trim();

        // PLASTIK KURALI
        let finalDept = item.department;
        const lowerProd = (item.product || "").toLowerCase();
        const lowerDetails = (item.details || "").toLowerCase();

        const plasticKeywords = [
          "plastik", "пластик", "plastic", "полимер", "polimer",
          "полипропилен", "polipropilen", "pp ", "пластмасс",
          "пвх", "pvc", "пластиковый", "пластиковые", "синтетик", "sentetik",
        ];
        const isPlastik = plasticKeywords.some(
          (kw) => lowerProd.includes(kw) || lowerDetails.includes(kw),
        );

        if (isPlastik) {
          finalDept = "Satialma";
        }

        return {
          ...item,
          product: cleanProduct,
          details: cleanDetails,
          department: finalDept,
          id: `${order.id}_${index}`,
          status: "bekliyor" as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          fabricDetails: item.fabricDetails
            ? {
                ...item.fabricDetails,
                amount:
                  typeof (item.fabricDetails as any).amount === "string"
                    ? parseFloat(
                        (item.fabricDetails as any).amount.replace(
                          /[^0-9.]/g,
                          "",
                        ),
                      )
                    : (item.fabricDetails as any).amount || 0,
                arrived: false,
              }
            : undefined,
        };
      });

      // LLM Ceviri
      try {
        const detailsToTranslate = order.items.map(
          (item: any) => item.details || "",
        );
        const translations =
          await this.llmService.translateToRussian(detailsToTranslate);
        order.items.forEach((item: any, i: number) => {
          const translated = translations[i];
          if (translated && translated !== item.details) {
            item.details = translated;
          }
        });
      } catch (e) {
        logger.warn("Detay cevirisi atlandi");
      }

      await this.repository.save(order);

      // Gorsel hafiza - Fire-and-forget
      this.saveToVisualMemory(order).catch(() => {});

      await this.logOrder(order);
      return order;
    } catch (error) {
      logger.error({ err: error }, "Siparis ayristirma hatasi");
      return null;
    }
  }

  /**
   * Bir siparisi belirli bir personel ve miktar icin parcalar (Sub-Order).
   */
  public createSubOrderForStaff(
    originalOrder: OrderDetail,
    staffName: string,
    quantity: number,
    targetDept: string,
  ): OrderDetail {
    const subOrder: OrderDetail = { ...originalOrder };

    subOrder.items = originalOrder.items
      .filter((item) => item.department === targetDept)
      .map((item) => ({
        ...item,
        quantity: quantity,
        details: `(РАСПРЕДЕЛЕНО: ${quantity}) - ${item.details || ""}`,
      }));

    subOrder.orderNumber = `${originalOrder.orderNumber || "X"}-${staffName}`;
    subOrder.id = `${originalOrder.id}_sub_${Date.now()}`;

    return subOrder;
  }

  /**
   * Dogrudan bir Excel buffer'ini siparis olarak isler.
   */
  async processExcelOrder(
    buffer: Buffer,
    _uid: string,
  ): Promise<OrderDetail | null> {
    try {
      logger.info("Dogrudan Excel siparis isleme baslatiliyor...");
      const parsed = await parseOrderExcel(buffer);

      if (!parsed) {
        logger.warn("Excel parser sonuc dondurmedi.");
        return null;
      }

      const { order: excelOrder } = parsed;

      // Mukerrer kontrolu
      const allOrders = this.repository.getAll();
      const oneDayAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();
      const recentOrders = allOrders.filter(
        (o: OrderDetail) => o.createdAt > oneDayAgo,
      );

      for (const existing of recentOrders) {
        if (
          excelOrder.orderNumber &&
          (existing.orderNumber === excelOrder.orderNumber ||
            existing.orderNumber.startsWith(excelOrder.orderNumber + "-"))
        ) {
          logger.warn(
            `Mukerrer siparis tamamen atlanıyor: ${excelOrder.orderNumber}`,
          );
          return { ...existing, isDuplicate: true };
        }
      }

      excelOrder.createdAt = new Date().toISOString();
      excelOrder.updatedAt = new Date().toISOString();

      await this.repository.save(excelOrder);

      // Fire-and-forget
      this.saveToVisualMemory(excelOrder).catch(() => {});
      await this.logOrder(excelOrder);

      logger.info(
        { orderNumber: excelOrder.orderNumber, items: excelOrder.items.length },
        "Dogrudan Excel isleme ile siparis olusturuldu",
      );
      return excelOrder;
    } catch (err) {
      logger.error({ err }, "Dogrudan Excel isleme hatasi");
      return null;
    }
  }

  /**
   * Gorsel bir ozet tablo olusturur.
   */
  getVisualSummary(order: OrderDetail, lang: Language = "tr"): string {
    const title = t("summary_title", lang);
    let summary = `${title} (${order.customerName})\n`;
    summary += `--------------------------------------------\n`;

    const stockItems = order.items.filter((i) => i.source === "Stock");
    const prodItems = order.items.filter((i) => i.source === "Production");
    const extItems = order.items.filter((i) => i.source === "External");

    if (stockItems.length > 0) {
      summary +=
        `${t("stock_delivery", lang)}\n` +
        stockItems
          .map((i) => `- ${i.product} (${i.quantity} adet)`)
          .join("\n") +
        `\n\n`;
    }
    if (prodItems.length > 0) {
      summary +=
        `${t("production_entry", lang)}\n` +
        prodItems
          .map(
            (i) =>
              `- ${i.product} (${i.quantity} adet) -> *${this.getDeptTranslation(i.department, lang)}* (${i.department})`,
          )
          .join("\n") +
        `\n\n`;
    }
    if (extItems.length > 0) {
      summary +=
        `${t("external_purchase", lang)}\n` +
        extItems.map((i) => `- ${i.product} (${i.quantity} adet)`).join("\n") +
        `\n\n`;
    }

    summary += `*${t("delivery_label", lang)}:* ${order.deliveryDate}\n`;
    summary += t("coordinator_note", lang);

    return summary;
  }

  getRoutingMentions(order: OrderDetail): string {
    let mentions = "";
    const departments = Array.from(
      new Set(order.items.map((i) => i.department)),
    );

    departments.forEach((dept) => {
      const staff = this.staffService.getStaffByDepartment(dept);
      if (staff.length > 0) {
        const ruDept = this.getDeptTranslation(dept, "ru");
        mentions += `\n*${ruDept}* (${dept}): @${staff[0].name}`;
      }
    });

    return mentions;
  }

  /**
   * Telegram HTML karakterlerini kacirir.
   */
  static escapeHTML(text: string): string {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * Telegram Markdown karakterlerini kacirir.
   */
  static escapeMarkdown(text: string): string {
    if (!text) return "";
    return text.replace(/([*_\[`])/g, "\\$1");
  }

  /**
   * Estetik bir tablo formatinda gorsel ozet olusturur.
   */
  generateVisualTable(order: OrderDetail, lang: Language = "ru"): string {
    const customer = OrderService.escapeHTML(order.customerName);
    const orderNo = OrderService.escapeHTML(order.orderNumber);
    const delivery = OrderService.escapeHTML(order.deliveryDate);

    const title = t("report_title", lang);
    const labelCustomer = t("customer_label", lang);
    const labelOrder = t("order_label", lang);
    const labelTermin = t("delivery_label", lang);
    const labelProduct = t("product_label", lang);

    let table = `<b>${title}</b>\n`;
    table += ` ${labelCustomer}: <code>${customer}</code>\n`;
    table += ` ${labelOrder}: <code>${orderNo}</code>\n`;
    table += ` ${labelTermin}: <b>${delivery}</b>\n`;
    table += `━━━━━━━━━━━━━━━━━━━━\n`;
    table += ` <b>${labelProduct}</b>\n\n`;

    order.items.forEach((item, index) => {
      const product = OrderService.escapeHTML(item.product);
      const dept = OrderService.escapeHTML(
        this.getDeptTranslation(item.department, lang),
      );
      const worker = OrderService.escapeHTML(
        item.assignedWorker || t("dist_not_assigned", lang),
      );
      const details = item.details ? OrderService.escapeHTML(item.details) : "";

      table += `<b>${index + 1}.</b> ${product}\n`;
      table += `   <i>${dept}</i>\n`;
      table += `   Персонал: <b>${worker}</b>\n`;
      if (details) table += `   Примечание: ${details}\n`;
      table += `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;
    });

    table += `\n<i>${t("pdf_footer", lang)}</i>`;

    return table;
  }

  // NOTE: PDF-related methods (generateMarinaSummaryPDF, generateFabricOrderPDF,
  // generateJobOrderPDF, archivePDF, generatePDFView) will be added later
  // when the bot package is implemented with PDFService.

  /**
   * Siparis formunu tarihli klasore arsivler.
   */
  async archiveOrderFile(fileName: string, content: Buffer): Promise<string> {
    const today = new Date().toISOString().split("T")[0];
    const archiveDir = path.join(process.cwd(), "data", "orders", today);

    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    const filePath = path.join(archiveDir, fileName);
    fs.writeFileSync(filePath, content);
    logger.info(`Siparis formu arsivlendi: ${filePath}`);
    return filePath;
  }

  /**
   * Siparisi log dosyasina kaydeder.
   */
  private async logOrder(order: OrderDetail): Promise<void> {
    await this.repository.appendLog(order);
  }

  /**
   * Siparisi arsive tasir.
   */
  public async archiveToCompleted(orderId: string): Promise<boolean> {
    return this.repository.archiveOrder(orderId);
  }

  /**
   * Departman icin detayli metin gorunumu olusturur.
   */
  public generateDeptView(
    items: OrderItem[],
    customerName: string,
    dept: string,
  ): string {
    const today = new Date().toLocaleDateString("tr-TR");
    const now = new Date().toLocaleTimeString("tr-TR");

    const labelProduct = t("product_label", "ru");
    const labelQuantity = t("order_label", "ru");
    const labelDetails = t("details_label", "ru");
    const labelCustomer = t("customer_label", "ru");
    const labelDate = t("pdf_date", "ru");

    const ruDeptTitle = this.getDeptTranslation(dept, "ru").toUpperCase();
    let view = `*${ruDeptTitle}*\n`;
    view += `━━━━━━━━━━━━━━━━━━━━\n`;
    view += `*${labelCustomer}:* ${OrderService.escapeMarkdown(customerName)}\n`;
    view += `*${labelDate}:* ${today} | ${now}\n`;
    view += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    items.forEach((item, idx) => {
      view += `${idx + 1}. *${labelProduct}: ${OrderService.escapeMarkdown(item.product)}*\n`;
      view += `   ${labelQuantity}: ${item.quantity}\n`;
      view += `   ${labelDetails}: ${OrderService.escapeMarkdown(item.details || "Нет")}\n`;
      view += `   Источник: ${item.source === "Stock" ? "Склад" : item.source === "Production" ? "Производство" : "Внешняя закупка"}\n\n`;
    });

    view += `━━━━━━━━━━━━━━━━━━━━\n`;
    view += `_${t("pdf_footer", "ru")}_`;

    return view;
  }

  /**
   * Urun gorsellerini yerel diske kaydeder ve vektorlerini Supabase'e (pgvector) gonderir.
   */
  async saveToVisualMemory(order: OrderDetail): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const imageDir = path.join(process.cwd(), "data", "images", today);

    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }

    for (const item of order.items) {
      if (item.imageBuffer) {
        try {
          logger.info(`Gorsel hafiza isleniyor: ${item.product}`);
          const extension = item.imageExtension || "jpg";

          // 1. Resmi Yerel Klasore Kaydet
          const safeProductName = item.product
            .replace(/[^a-z0-9]/gi, "_")
            .toLowerCase();
          const fileName = `${order.id}_${item.id}_${safeProductName}_${Date.now()}.${extension}`;
          const filePath = path.join(imageDir, fileName);
          fs.writeFileSync(filePath, item.imageBuffer);

          // URL adresini formatinda siparise ekle
          item.imageUrl = `/data/images/${today}/${fileName}`;

          // Guncellenmis siparisi hem lokalin hem Supabase'in gormesi icin order guncellensin
          await this.supabase.upsertOrderItem(item, order.id);

          // 2. Vektoru Cikar ve Supabase pgvector'a (visual_memory tablosuna) Gonder
          const vector =
            await this.imageEmbeddingService.generateImageEmbedding(
              item.imageBuffer,
              extension,
            );

          await this.supabase.upsertVisualMemory(
            `${order.id}_${item.id}_${Date.now()}`,
            item.product,
            order.customerName,
            order.id,
            [item.department, item.source],
            vector,
            item.imageUrl || "",
          );
          logger.info(`Gorsel ve vektor kaydedildi: ${item.product}`);
        } catch (error) {
          logger.error(
            { err: error },
            `Gorsel hafiza ve yerel kayit hatasi (${item.product})`,
          );
        }
      }
    }
  }

  /**
   * Belirli bir siparis kaleminin durumunu ve iscisi gunceller.
   */
  public async updateItemStatus(itemId: string, status: OrderItem["status"]) {
    return this.repository.updateOrderItem(itemId, { status });
  }

  /**
   * Doseme ekibi icin isci atamasi yapar.
   */
  public async assignWorkerToItem(itemId: string, workerName: string) {
    return this.repository.updateOrderItem(itemId, {
      assignedWorker: workerName,
      status: "uretimde",
      distributedAt: new Date().toISOString(),
    });
  }

  /**
   * Kumas durumunu gunceller ve not ekler.
   */
  public async updateFabricStatus(
    itemId: string,
    arrived: boolean,
    note?: string,
  ): Promise<boolean> {
    return this.repository.updateFabricStatus(itemId, arrived, note);
  }

  public getOrders() {
    return this.repository.getAll();
  }

  public getOrderItemById(
    itemId: string,
  ): { order: OrderDetail; item: OrderItem } | null {
    return this.repository.getOrderItemById(itemId);
  }

  public getActiveTrackingItems(): { order: OrderDetail; item: OrderItem }[] {
    return this.repository.getActiveTrackingItems();
  }

  public getItemsNeedingFollowUp(): { order: OrderDetail; item: OrderItem }[] {
    return this.repository.getItemsNeedingFollowUp();
  }

  public orderNeedsPaint(orderId: string): boolean {
    const order = this.repository.findById(orderId);
    if (!order) return false;
    return order.items.some(
      (item) =>
        item.department.toLowerCase().includes("boya") &&
        item.status === "bekliyor",
    );
  }

  public getPaintItemsForOrder(orderId: string): OrderItem[] {
    const order = this.repository.findById(orderId);
    if (!order) return [];
    return order.items.filter(
      (item: OrderItem) =>
        item.department.toLowerCase().includes("boya") &&
        item.status === "bekliyor",
    );
  }

  public getOrderItemByShortId(
    shortId: string,
  ): { order: OrderDetail; item: OrderItem } | null {
    const allOrders = this.repository.getAll();
    for (const order of allOrders) {
      const item = order.items.find((i) => i.id.startsWith(shortId));
      if (item) {
        return { order, item };
      }
    }
    return null;
  }

  /**
   * 24 saat gecmis ve hala gelmemis kumaslari bulur.
   */
  public getPendingFabricReminders(): {
    order: OrderDetail;
    item: OrderItem;
  }[] {
    const now = new Date();
    const reminders: { order: OrderDetail; item: OrderItem }[] = [];
    const allOrders = this.repository.getAll();

    allOrders.forEach((order) => {
      if (order.status === "archived" || order.status === "completed") return;
      order.items.forEach((item) => {
        if (item.status !== "bekliyor") return;

        const isFabricDept =
          item.department.toLowerCase().includes("dikis") ||
          item.department.toLowerCase().includes("doseme") ||
          item.department.toLowerCase() === "kumas";

        const isPurchaseDept =
          item.department.toLowerCase().includes("satin") ||
          item.department.toLowerCase().includes("purchasing");

        const needsFabricCheck =
          isFabricDept && item.fabricDetails && !item.fabricDetails.arrived;
        const needsPurchaseCheck = isPurchaseDept;

        if (needsFabricCheck || needsPurchaseCheck) {
          const lastReminder = item.lastReminderAt
            ? new Date(item.lastReminderAt)
            : new Date(item.distributedAt || item.createdAt);

          const hoursPassed =
            (now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60);

          if (hoursPassed >= 24) {
            reminders.push({ order, item });
          }
        }
      });
    });

    return reminders;
  }

  public async updateLastReminder(orderId: string, itemId: string) {
    await this.repository.updateLastReminder(itemId);
  }

  private calculateSimilarity(s1: string, s2: string): number {
    let longer = s1;
    let shorter = s2;
    if (s1.length < s2.length) {
      longer = s2;
      shorter = s1;
    }
    const longerLength = longer.length;
    if (longerLength === 0) {
      return 1.0;
    }
    return (longerLength - this.editDistance(longer, shorter)) / longerLength;
  }

  private editDistance(s1: string, s2: string): number {
    const a = s1.toLowerCase();
    const b = s2.toLowerCase();

    const costs = new Array<number>();
    for (let i = 0; i <= a.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= b.length; j++) {
        if (i == 0) costs[j] = j;
        else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (a.charAt(i - 1) != b.charAt(j - 1))
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[b.length] = lastValue;
    }
    return costs[b.length];
  }
}
