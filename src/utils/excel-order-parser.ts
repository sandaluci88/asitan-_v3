import * as ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import crypto from "crypto";
import { OrderDetail, OrderItem } from "../models/order.schema";
import { pino } from "pino";

const logger = pino();

/**
 * Sabit sipariş formu için deterministik Excel parser.
 *
 * Form yapısı (sabit):
 *  - Satır 2: MUSTERI ADI       → B2
 *  - Satır 3: SIPARIS TARIHI    → B3
 *  - Satır 7: SİPARİŞ NO        → B7
 *  - Satır 8: Başlık satırı
 *  - Satır 9+: Ürün satırları
 *
 * Sütun haritası (satır 8 başlıkları):
 *  A(1)=Resim  B(2)=Kod  C(3)=Ürün Adı  D(4)=Miktar  E(5)=Ölçü
 *  F(6)=Departman  G(7)=Stok/Not  H(8)=Tür(AHSAP/PLASTİK/METAL)
 *  I(9)=Kumaş  J(10)=Dikiş  K(11)=Döşeme  L(12)=Kumaş mt
 *  M(13)=Boya  N(14)=İp  O(15)=İp mt  P(16)=Not  S(19)=Teslim
 */

const COL = {
  RESIM: 1,
  KOD: 2,
  URUN_ADI: 3,
  MIKTAR: 4,
  OLCU: 5,
  DEPARTMAN: 6,
  STOK_NOT: 7,
  TUR: 8, // AHSAP / PLASTİK / METAL
  KUMAS: 9,
  DIKIS: 10,
  DOSEME: 11,
  KUMAS_MT: 12,
  BOYA: 13,
  IP: 14,
  IP_MT: 15,
  NOT: 16,
  TESLIM: 19,
};

const HEADER_ROW = 8;
const DATA_START_ROW = 9;

function cellVal(row: ExcelJS.Row, col: number): string {
  const cell = row.getCell(col);
  return (cell.text || String(cell.value ?? "")).trim();
}

function isEmpty(v: string): boolean {
  return !v || v.toLowerCase() === "yok" || v === "-" || v === "0";
}

function isPlastic(tur: string, urunAdi: string, not: string): boolean {
  const keywords = [
    "plastik",
    "пластик",
    "plastic",
    "полимер",
    "полипропилен",
    "пластиковый",
    "пластиковые",
    "пластмасс",
    "пвх",
    "pvc",
    "pp",
  ];
  const haystack = `${tur} ${urunAdi} ${not}`.toLowerCase();
  return keywords.some((kw) => haystack.includes(kw));
}

/**
 * Türkçe üretim terimlerini Rusçaya çevirir.
 */
function translateProductionTerm(text: string): string {
  if (!text) return "";
  let t = text.toLowerCase().trim();

  // Durumlar
  if (
    t.includes("üretim yapılacak") ||
    t.includes("üretilecek") ||
    t.includes("yapılacak")
  )
    return "Произвести";
  if (t.includes("stoktan") || t.includes("stok")) return "Со склада";
  if (t.includes("hazır")) return "Готово";
  if (t.includes("acil")) return "СРОЧНО";

  // Boya & Kaplama
  if (t === "parlak") return "Глянцевый";
  if (t === "mat") return "Матовый";
  if (t === "ipek mat") return "Шелковисто-матовый";
  if (t === "siyah") return "Черный";
  if (t === "beyaz") return "Белый";
  if (t === "ceviz") return "Орех";
  if (t === "naturel") return "Натуральный";
  if (t === "lake") return "Лакированный";

  return text;
}

/**
 * Ürün isimlerini Rusçaya çeviren sözlük
 */
const PRODUCT_TRANSLATIONS: Record<string, string> = {
  sandalye: "Стул",
  masa: "Стол",
  koltuk: "Кресло",
  tabure: "Табурет",
  "bar taburesi": "Барный табурет",
  sehpa: "Журнальный столик",
  benç: "Банкетка",
  puf: "Пуф",
  berjer: "Кресло-бержер",
  metal: "Металлический",
  ahşap: "Деревянный",
};

