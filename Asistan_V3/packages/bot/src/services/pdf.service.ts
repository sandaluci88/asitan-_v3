import * as fs from "fs";
import * as path from "path";
import PDFDocument from "pdfkit";
import { createCanvas, registerFont } from "canvas";
import pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";
import { pathToFileURL, fileURLToPath } from "url";
import { t, translateDepartment, logger } from "@sandaluci/core";
import type { OrderDetail, OrderItem } from "@sandaluci/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PDFService - Handles all PDF generation and rendering operations.
 *
 * Extracted from OrderService to follow Single Responsibility Principle.
 * Responsible for:
 * - Marina Summary PDF (full order overview)
 * - Fabric Order PDF (kumaş sipariş raporu)
 * - PDF-to-Image conversion (pdfjs + canvas)
 */
export class PDFService {
  private static instance: PDFService;

  private readonly fontRegular: string;
  private readonly fontBold: string;
  private readonly defaultFont: string;
  private readonly boldFont: string;

  constructor() {
    // __dirname = dist/services/ → ../assets/fonts
    const fontsDir = path.join(__dirname, "..", "assets", "fonts");
    this.fontRegular = path.join(fontsDir, "Roboto-Regular.ttf");
    this.fontBold = path.join(fontsDir, "Roboto-Bold.ttf");
    this.defaultFont = fs.existsSync(this.fontRegular)
      ? this.fontRegular
      : "Helvetica";
    this.boldFont = fs.existsSync(this.fontBold)
      ? this.fontBold
      : "Helvetica-Bold";
  }

  public static getInstance(): PDFService {
    if (!PDFService.instance) {
      PDFService.instance = new PDFService();
    }
    return PDFService.instance;
  }

  /**
   * Bir sipariş kalemi için resim Buffer'ını çözer.
   * imageBuffer varsa onu kullanır, yoksa imageUrl üzerinden yerel diskten yükler.
   */
  private async ensureImageBuffer(
    item: OrderItem,
  ): Promise<Buffer | undefined> {
    if (item.imageBuffer) return item.imageBuffer;

    if (item.imageUrl) {
      try {
        // imageUrl genellikle "/data/images/..." formatındadır.
        // Başındaki / işaretini temizle ve process.cwd() ile birleştir.
        const relativePath = item.imageUrl.startsWith("/")
          ? item.imageUrl.substring(1)
          : item.imageUrl;
        const absolutePath = path.join(process.cwd(), relativePath);

        if (fs.existsSync(absolutePath)) {
          return fs.readFileSync(absolutePath);
        } else {
          logger.warn(`Resim dosyası diskte bulunamadı: ${absolutePath}`);
        }
      } catch (error) {
        logger.error(
          { err: error },
          `Resim diskten yüklenirken hata oluştu: ${item.imageUrl}`,
        );
      }
    }

    return undefined;
  }

  // ─── Marina Summary PDF ─────────────────────────────────────────────────────

