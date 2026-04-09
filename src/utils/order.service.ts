import * as fs from "fs";
import * as path from "path";
import { OpenRouterService } from "./llm.service";
import { StaffService } from "./staff.service";

import { ImageEmbeddingService } from "./image-embedding.service";
import { SupabaseService } from "./supabase.service";
import { t, Language, translateDepartment } from "./i18n";
import { pino } from "pino";
import { OrderRepository } from "../repositories/order.repository";
import { PDFService } from "../services/pdf.service";
import { OrderDetail, OrderItem } from "../models/order.schema";
import { parseOrderExcel } from "./excel-order-parser";

const logger = pino();

// Re-export types from central schema for backward compatibility
export type { OrderItem, OrderDetail } from "../models/order.schema";
export class OrderService {
  private repository: OrderRepository;
  private pdfService: PDFService;
  private llmService: OpenRouterService;
  private staffService: StaffService;
  private imageEmbeddingService: ImageEmbeddingService;
  private supabase: SupabaseService;

  private static instance: OrderService;

  private constructor() {
    this.repository = OrderRepository.getInstance();
    this.pdfService = PDFService.getInstance();
    this.llmService = new OpenRouterService();
    this.staffService = StaffService.getInstance();
    this.imageEmbeddingService = new ImageEmbeddingService();
    this.supabase = SupabaseService.getInstance();
    this.repository.loadOrders(); // Başlangıçta asenkron yükleme başlar
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

  // Departman ismini i18n üzerinden çevirir (varsayılan: ru)
  public getDeptTranslation(dept: string, lang: Language = "ru"): string {
    return translateDepartment(dept, lang);
  }

  /**
   * Email veya Excel içeriğini analiz eder.
   */
  async parseAndCreateOrder(
    subject: string,
    content: string,
    uid: string,
    attachments?: any[],
  ): Promise<OrderDetail | null> {
    try {
      // 🚨 SİSTEM VE REKLAM MAİLLERİNİ FİLTRELE
      const lowerSubject = (subject || "").toLowerCase();
      const lowerContent = (content || "").toLowerCase();
      const hasImages = attachments?.some((a) =>
        a.contentType?.startsWith("image/"),
      );
      const hasExcel = attachments?.some(
        (a) => a.filename?.endsWith(".xlsx") || a.filename?.endsWith(".xls"),
      );

      // Eğer mail bir sipariş içermiyorsa (Excel yoksa) ve sistem/bildirim maili gibiyse atla
      // Ama konu "sipariş" içeriyorsa veya resim varsa ASLA ATLAMA!
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
        !lowerSubject.includes("sipariş") &&
        !lowerSubject.includes("siparış") &&
        !lowerContent.includes("sipariş") &&
        !lowerContent.includes("siparış") &&
        !hasImages;

      if (isSystemMail && !hasExcel) {
        console.log(
          `⏭️ [SKIP] Sistem maili tespit edildi, sipariş işlemi atlanıyor: "${subject}"`,
        );
        return null;
      }

      let fullContent = `Konu: ${subject}\n\nİçerik:\n${content}`;

      // ── EXCEL EKİ: Sabit parser ile işle (LLM gerekmez) ──────────
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
              `📊 Sabit Excel parser başlatılıyor: ${attachment.filename}`,
            );
            const parsed = await parseOrderExcel(attachment.content);

            if (!parsed) {
              logger.warn(
                `⚠️ Sabit parser sonuç döndürmedi: ${attachment.filename}`,
              );
              continue;
            }

            const { order: excelOrder } = parsed;

            // Mükerrer kontrolü
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
                existing.orderNumber === excelOrder.orderNumber
              ) {
                logger.warn(
                  `⚠️ Mükerrer sipariş (no eşleşti): ${excelOrder.orderNumber}`,
                );
                return { ...existing, isDuplicate: true };
              }
            }

            excelOrder.createdAt = new Date().toISOString();
            excelOrder.updatedAt = new Date().toISOString();

            await this.repository.save(excelOrder);

            try {
              await this.saveToVisualMemory(excelOrder);
            } catch (_) {}
            await this.logOrder(excelOrder);