/**
 * Ürün ismini Rusçaya çevirir (veya TR/RU formatına getirir)
 */
function translateProductName(name: string): string {
  if (!name) return "";
  const lowerName = name.toLowerCase();

  let ruName = name;
  for (const [tr, ru] of Object.entries(PRODUCT_TRANSLATIONS)) {
    if (lowerName.includes(tr)) {
      ruName = ruName.replace(new RegExp(tr, "gi"), ru);
    }
  }

  // Eğer hiçbir şey değişmediyse olduğu gibi bırak, değiştiyse [TR] / [RU] yapma (Kullanıcı "boyahane için direkt Rusça" istedi)
  return ruName;
}

export interface ParsedOrderResult {
  order: OrderDetail;
  imageMap: Map<number, { buffer: Buffer; extension: string }>;
}

export async function parseOrderExcel(
  bufferOrPath: Buffer | string,
): Promise<ParsedOrderResult | null> {
  const wb = new ExcelJS.Workbook();
  let tempFile: string | null = null;

  try {
    if (typeof bufferOrPath === "string") {
      await wb.xlsx.readFile(bufferOrPath);
    } else {
      tempFile = path.join(
        os.tmpdir(),
        `order_${crypto.randomBytes(6).toString("hex")}.xlsx`,
      );
      fs.writeFileSync(tempFile, bufferOrPath);
      await wb.xlsx.readFile(tempFile);
    }
  } catch (e) {
    logger.error({ err: e }, "Excel okunamadı");
    return null;
  } finally {
    if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }

  const ws = wb.getWorksheet(1);
  if (!ws) {
    logger.error("Worksheet bulunamadı");
    return null;
  }

  // ── Form bilgileri ──────────────────────────────────────────────
  const musteriAdi = cellVal(ws.getRow(2), 2) || "Bilinmiyor";
  const siparisTarihi = cellVal(ws.getRow(3), 2);
  const siparisNo = cellVal(ws.getRow(7), 2) || `SD-${Date.now()}`;
  const teslimTarihi = (() => {
    // İlk ürün satırından teslim tarihi al (S sütunu)
    for (let r = DATA_START_ROW; r <= ws.rowCount; r++) {
      const v = cellVal(ws.getRow(r), COL.TESLIM);
      if (v && v !== "") return v;
    }
    return siparisTarihi || "Belirtilmemiş";
  })();

  logger.info(
    { musteriAdi, siparisNo },
    "📋 Sipariş formu ayrıştırılıyor (sabit parser)",
  );

  // ── Resimleri oku ───────────────────────────────────────────────
  const imageMap = new Map<number, { buffer: Buffer; extension: string }>();
  const wsImages = ws.getImages();

  wsImages.forEach((img) => {
    const excelImg = wb.getImage(Number(img.imageId));
    if (!excelImg?.buffer) return;
    const startRow = Math.floor(img.range.tl.row) + 1; // 0-indexed → 1-indexed
    const buf = Buffer.from(excelImg.buffer as any);
    const ext = excelImg.extension || "png";
    if (!imageMap.has(startRow)) {
      imageMap.set(startRow, { buffer: buf, extension: ext });
    }
  });

  logger.info(`🖼️ ${imageMap.size} resim Excel'den okundu`);

  // ── Ürün satırlarını işle ───────────────────────────────────────
  const orderId = Date.now().toString();
  const items: OrderItem[] = [];
  let itemIndex = 0;

  for (let rowNum = DATA_START_ROW; rowNum <= ws.rowCount; rowNum++) {
    const row = ws.getRow(rowNum);

    const urunAdi = cellVal(row, COL.URUN_ADI);
    if (!urunAdi) continue; // Boş satır, atla

    const kod = cellVal(row, COL.KOD);
    const miktar = parseInt(cellVal(row, COL.MIKTAR)) || 0;
    const olcu = cellVal(row, COL.OLCU);
    const departmanHam = cellVal(row, COL.DEPARTMAN);
    const stokNot = cellVal(row, COL.STOK_NOT);
    const tur = cellVal(row, COL.TUR);
    const kumas = cellVal(row, COL.KUMAS);
    const dikis = cellVal(row, COL.DIKIS);
    const doseme = cellVal(row, COL.DOSEME);
    const kumasMt = parseFloat(cellVal(row, COL.KUMAS_MT)) || 0;
    const boya = cellVal(row, COL.BOYA);
    const ip = cellVal(row, COL.IP);
    const not = cellVal(row, COL.NOT);

    const imgData = imageMap.get(rowNum);

    // ── Plastik kontrolü ──────────────────────────────────────────
    if (isPlastic(tur, urunAdi, stokNot)) {
      items.push(
        makeItem(
          orderId,
          itemIndex++,
          rowNum,
          urunAdi,
          kod,
          "Satınalma",
          miktar,
          olcu,
          (() => {
            // stokNot/not içindeki alım/satın alma eşanlamlılarını filtrele
            const ALIM_KEYWORDS = [
              "dış alım",
              "satın alma",
              "satınalma",
              "external",
              "закупка",
              "alım",
            ];
            const extra = (not || stokNot || "").trim();
            const isRedundant = ALIM_KEYWORDS.some((k) =>
              extra.toLowerCase().includes(k),
            );
            return isRedundant || !extra
              ? "Внешняя закупка (пластик)."
              : `Внешняя закупка (пластик). ${extra}`;
          })(),
          undefined,
          undefined,
          imgData?.buffer,
          imgData?.extension,
        ),
      );
      logger.info(`🛒 Plastik ürün → Satınalma: ${urunAdi}`);
      continue;
    }

    // ── Karkas / ana departman ────────────────────────────────────
    const karkasFlag =
      departmanHam.toLowerCase().includes("karkas") ||
      stokNot.toLowerCase().includes("karkas") ||
      stokNot.toLowerCase().includes("üretim yapılacak") ||
      stokNot.toLowerCase().includes("üretilecek");

    if (karkasFlag) {
      const detay = [
        boya ? `Цвет: ${boya}` : "",
        translateProductionTerm(stokNot),
        translateProductionTerm(not),
        olcu ? `Размер: ${olcu}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      items.push(
        makeItem(
          orderId,
          itemIndex++,
          rowNum,
          urunAdi,
          kod,
          "Karkas Üretimi",
          miktar,
          olcu,
          detay,
          undefined,
          boya ? { name: boya } : undefined,
          imgData?.buffer,
          imgData?.extension,
        ),
      );
      logger.info(`🔩 Karkas: ${urunAdi}`);
    }

    // ── Boyahane ──────────────────────────────────────────────────
    if (!isEmpty(boya)) {
      items.push(
        makeItem(
          orderId,
          itemIndex++,
          rowNum,
          urunAdi,
          kod,
          "Boyahane",
          miktar,
          olcu,
          `Цвет: ${boya}`,
          undefined,
          { name: boya },
          imgData?.buffer,
          imgData?.extension,
        ),
      );
      logger.info(`🎨 Boyahane: ${urunAdi} → ${boya}`);
    }

    // ── Kumaş (Marina için) ───────────────────────────────────────
    if (!isEmpty(kumas)) {
      const kumasMiktar = kumasMt > 0 ? kumasMt * miktar : 0;
      items.push(
        makeItem(
          orderId,
          itemIndex++,
          rowNum,
          urunAdi,
          kod,
          "Kumaş",
          miktar,
          olcu,
          `Ткань: ${kumas}${kumasMiktar > 0 ? ` | Итого: ${kumasMiktar} м` : ""}`,
          { name: kumas, amount: kumasMiktar },
          undefined,
          imgData?.buffer,
          imgData?.extension,
        ),
      );
      logger.info(`🧶 Kumaş: ${urunAdi} → ${kumas}`);
    }

    // ── Dikişhane ─────────────────────────────────────────────────
    // Kural: dikis sütunu doluysa veya kumaş + dikis birlikte varsa tetiklenir
    if (!isEmpty(dikis)) {
      items.push(
        makeItem(
          orderId,
          itemIndex++,
          rowNum,
          urunAdi,
          kod,
          "Dikişhane",
          miktar,
          olcu,
          `Шитьё: ${dikis}${ip ? ` | Нить: ${ip}` : ""}`,
          !isEmpty(kumas)
            ? { name: kumas, amount: kumasMt * miktar }
            : undefined,
          undefined,
          imgData?.buffer,
          imgData?.extension,
        ),
      );
      logger.info(`🧵 Dikişhane: ${urunAdi}`);
    }

    // ── Döşemehane ────────────────────────────────────────────────
    // Kural: kumaş varsa döşemehane KESİNLİKLE tetiklenir (doseme sütunu boş olsa bile)
    if (!isEmpty(doseme) || !isEmpty(kumas)) {
      items.push(
        makeItem(
          orderId,
          itemIndex++,
          rowNum,
          urunAdi,
          kod,
          "Döşemehane",
          miktar,
          olcu,
          `Обивка: ${doseme || kumas}${!isEmpty(kumas) ? ` | Ткань: ${kumas}` : ""}`,
          !isEmpty(kumas)
            ? { name: kumas, amount: kumasMt * miktar }
            : undefined,
          undefined,
          imgData?.buffer,
          imgData?.extension,
        ),
      );
      logger.info(`🪑 Döşemehane: ${urunAdi}`);
    }

    // ── Hiçbir kural tetiklenmediyse genel departmana at ─────────
    if (
      !karkasFlag &&
      isEmpty(boya) &&
      isEmpty(kumas) &&
      isEmpty(dikis) &&
      isEmpty(doseme)
    ) {
      const dept = departmanHam || "Karkas Üretimi";
      items.push(
        makeItem(
          orderId,
          itemIndex++,
          rowNum,
          urunAdi,
          kod,
          dept,
          miktar,
          olcu,
          [stokNot, not].filter(Boolean).join(" | "),
          undefined,
          undefined,
          imgData?.buffer,
          imgData?.extension,
        ),
      );
      logger.info(`📦 Genel dept (${dept}): ${urunAdi}`);
    }
  }

  if (items.length === 0) {
    logger.warn("Excel'den hiç ürün ayrıştırılamadı");
    return null;
  }

  const order: OrderDetail = {
    id: orderId,
    orderNumber: siparisNo,
    customerName: musteriAdi,
    deliveryDate: teslimTarihi,
    items,
    status: "new",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  logger.info(
    {
      itemCount: items.length,
      depts: [...new Set(items.map((i) => i.department))],
    },
    "✅ Sabit parser tamamlandı",
  );

  return { order, imageMap };
}

// ── Yardımcı: OrderItem oluştur ────────────────────────────────────
function makeItem(
  orderId: string,
  index: number,
  rowIndex: number,
  urunAdi: string,
  kod: string,
  department: string,
  quantity: number,
  olcu: string,
  details: string,
  fabricDetails?: { name: string; amount: number },
  paintDetails?: { name: string },
  imageBuffer?: Buffer,
  imageExtension?: string,
): OrderItem {
  // Departman bazlı ürün ismi çevirisi (Boyahane için RU zorunlu)
  const isRussianRequired =
    department === "Boyahane" || department === "Satınalma";
  const translatedUrunAdi = isRussianRequired
    ? translateProductName(urunAdi)
    : urunAdi;
  const translatedDetails = isRussianRequired
    ? translateProductionTerm(details)
    : details;

  return {
    id: `${orderId}_${index}`,
    product: translatedUrunAdi + (kod ? ` (${kod})` : ""),
    department,
    quantity,
    details: [translatedDetails, olcu ? `Размер: ${olcu}` : ""]
      .filter(Boolean)
      .join(" | "),
    source: department === "Satınalma" ? "External" : "Production",
    status: "bekliyor",
    rowIndex,
    fabricDetails: fabricDetails
      ? { ...fabricDetails, arrived: false }
      : undefined,
    paintDetails,
    imageBuffer,
    imageExtension,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