  /**
   * Generates the full Marina Summary PDF for an order.
   * Contains all items with images, departments, and worker assignments.
   */
  async generateMarinaSummaryPDF(order: OrderDetail): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 30, size: "A4" });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      // --- HEADER ---
      doc.rect(30, 30, 535, 60).fill("#1a1a1a");
      doc
        .font(this.boldFont)
        .fontSize(18)
        .fillColor("#ffffff")
        .text(t("pdf_marina_header", "ru"), 30, 45, {
          align: "center",
          width: 535,
        });
      doc
        .font(this.defaultFont)
        .fontSize(10)
        .fillColor("#cccccc")
        .text(t("system_coordinator_title", "ru"), 30, 70, {
          align: "center",
          width: 535,
        });

      doc.moveDown(3);
      let currentY = 110;

      // --- CUSTOMER INFO ---
      doc
        .fillColor("#000")
        .font(this.boldFont)
        .fontSize(12)
        .text(`${t("customer_label", "ru")}: `, 30, currentY, {
          continued: true,
        });
      doc.font(this.defaultFont).text(order.customerName);

      doc
        .font(this.boldFont)
        .text(`${t("order_label", "ru")}: `, 30, currentY + 15, {
          continued: true,
        });
      doc.font(this.defaultFont).text(order.orderNumber);

      doc
        .font(this.boldFont)
        .text(`${t("delivery_label", "ru")}: `, 30, currentY + 30, {
          continued: true,
        });
      doc.font(this.defaultFont).text(order.deliveryDate);

      currentY += 60;

      // --- TABLE HEADER ---
      const colImg = 35;
      const colX = [95, 210, 350, 440];
      doc.rect(30, currentY, 535, 20).fill("#f2f2f2").stroke("#ccc");
      doc.fillColor("#000").font(this.boldFont).fontSize(9);
      doc.text(t("pdf_photo_col", "ru"), colImg, currentY + 5);
      doc.text(t("pdf_table_product", "ru"), colX[0], currentY + 5);
      doc.text(t("pdf_table_details", "ru"), colX[1], currentY + 5);
      doc.text(t("dept_label", "ru"), colX[2], currentY + 5);
      doc.text(t("worker_label", "ru"), colX[3], currentY + 5);

      currentY += 20;

      // --- ROWS ---
      const processRows = async () => {
        for (let index = 0; index < order.items.length; index++) {
          const item = order.items[index];
          const rowHeight = 90;
          if (currentY + rowHeight > 750) {
            doc.addPage();
            currentY = 30;
            doc.rect(30, currentY, 535, 20).fill("#f2f2f2").stroke("#ccc");
            doc.fillColor("#000").font(this.boldFont).fontSize(9);
            doc.text(t("pdf_photo_col", "ru"), colImg, currentY + 5);
            doc.text(t("pdf_table_product", "ru"), colX[0], currentY + 5);
            doc.text(t("pdf_table_details", "ru"), colX[1], currentY + 5);
            doc.text(t("dept_label", "ru"), colX[2], currentY + 5);
            doc.text(t("worker_label", "ru"), colX[3], currentY + 5);
            currentY += 20;
          }

          doc.rect(30, currentY, 535, rowHeight).stroke("#eee");

          const buffer = await this.ensureImageBuffer(item);
          if (buffer) {
            try {
              doc.image(buffer, colImg - 2, currentY + 5, {
                fit: [85, 85],
              });
            } catch (e) {
              logger.warn({ err: e }, "PDF image embed failed");
            }
          }

          doc
            .font(this.boldFont)
            .fontSize(9)
            .fillColor("#000")
            .text(`${index + 1}. ${item.product}`, colX[0], currentY + 10, {
              width: 110,
            });
          doc
            .font(this.defaultFont)
            .fontSize(8)
            .text(item.details || "-", colX[1], currentY + 5, { width: 135 });

          doc.text(`${item.department}`, colX[2], currentY + 10, {
            width: 85,
          });

          const worker =
            item.assignedWorker || t("dist_not_assigned", "ru").toUpperCase();
          doc
            .font(this.boldFont)
            .fillColor(item.assignedWorker ? "#1a73e8" : "#d93025")
            .text(worker, colX[3], currentY + 15, { width: 120 });
          doc.fillColor("#000");

          currentY += rowHeight;
        }
      };

      processRows()
        .then(() => {
          // --- FOOTER ---
          doc
            .fontSize(8)
            .fillColor("#999")
            .text(t("pdf_footer", "ru"), 30, 780, {
              align: "center",
              width: 535,
            });

          doc.end();
        })
        .catch(reject);
    });
  }

  // ─── Fabric Order PDF ───────────────────────────────────────────────────────

  /**
   * Generates a Fabric Order PDF listing items with fabric requirements.
   */
  async generateFabricOrderPDF(order: OrderDetail): Promise<Buffer> {
    const fabricItems = order.items.filter(
      (i) =>
        i.fabricDetails ||
        (i.details && i.details.toLowerCase().includes("kumaş")),
    );

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 30, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err: Error) => reject(err));

      // HEADER
      doc.rect(30, 30, 535, 50).fill("#5d4037");
      doc
        .font(this.boldFont)
        .fontSize(16)
        .fillColor("#ffffff")
        .text(t("pdf_fabric_title", "ru"), 30, 45, {
          align: "center",
          width: 535,
        });

      let currentY = 100;
      doc
        .fillColor("#000")
        .font(this.boldFont)
        .fontSize(11)
        .text(`${t("customer_label", "ru")}: `, 30, currentY, {
          continued: true,
        })
        .font(this.defaultFont)
        .text(order.customerName);

      doc
        .font(this.boldFont)
        .text(`${t("order_label", "ru")}: `, 30, currentY + 15, {
          continued: true,
        })
        .font(this.defaultFont)
        .text(order.orderNumber);

      currentY += 50;

      const processFabricItems = async () => {
        for (let index = 0; index < fabricItems.length; index++) {
          const item = fabricItems[index];
          if (currentY > 700) {
            doc.addPage();
            currentY = 40;
          }

          doc.rect(30, currentY, 535, 100).stroke("#ccc");

          const buffer = await this.ensureImageBuffer(item);
          if (buffer) {
            try {
              doc.image(buffer, 40, currentY + 10, { fit: [80, 80] });
            } catch (_) {
              // Silently skip image if it cannot be embedded
            }
          }

          doc
            .fillColor("#000")
            .font(this.boldFont)
            .fontSize(10)
            .text(`${index + 1}. ${item.product}`, 130, currentY + 15);

          const fabric = item.fabricDetails;
          if (fabric) {
            doc
              .font(this.boldFont)
              .text(`${t("pdf_fabric_name", "ru")} `, 130, currentY + 35, { continued: true })
              .font(this.defaultFont)
              .text(fabric.name || "-");
            doc
              .font(this.boldFont)
              .text(`${t("pdf_fabric_amount", "ru")} `, 130, currentY + 50, {
                continued: true,
              })
              .font(this.defaultFont)
              .text(`${(fabric.amount * (item.quantity || 1)).toFixed(1)} m`);
          } else {
            doc
              .font(this.defaultFont)
              .text(item.details || "-", 130, currentY + 35, { width: 400 });
          }

          currentY += 110;
        }
      };

      processFabricItems()
        .then(() => {
          doc
            .fontSize(8)
            .fillColor("#999")
            .text(t("pdf_footer", "ru"), 30, 780, {
              align: "center",
              width: 535,
            });
          doc.end();
        })
        .catch(reject);
    });
  }

  // ─── PDF → Image Conversion ─────────────────────────────────────────────────

  /**
   * Renders the first page of a PDF buffer to a PNG Buffer.
   * Uses pdfjs-dist + canvas for rendering.
   */
  async generatePDFView(pdfBuffer: Buffer): Promise<Buffer> {
    try {
      logger.info("PDF Görünümü (PNG) oluşturuluyor...");

      const uint8Array = new Uint8Array(pdfBuffer);
      const nodeModulesPath = path.join(
        process.cwd(),
        "node_modules",
        "pdfjs-dist",
      );
      const cMapUrl =
        pathToFileURL(path.join(nodeModulesPath, "cmaps")).href + "/";
      const standardFontDataUrl =
        pathToFileURL(path.join(nodeModulesPath, "standard_fonts")).href + "/";

      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        useSystemFonts: true,
        disableFontFace: false,
        cMapUrl,
        cMapPacked: true,
        standardFontDataUrl,
        isEvalSupported: false,
      });

      const pdfDocument = await loadingTask.promise;
      const page = await pdfDocument.getPage(1);

      const scale = 3.0;

      // Register fonts for canvas rendering
      const regularPath = this.fontRegular;
      const boldPath = this.fontBold;
      if (fs.existsSync(regularPath))
        registerFont(regularPath, { family: "Roboto" });
      if (fs.existsSync(boldPath))
        registerFont(boldPath, { family: "Roboto", weight: "bold" });

      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext("2d");

      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: context, viewport }).promise;

      logger.info("PDF başarıyla PNG'ye dönüştürüldü (Scale: 3.0).");
      return canvas.toBuffer("image/png");
    } catch (error) {
      logger.error({ err: error }, "PDF → PNG dönüşüm hatası");
      throw error;
    }
  }

  // ─── Archive Helpers ────────────────────────────────────────────────────────

  /**
   * Saves a PDF buffer to the daily archive folder.
   */
  async archivePDF(deptName: string, pdfBuffer: Buffer): Promise<string> {
    const today = new Date().toISOString().split("T")[0];
    const pdfDir = path.join(process.cwd(), "data", "orders", today, "pdfs");

    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const safeName = deptName.replace(/[^a-z0-9]/gi, "_").toUpperCase();
    const fileName = `is_emri_${safeName}_${Date.now()}.pdf`;
    const filePath = path.join(pdfDir, fileName);

    fs.writeFileSync(filePath, pdfBuffer);
    logger.info(`PDF arşivlendi: ${filePath}`);
    return filePath;
  }

  // ─── Job Order PDF ──────────────────────────────────────────────────────────

  /**
   * Generates a department-specific Job Order PDF.
   * Contains product images, quantities, and details in Russian.
   */
  async generateJobOrderPDF(
    items: OrderItem[],
    customerName: string,
    department: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 30, size: "A4" });
        const chunks: Buffer[] = [];

        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", (err: Error) => reject(err));

        // --- HEADER ---
        doc.rect(30, 30, 535, 50).fill("#1a1a1a");
        const translatedDept = translateDepartment(department, "ru");
        doc
          .font(this.boldFont)
          .fontSize(16)
          .fillColor("#ffffff")
          .text(translatedDept.toUpperCase(), 30, 45, {
            align: "center",
            width: 535,
          });

        doc.moveDown(2);
        let currentY = 100;

        // --- CUSTOMER INFO ---
        doc
          .fillColor("#000")
          .font(this.boldFont)
          .fontSize(12)
          .text(`${t("customer_label", "ru")}: `, 30, currentY, {
            continued: true,
          });
        doc.font(this.defaultFont).text(customerName);

        doc
          .font(this.boldFont)
          .text(`${t("pdf_date", "ru")}: `, 30, currentY + 15, {
            continued: true,
          });
        doc.font(this.defaultFont).text(new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }));

        currentY += 45;

        // --- ITEMS ---
        const processItems = async () => {
          for (let index = 0; index < items.length; index++) {
            const item = items[index];
            if (currentY > 600) {
              doc.addPage();
              currentY = 40;
            }

            doc.rect(30, currentY, 535, 150).stroke("#cccccc");

            const buffer = await this.ensureImageBuffer(item);
            if (buffer) {
              try {
                doc.image(buffer, 40, currentY + 15, {
                  fit: [120, 120],
                  align: "center",
                  valign: "center",
                });
              } catch {
                doc
                  .fontSize(8)
                  .fillColor("#999")
                  .text(t("pdf_no_image_error", "ru"), 40, currentY + 60);
              }
            } else {
              doc.rect(40, currentY + 15, 120, 120).stroke("#eee");
              doc
                .fontSize(8)
                .fillColor("#999")
                .text(t("pdf_no_image", "ru"), 65, currentY + 65);
            }

            doc.fillColor("#000").font(this.boldFont).fontSize(11);
            doc.text(`${index + 1}. ${item.product}`, 180, currentY + 20);

            doc.font(this.boldFont).fontSize(10);
            doc.text(`${t("pdf_table_quantity", "ru")}:`, 180, currentY + 45, {
              continued: true,
            });
            doc.font(this.defaultFont).text(` ${item.quantity}`);

            doc
              .font(this.boldFont)
              .text(`${t("details_label", "ru")}:`, 180, currentY + 65);
            doc
              .font(this.defaultFont)
              .fontSize(9)
              .text(item.details || "-", 180, currentY + 80, { width: 360 });

            if (item.assignedWorker) {
              doc
                .font(this.boldFont)
                .text(`${t("worker_label", "ru")}:`, 180, currentY + 120, {
                  continued: true,
                });
              doc.font(this.defaultFont).text(` ${item.assignedWorker}`);
            }

            currentY += 165;
          }
        };

        processItems()
          .then(() => {
            // --- FOOTER ---
            doc
              .fontSize(7)
              .fillColor("#aaa")
              .text(t("pdf_footer", "ru"), 30, 790, {
                align: "center",
                width: 535,
              });

            doc.end();
          })
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }
}
