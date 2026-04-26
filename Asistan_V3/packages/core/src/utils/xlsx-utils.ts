import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import crypto from "crypto";
import { logger } from "./logger.js";

export interface ExcelRow {
  [key: string]: any;
  _rowNumber?: number;
  _imageBuffer?: Buffer;
  _imageExtension?: string;
}

export class XlsxUtils {
  /**
   * Excel icerigini JSON dizisine cevirir ve resimleri ayiklar.
   */
  static async parseExcel(bufferOrPath: Buffer | string): Promise<ExcelRow[]> {
    const workbook = new ExcelJS.Workbook();
    let tempHandle: string | null = null;

    try {
      if (typeof bufferOrPath === "string") {
        await workbook.xlsx.readFile(bufferOrPath);
      } else {
        tempHandle = path.join(
          os.tmpdir(),
          `excel_temp_${crypto.randomBytes(8).toString("hex")}.xlsx`,
        );
        fs.writeFileSync(tempHandle, bufferOrPath);
        await workbook.xlsx.readFile(tempHandle);
      }
    } catch (err) {
      logger.error({ err }, "Excel okuma hatasi");
      if (tempHandle && fs.existsSync(tempHandle)) fs.unlinkSync(tempHandle);
      return [];
    }

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      logger.info("Worksheet 1 bulunamadi!");
      if (tempHandle && fs.existsSync(tempHandle)) fs.unlinkSync(tempHandle);
      return [];
    }

    const rows: ExcelRow[] = [];

    // Tum satirlari ham veri olarak oku
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const rowData: ExcelRow = { _rowNumber: rowNumber };

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const val = cell.text ? cell.text.trim() : "";
        if (val) {
          rowData[`Col${colNumber}`] = val;
        }
      });

      // Sadece veri olan satirlari ekle
      if (Object.keys(rowData).length > 1) {
        rows.push(rowData);
      }
    });

    // Resimleri isle
    const images: any[] = [];
    workbook.worksheets.forEach((ws) => {
      const wsImages = ws.getImages();
      if (wsImages && wsImages.length > 0) {
        images.push(...wsImages);
      }
    });

    logger.info(`Toplam ${images.length} resim dosyadan okundu.`);

    const rowImageMap = new Map<
      number,
      { buffer: Buffer; extension: string; size: number; score: number }
    >();

    images.forEach((img) => {
      const excelImage = workbook.getImage(Number(img.imageId));
      if (!excelImage || !excelImage.buffer) return;

      const range = img.range;
      if (range && range.tl) {
        const startRow = Math.floor(range.tl.row) + 1;
        const endRow = Math.floor(range.br.row) + 1;
        const startCol = Math.floor(range.tl.col);

        const imgBuffer = Buffer.from(excelImage.buffer as unknown as ArrayBuffer);
        const imgSize = imgBuffer.length;

        // PUANLAMA MANTIGI:
        // 1. Sutun 0 (A sutunu) icindeyse +100 puan (URUN FOTOSU sutunu)
        // 2. Sadece 1 satir kapliyorsa +50 puan
        // 3. Aspect Ratio kareye yakinsa +75 puan
        // 4. Boyut cok buyukse ceza -50 puan

        let score = 0;
        const width = range.br.col - range.tl.col;
        const height = range.br.row - range.tl.row;
        const aspectRatio = width / (height || 1);
        const isSquareish = aspectRatio > 0.4 && aspectRatio < 2.0;
        const isVeryLarge = imgSize > 1024 * 800;

        if (startCol === 0) score += 100;
        if (startRow === endRow) score += 50;
        if (isSquareish) score += 75;
        if (isVeryLarge) score -= 50;
        if (imgSize > 5120) score += 10;

        const targetRowNumber = startRow;

        const existing = rowImageMap.get(targetRowNumber);
        if (
          !existing ||
          score > existing.score ||
          (score === existing.score && imgSize < existing.size)
        ) {
          rowImageMap.set(targetRowNumber, {
            buffer: imgBuffer,
            extension: excelImage.extension || "png",
            size: imgSize,
            score: score,
          });
        }
      }
    });

    // Bulunan resimleri satirlara ata
    rows.forEach((row) => {
      if (row._rowNumber && rowImageMap.has(row._rowNumber)) {
        const imgData = rowImageMap.get(row._rowNumber)!;
        row._imageBuffer = imgData.buffer;
        row._imageExtension = imgData.extension;
        logger.info(
          `Satir ${row._rowNumber} icin resim atandi (${Math.round(imgData.size / 1024)} KB, Skor: ${imgData.score})`,
        );
      }
    });

    if (tempHandle && fs.existsSync(tempHandle)) fs.unlinkSync(tempHandle);

    // Eger sayfada anchor edilen hic resim yoksa, ancak arka planda (media) resimler mevcutsa
    if (images.length === 0 && (workbook.model as any)?.media?.length) {
      const floatingImages = ((workbook.model as any).media as any[])
        .filter((m: any) => m.type === "image" && m.buffer)
        .map((m: any) => m.buffer);

      if (floatingImages.length > 0) {
        logger.info(
          `Anchor edilememis ${floatingImages.length} adet serbest resim bulundu, sonradan eslestirilecek.`,
        );
        (rows as any).floatingImages = floatingImages;
      }
    }

    return rows;
  }

  /**
   * JSON verisini okunabilir bir string tabloya cevirir.
   */
  static formatToTable(data: ExcelRow[]): string {
    if (data.length === 0) return "Veri bulunamadi.";

    const headers = Object.keys(data[0]).filter(
      (h) => !h.startsWith("_") || h === "_rowNumber",
    );
    let table =
      headers.map((h) => (h === "_rowNumber" ? "RowIndex" : h)).join(" | ") +
      "\n";
    table += headers.map(() => "---").join(" | ") + "\n";

    data.forEach((row) => {
      table +=
        headers
          .map((h) =>
            row[h] !== undefined && row[h] !== null ? String(row[h]) : "-",
          )
          .join(" | ") + "\n";
    });

    return table;
  }
}