            logger.info(
              {
                orderNumber: excelOrder.orderNumber,
                items: excelOrder.items.length,
              },
              "✅ Sabit Excel parser ile sipariş oluşturuldu",
            );
            return excelOrder;
          } catch (err) {
            logger.error(
              { err },
              `❌ Sabit Excel parser hatası: ${attachment.filename}`,
            );
          }
        }
      }

      const prompt = `
      Sen profesyonel bir Sandaluci Üretim Planlama Asistanısın. Görevin, gelen veriyi (EXCEL tablosu veya E-POSTA gövdesi) analiz ederek departmanlara göre hatasız parçalamak ve ÇİFT DİLLİ (Türkçe ve Rusça) sipariş verisi oluşturmaktır.

      🚨 ÖNEMLİ: Girdi bir E-POSTA metniyse (özellikle "Fwd:" ile başlayan forwarded mailler), mailin alt kısımlarındaki asıl sipariş detaylarını bul ve odaklan.
      E-postanın en üstündeki yönlendirme bilgilerini (From, Date, Subject) geçerek, asıl mesaj gövdesindeki sipariş kalemlerini (Ürün, Adet, Kumaş, Boya vb.) tespit et.

      🚨 DİL KURALI:
      - Çalışanlar Rusça, patron (Barış Bey) Türkçe bilmektedir.
      - "product" ve "details" alanlarını HER ZAMAN "[TR] ... / [RU] ..." formatında doldur.
      - Örn: "product": "[TR] 274 Sandalye / [RU] 274 Стул"
      - Örn: "details": "[TR] Kumaş: Dorian 12 / [RU] Ткань: Dorian 12"

      DEPARTMAN ATAMA KURALLARI (KESİNLİKLE UYMAK ZORUNDASIN):

      1. PLASTİK ÜRÜN KURALI (EN YÜKSEK ÖNCELİK):
         - Ürün adında, malzeme sütununda veya notlarda şu ifadelerden HERHANGİ BİRİ varsa -> department = "Satınalma"
         - TR: plastik, polimer, pp, polipropilen, pvc, sentetik ayak, plastik ayak
         - RU: пластик, пластиковый, полимер, полипропилен, пвх, пластмасса, пластиковые ножки
         - Plastik ürünler üretilmez, SATIN ALINIR. Marina Hanım'a direkt gider.
         - ÖRNEK: "Пластиковый стул" -> department="Satınalma", "Plastik sandalye" -> department="Satınalma"

      2. KARKAS/İSKELET: "yapılacak", "iskelet", "çerçeve", "каркас", "рама" varsa -> department = "Karkas Üretimi"

      3. DİKİŞHANE VE DÖŞEMEHANE (ÇOK ÖNEMLİ):
         - Kumaş kaplama, dikiş, döşeme gerektiren ürünlerde MUTLAKA İKİ AYRI kalem oluştur:
           a) department = "Dikişhane" (dikiş işi için)
           b) department = "Döşemehane" (döşeme/kaplama işi için)
         - Her ikisi de aynı ürün için ayrı item olarak eklenmelidir.
         - ÖRNEK: Kumaşlı sandalye -> 1 item Dikişhane + 1 item Döşemehane

      4. KUMAŞ TEDARİK: Kumaş adı/kodu varsa -> department = "Kumaş" (Marina Hanım için)

      5. BOYA/CİLA: Boya rengi veya cila notu varsa -> department = "Boyahane"

      6. DİĞER: "Metal Üretimi", "Mobilya Dekorasyon"

      🚨 KRİTİK KURALLAR:
      0. ROW INDEX: Tablodaki "RowIndex" sütunundaki değeri mutlaka her bir "item" için "rowIndex" alanına yaz. Bu, görsellerin doğru eşleşmesi için hayati önem taşır.
      1. ÜRÜN PARÇALAMA: Her bir departman işi için AYRI kalem (item) oluştur.
      2. DETAYLARIN KORUNMASI: Kumaş adı, boya rengi ve tüm teknik notları ilgili TÜM kalemlerin "details" kısmına ekle. Özellikle malzeme türünü (plastik, kumaş, boya) mutlaka details'a yaz.
      3. FABRIC VE PAINT ALANLARI: "fabricDetails" ve "paintDetails" nesnelerini doldur.
      4. MÜŞTERİ BİLGİSİ: "customerName" alanına müşteri adını ve varsa proje adını yaz. Mail içinde "Müşteri:", "Proje:" veya "Ad Soyad:" gibi ifadeleri ara.

      İÇERİK:
      ${fullContent}

      SADECE SAF JSON DÖNDÜR:
      {
        "orderNumber": "...",
        "customerName": "...",
        "items": [
          {
            "product": "[TR] ... / [RU] ...",
            "department": "...",
            "quantity": 0,
            "details": "[TR] ... / [RU] ...",
            "fabricDetails": {"name": "...", "amount": 0},
            "paintDetails": {"name": "..."},
            "source": "Production",
            "rowIndex": 0
          }
        ],
        "deliveryDate": "..."
      }
    `;

      console.log("--- RAW MAIL CONTENT START ---");
      console.log(content);
      console.log("--- RAW MAIL CONTENT END ---");

      console.log(`🧠 [DEBUG] LLM Parametreleri:`, {
        subject,
        contentLength: fullContent.length,
        contentPreview: fullContent.substring(0, 500),
      });

      const response = await this.llmService.chat(prompt, fullContent);

      console.log(
        `[DEBUG] LLM Raw Response Received: ${response?.substring(0, 500)}...`,
      );
      if (!response) return null;

      // Extract JSON block more robustly
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("❌ LLM yanıtında JSON bulunamadı. Ham yanıt:", response);
        return null;
      }

      const jsonStr = jsonMatch[0].trim();
      let parsed;
      try {
        // Log candidate for debugging if needed (shortened)
        // console.log("🔍 JSON Adayı:", jsonStr.substring(0, 500) + "...");

        let cleanJsonStr = jsonStr
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control characters
          .replace(/\\+"/g, '"') // Fix double escapes
          .trim();

        // Ensure we only have what's between { and }
        const firstBrace = cleanJsonStr.indexOf("{");
        const lastBrace = cleanJsonStr.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
          cleanJsonStr = cleanJsonStr.substring(firstBrace, lastBrace + 1);
        }

        parsed = JSON.parse(cleanJsonStr);
      } catch (parseErr) {
        console.error("❌ LLM JSON parse hatası:", parseErr);
        console.error("📄 [KRİTİK] Ham Yanıt (Hata anı):", jsonStr); // FULL RESPONSE FOR DEBUGGING

        if (parseErr instanceof SyntaxError) {
          const match = parseErr.message.match(/at position (\d+)/);
          if (match) {
            const pos = parseInt(match[1]);
            const context = jsonStr.substring(
              Math.max(0, pos - 50),
              Math.min(jsonStr.length, pos + 50),
            );
            console.error(`📍 Hata konumu (${pos}):\n...${context}...`);
          }
        }
        return null;
      }

      console.log(
        `🧠 [DEBUG] LLM Ayrıştırma Başarılı. Ürün Sayısı: ${parsed.items?.length || 0}`,
      );
      console.log(
        `📋 [DEBUG] Ayrıştırılan Ürünler:`,
        JSON.stringify(
          parsed.items?.map((i: OrderItem) => ({
            p: i.product,
            d: i.department,
            r: i.rowIndex,
          })),
          null,
          2,
        ),
      );

      // 🚨 İÇERİK BAZLI MÜKERRER KONTROLÜ
      // Aynı müşteri + benzer ürün kombinasyonunu kontrol et
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

      // Son 24 saat içindeki aynı müşteri siparişlerini kontrol et
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

        // Müşteri adı benzer mi (%80) ve ürün kombinasyonu benzer mi (%70)?
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
            `⚠️ Mükerrer sipariş tespit edildi! Müşteri: "${customerName}" → Mevcut: "${existingCustomerName}" (Benzerlik: ${Math.round(customerSimilarity * 100)}%)`,
          );
          logger.warn(
            `⚠️ Ürün kombinasyonu benzerliği: ${Math.round(productSimilarity * 100)}%`,
          );
          return { ...existingOrder, isDuplicate: true }; // Mevcut siparişi bayrakla döndür
        }
      }

      const order: OrderDetail = {
        id: Date.now().toString(),
        ...parsed,
        status: "new",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Kalemleri zenginleştir ve Türkçe kısımları temizle
      order.items = order.items.map((item, index) => {
        let cleanProduct = item.product || "";
        let cleanDetails = item.details || "";

        console.log(`🔍 [STRIP] Orijinal Ürün: "${cleanProduct}"`);

        // Daha agresif temizlik: [RU] kısmını bul ve sonrasını al, veya / işaretinden sonrasını al
        // Dil etiketlerini ve ayraçları temizle
        // [TR] ... / [RU] ... formatından sadece RU kısmını al
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

        // Details için aynısı
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

        // Kalan tagleri temizle (Regex ile)
        cleanProduct = cleanProduct.replace(/\[TR\]|\[RU\]/gi, "").trim();
        cleanDetails = cleanDetails.replace(/\[TR\]|\[RU\]/gi, "").trim();

        console.log(`✅ [STRIP] Temiz Ürün: "${cleanProduct}"`);

        // 🚨 PLASTİK KURALI (Türkçe, Rusça ve İngilizce)
        // Sandalye, ayak veya genel parça plastik ise Satınalma'ya (Marina) gider.
        let finalDept = item.department;
        const lowerProd = (item.product || "").toLowerCase();
        const lowerDetails = (item.details || "").toLowerCase();

        // Plastik anahtar kelimeleri (TR + RU + EN)
        const plasticKeywords = [
          "plastik",
          "пластик",
          "plastic",
          "полимер",
          "polimer",
          "полипропилен",
          "polipropilen",
          "pp ",
          "пластмасс",
          "plasmas",
          "пвх",
          "pvc",
          "пластиковый",
          "пластиковые",
          "пластиковая",
          "пластиковых",
          "синтетик",
          "sentetik",
        ];
        const isPlastik = plasticKeywords.some(
          (kw) => lowerProd.includes(kw) || lowerDetails.includes(kw),
        );

        if (isPlastik) {
          console.log(
            `🎯 [RULE] Plastik ürün tespit edildi, Satınalma'ya yönlendiriliyor: ${item.product}`,
          );
          finalDept = "Satınalma";
        }

        return {
          ...item,
          product: cleanProduct,
          details: cleanDetails,
          department: finalDept,
          id: `${order.id}_${index}`,
          status: "bekliyor",
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

      await this.repository.save(order);

      // Görsel hafıza - Artık ana sipariş DB'de olduğu için güvenle çalışabilir
      try {
        await this.saveToVisualMemory(order);
      } catch (e) {
        console.error("⚠️ Görsel hafıza kaydı atlandı (hata):", e);
      }

      await this.logOrder(order);
      return order;
    } catch (error) {
      console.error("❌ Sipariş ayrıştırma hatası:", error);
      return null;
    }
  }

  /**
   * Bir siparişi belirli bir personel ve miktar için parçalar (Sub-Order).
   */
  public createSubOrderForStaff(
    originalOrder: OrderDetail,
    staffName: string,
    quantity: number,
    targetDept: string,
  ): OrderDetail {
    // Derin kopya oluştur (Resim buffer'larını koruyarak)
    const subOrder: OrderDetail = { ...originalOrder };
    
    // Sadece ilgili departmanın ürünlerini sakla ve miktarlarını güncelle
    subOrder.items = originalOrder.items
      .filter((item) => item.department === targetDept)
      .map((item) => ({
        ...item,
        quantity: quantity, // Yeni miktarı ata
        details: `(РАСПРЕДЕЛЕНО: ${quantity}) - ${item.details || ""}`,
      }));

    // Sipariş numarasını/ismini özelleştir
    subOrder.orderNumber = `${originalOrder.orderNumber || "X"}-${staffName}`;
    subOrder.id = `${originalOrder.id}_sub_${Date.now()}`;

    return subOrder;
  }


  /**
   * Doğrudan bir Excel buffer'ını sipariş olarak işler.
   * Barış Bey'den gelen Excel'lerin otomatik sipariş olarak işlenmesi için kullanılır.
   */
  async processExcelOrder(
    buffer: Buffer,
    _uid: string,
  ): Promise<OrderDetail | null> {
    try {
      logger.info("📊 Doğrudan Excel sipariş işleme başlatılıyor...");
      const parsed = await parseOrderExcel(buffer);

      if (!parsed) {
        logger.warn("⚠️ Excel parser sonuç döndürmedi.");
        return null;
      }

      const { order: excelOrder } = parsed;

      // Mükerrer kontrolü
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
          existing.orderNumber === excelOrder.orderNumber
        ) {
          logger.warn(
            `⚠️ Mükerrer sipariş (no eşleşti): ${excelOrder.orderNumber}`,
          );
          return { ...existing, isDuplicate: true } as any;
        }
      }

      excelOrder.createdAt = new Date().toISOString();
      excelOrder.updatedAt = new Date().toISOString();

      await this.repository.save(excelOrder);

      try {
        await this.saveToVisualMemory(excelOrder);
      } catch (_) {}
      await this.logOrder(excelOrder);

      logger.info(
        { orderNumber: excelOrder.orderNumber, items: excelOrder.items.length },
        "✅ Doğrudan Excel işleme ile sipariş oluşturuldu",
      );
      return excelOrder;
    } catch (err) {
      logger.error({ err }, "❌ Doğrudan Excel işleme hatası");
      return null;
    }
  }

  /**
   * Görsel bir özet tablo oluşturur.
   */
  getVisualSummary(order: OrderDetail, lang: Language = "tr"): string {
    const title = t("summary_title", lang);
    let summary = `${title} (${order.customerName})\n`;
    summary += `--------------------------------------------\n`;

    // Gruplandırma
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

    summary += `📅 *${t("delivery_label", lang)}:* ${order.deliveryDate}\n`;
    summary += `${t("coordinator_note", lang)}`;

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
        mentions += `\n📍 *${ruDept}* (${dept}): @${staff[0].name}`;
      }
    });

    return mentions;
  }

  /**
   * Telegram HTML karakterlerini kaçırır.
   */
  static escapeHTML(text: string): string {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * Telegram Markdown karakterlerini kaçırır.
   */
  static escapeMarkdown(text: string): string {
    if (!text) return "";
    // Telegram Markdown (v1) için sadece *, _, [, ` kaçırılmalıdır.
    // -, ., ! gibi karakterleri kaçırmak ekranda gereksiz \ çıkarır.
    return text.replace(/([*_\[`])/g, "\\$1");
  }

  /**
   * Estetik bir tablo formatında görsel özet oluşturur.
   * Boss için TR, genel için RU başlıklar kullanır.
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
    const labelDept = t("dept_label", lang);
    const labelWorker = t("worker_label", lang);
    const labelDetails = t("details_label", lang);

    let table = `<b>${title}</b>\n`;
    table += `👤 ${labelCustomer}: <code>${customer}</code>\n`;
    table += `📂 ${labelOrder}: <code>${orderNo}</code>\n`;
    table += `📅 ${labelTermin}: <b>${delivery}</b>\n`;
    table += `━━━━━━━━━━━━━━━━━━━━\n`;
    table += `📦 <b>${labelProduct}</b>\n\n`;

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
      table += `   👉 <i>${dept}</i>\n`;
      table += `   👷 <b>Персонал:</b> ${worker}\n`;
      if (details) table += `   📝 <b>Примечание:</b> ${details}\n`;
      table += `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n`;
    });

    table += `\n⚠️ <i>${t("pdf_footer", lang)}</i>`;

    return table;
  }
  /**
   * Marina için sipariş özeti PDF'i - PDFService'e delege edildi.
   */
  async generateMarinaSummaryPDF(order: OrderDetail): Promise<Buffer> {
    return this.pdfService.generateMarinaSummaryPDF(order);
  }

  /**
   * Marina için Kumaş Sipariş Raporu PDF'i - PDFService'e delege edildi.
   */
  async generateFabricOrderPDF(order: OrderDetail): Promise<Buffer> {
    return this.pdfService.generateFabricOrderPDF(order);
  }

  /**
   * Departman iş emri PDF'i - PDFService'e delege edildi.
   */
  async generateJobOrderPDF(
    items: OrderItem[],
    customerName: string,
    department: string,
  ): Promise<Buffer> {
    return this.pdfService.generateJobOrderPDF(items, customerName, department);
  }

  /**
   * Sipariş formunu tarihli klasöre arşivler.
   */
  async archiveOrderFile(fileName: string, content: Buffer): Promise<string> {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const archiveDir = path.join(process.cwd(), "data", "orders", today);

    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    const filePath = path.join(archiveDir, fileName);
    fs.writeFileSync(filePath, content);
    console.log(`📂 Sipariş formu arşivlendi: ${filePath}`);
    return filePath;
  }

  /**
   * PDF iş emrini yerel klasöre arşivler - PDFService'e delege edildi.
   */
  async archivePDF(deptName: string, pdfBuffer: Buffer): Promise<string> {
    return this.pdfService.archivePDF(deptName, pdfBuffer);
  }

  /**
   * Siparişi log dosyasına kaydeder.
   */
  private async logOrder(order: OrderDetail): Promise<void> {
    await this.repository.appendLog(order);
  }

  /**
   * Siparişi arşive taşır.
   */
  public async archiveToCompleted(orderId: string): Promise<boolean> {
    return this.repository.archiveOrder(orderId);
  }

  /**
   * Departman için detaylı metin görünümü oluşturur.
   */
  public generateDeptView(
    items: OrderItem[],
    customerName: string,
    dept: string,
  ): string {
    const today = new Date().toLocaleDateString("tr-TR");
    const now = new Date().toLocaleTimeString("tr-TR");

    const labelProduct = t("product_label", "ru");
    const labelQuantity = t("order_label", "ru"); // "Quantity" or "Order" can use order_label as proxy or similar
    const labelDetails = t("details_label", "ru");
    const labelCustomer = t("customer_label", "ru");
    const labelDate = t("pdf_date", "ru");

    const ruDeptTitle = this.getDeptTranslation(dept, "ru").toUpperCase();
    let view = `📑 *${ruDeptTitle}*\n`;
    view += `━━━━━━━━━━━━━━━━━━━━\n`;
    view += `👤 *${labelCustomer}:* ${OrderService.escapeMarkdown(customerName)}\n`;
    view += `📅 *${labelDate}:* ${today} | ${now}\n`;
    view += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    items.forEach((item, idx) => {
      view += `${idx + 1}. *${labelProduct}: ${OrderService.escapeMarkdown(item.product)}*\n`;
      view += `   🔢 ${labelQuantity}: ${item.quantity}\n`;
      view += `   📝 ${labelDetails}: ${OrderService.escapeMarkdown(item.details || "Нет")}\n`;
      view += `   📍 Источник: ${item.source === "Stock" ? "Склад" : item.source === "Production" ? "Производство" : "Внешняя закупка"}\n\n`;
    });

    view += `━━━━━━━━━━━━━━━━━━━━\n`;
    view += `⚠️ _${t("pdf_footer", "ru")}_`;

    return view;
  }

  /**
   * Ürün görsellerini yerel diske kaydeder ve vektörlerini Supabase'e (pgvector) yollar.
   */
  async saveToVisualMemory(order: OrderDetail) {
    // Görseller için yerel klasör (data/images/YYYY-MM-DD) oluştur
    const today = new Date().toISOString().split("T")[0];
    const imageDir = path.join(process.cwd(), "data", "images", today);

    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }

    for (const item of order.items) {
      if (item.imageBuffer) {
        try {
          console.log(`🧠 Görsel hafıza işleniyor: ${item.product}`);
          const extension = item.imageExtension || "jpg";

          // 1. Resmi Yerel Klasöre Kaydet
          const safeProductName = item.product
            .replace(/[^a-z0-9]/gi, "_")
            .toLowerCase();
          const fileName = `${order.id}_${item.id}_${safeProductName}_${Date.now()}.${extension}`;
          const filePath = path.join(imageDir, fileName);
          fs.writeFileSync(filePath, item.imageBuffer);

          // URL adresini /data/images formatında siparişe ekle
          item.imageUrl = `/data/images/${today}/${fileName}`;

          // Güncellenmiş siparişi hem lokalin hem Supabase'in görmesi için order güncellensin
          await this.supabase.upsertOrderItem(item, order.id);

          // 2. Vektörü Çıkar ve Supabase pgvector'a (visual_memory tablosuna) Gönder
          const vector =
            await this.imageEmbeddingService.generateImageEmbedding(
              item.imageBuffer,
              extension,
            );

          await this.supabase.upsertVisualMemory(
            `${order.id}_${item.id}_${Date.now()}`,
            item.product,
            order.customerName,
            order.id, // Pass the internal UUID/ID of the order, not the order number string
            [item.department, item.source],
            vector,
            item.imageUrl || "",
          );
          console.log(`✅ Görsel ve vektör kaydedildi: ${item.product}`);
        } catch (error) {
          console.error(
            `❌ Görsel hafıza ve yerel kayıt hatası (${item.product}):`,
            error,
          );
        }
      }
    }
  }

  /**
   * PDF Buffer'ını görsel bir PNG Buffer'ına dönüştürür (Screenshot gibi)
   */
  async generatePDFView(pdfBuffer: Buffer): Promise<Buffer> {
    return this.pdfService.generatePDFView(pdfBuffer);
  }

  /**
   * Belirli bir sipariş kaleminin durumunu ve işçisini günceller.
   */
  public async updateItemStatus(itemId: string, status: OrderItem["status"]) {
    return this.repository.updateOrderItem(itemId, { status });
  }

  /**
   * Döşeme ekibi için işçi ataması yapar.
   */
  public async assignWorkerToItem(itemId: string, workerName: string) {
    return this.repository.updateOrderItem(itemId, {
      assignedWorker: workerName,
      status: "uretimde",
      distributedAt: new Date().toISOString(),
    });
  }

  /**
   * Kumaş durumunu günceller ve not ekler.
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

  /**
   * Takip gerektiren kalemleri döner.
   * "uretimde" statüsünde ve distributedAt'ten beri belirli gün geçmiş olanlar.
   * Ahşap/Metal/Dekorasyon → 20 gün, Dikişhane/Döşemehane → 15 gün
   */
  public getItemsNeedingFollowUp(): { order: OrderDetail; item: OrderItem }[] {
    return this.repository.getItemsNeedingFollowUp();
  }

  /**
   * Siparişteki diğer kalemlerden birinin "Boyahane" departmanında olup olmadığını kontrol eder.
   */
  public orderNeedsPaint(orderId: string): boolean {
    const order = this.repository.findById(orderId);
    if (!order) return false;
    return order.items.some(
      (item) =>
        item.department.toLowerCase().includes("boya") &&
        item.status === "bekliyor",
    );
  }

  /**
   * Siparişin boya kalemlerini bulur.
   */
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
   * Departman için detaylı iş emri PDF'i oluşturur.
   * Görselleri ve ürün detaylarını içerir. Dil: RU
   */
  /**
   * 24 saat geçmiş ve hala gelmemiş kumaşları bulur.
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
          item.department.toLowerCase().includes("dikiş") ||
          item.department.toLowerCase().includes("döşeme") ||
          item.department.toLowerCase() === "kumaş";

        const isPurchaseDept =
          item.department.toLowerCase().includes("satın") ||
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

  /**
   * Hatırlatma zamanını günceller.
   */
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
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    const costs = new Array();
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i == 0) costs[j] = j;
        else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (s1.charAt(i - 1) != s2.charAt(j - 1))
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }
}
