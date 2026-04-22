import * as ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import crypto from "crypto";
import { OrderDetail, OrderItem } from "../models/order.schema.js";
import { pino } from "pino";

const logger = pino();

/**
 * Sabit siparis formu icin deterministik Excel parser.
 *
 * Form yapisi (sabit):
 *  - Satir 2: MUSTERI ADI       -> B2
 *  - Satir 3: SIPARIS TARIHI    -> B3
 *  - Satir 7: SIPARIS NO        -> B7
 *  - Satir 8: Baslik satiri
 *  - Satir 9+: Urun satirlari
 *
 * Sutun haritasi (satir 8 basliklari):
 *  A(1)=Resim  B(2)=Kod  C(3)=Urun Adi  D(4)=Miktar  E(5)=Olcu
 *  F(6)=Departman  G(7)=Stok/Not  H(8)=Tur(AHSAP/PLASTIK/METAL)
 *  I(9)=Kumas  J(10)=Dikis  K(11)=Doseme  L(12)=Kumas mt
 *  M(13)=Boya  N(14)=Ip  O(15)=Ip mt  P(16)=Not  S(19)=Teslim
 */

const COL = {
  RESIM: 1,
  KOD: 2,
  URUN_ADI: 3,
  MIKTAR: 4,
  OLCU: 5,
  DEPARTMAN: 6,
  STOK_NOT: 7,
  TUR: 8, // AHSAP / PLASTIK / METAL
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
 * Turkce uretim terimlerini Ruscaya cevirir.
 */
function translateProductionTerm(text: string): string {
  if (!text) return "";
  const t = text.toLowerCase().trim();

  // Durumlar
  if (
    t.includes("uretim yapilacak") ||
    t.includes("uretilecek") ||
    t.includes("yapilacak")
  )
    return "Произвести";
  if (t.includes("stoktan") || t.includes("stok")) return "Со склада";
  if (t.includes("hazir")) return "Готово";
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
 * Urun isimlerini Ruscaya ceviren sozluk
 */
const PRODUCT_TRANSLATIONS: Record<string, string> = {
  sandalye: "Стул",
  masa: "Стол",
  koltuk: "Кресло",
  tabure: "Табурет",
  "bar taburesi": "Барный табурет",
  sehpa: "Журнальный столик",
  benc: "Банкетка",
  puf: "Пуф",
  berjer: "Кресло-бержер",
  metal: "Металлический",
  ahsap: "Деревянный",
};

/**
 * Urun ismini Ruscaya cevirir (veya TR/RU formatina getirir)
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
    logger.error({ err: e }, "Excel okunamadi");
    return null;
  } finally {
    if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }

  const ws = wb.getWorksheet(1);
  if (!ws) {
    logger.error("Worksheet bulunamadi");
    return null;
  }

  // -- Form bilgileri --
  const musteriAdi = cellVal(ws.getRow(2), 2) || "Bilinmiyor";
  const siparisTarihi = cellVal(ws.getRow(3), 2);
  const siparisNo = cellVal(ws.getRow(7), 2) || `SD-${Date.now()}`;
  const teslimTarihi = (() => {
    for (let r = DATA_START_ROW; r <= ws.rowCount; r++) {
      const v = cellVal(ws.getRow(r), COL.TESLIM);
      if (v && v !== "") return v;
    }
    return siparisTarihi || "Belirtilmemis";
  })();

  logger.info(
    { musteriAdi, siparisNo },
    "Siparis formu ayristiriliyor (sabit parser)",
  );

  // -- Resimleri oku --
  const imageMap = new Map<number, { buffer: Buffer; extension: string }>();
  const wsImages = ws.getImages();

  wsImages.forEach((img) => {
    const excelImg = wb.getImage(Number(img.imageId));
    if (!excelImg?.buffer) return;
    const startRow = Math.floor(img.range.tl.row) + 1;
    const buf = Buffer.from(excelImg.buffer as unknown as ArrayBuffer);
    const ext = excelImg.extension || "png";
    if (!imageMap.has(startRow)) {
      imageMap.set(startRow, { buffer: buf, extension: ext });
    }
  });

  logger.info(`${imageMap.size} resim Excel'den okundu`);

  // -- Urun satirlarini isle --
  const orderId = Date.now().toString();
  const items: OrderItem[] = [];
  let itemIndex = 0;

  for (let rowNum = DATA_START_ROW; rowNum <= ws.rowCount; rowNum++) {
    const row = ws.getRow(rowNum);

    const urunAdi = cellVal(row, COL.URUN_ADI);
    if (!urunAdi) continue;

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

    // -- Plastik kontrolu --
    if (isPlastic(tur, urunAdi, stokNot)) {
      items.push(
        makeItem(
          orderId,
          itemIndex++,
          rowNum,
          urunAdi,
          kod,
          "Satialma",
          miktar,
          olcu,
          (() => {
            const ALIM_KEYWORDS = [
              "dis alim",
              "satin alma",
              "satinialma",
              "external",
              "закупка",
              "alim",
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
      logger.info(`Plastik urun -> Satialma: ${urunAdi}`);
      continue;
    }

    // -- Karkas / ana departman --
    const karkasFlag =
      departmanHam.toLowerCase().includes("karkas") ||
      stokNot.toLowerCase().includes("karkas") ||
      stokNot.toLowerCase().includes("uretim yapilacak") ||
      stokNot.toLowerCase().includes("uretilecek");

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
          "Karkas Uretimi",
          miktar,
          olcu,
          detay,
          undefined,
          boya ? { name: boya } : undefined,
          imgData?.buffer,
          imgData?.extension,
        ),
      );
      logger.info(`Karkas: ${urunAdi}`);
    }

    // -- Boyahane --
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
      logger.info(`Boyahane: ${urunAdi} -> ${boya}`);
    }

    // -- Kumas (Marina icin) --
    if (!isEmpty(kumas)) {
      const kumasMiktar = kumasMt > 0 ? kumasMt * miktar : 0;
      items.push(
        makeItem(
          orderId,
          itemIndex++,
          rowNum,
          urunAdi,
          kod,
          "Kumas",
          miktar,
          olcu,
          `Ткань: ${kumas}${kumasMiktar > 0 ? ` | Итого: ${kumasMiktar} м` : ""}`,
          { name: kumas, amount: kumasMiktar },
          undefined,
          imgData?.buffer,
          imgData?.extension,
        ),
      );
      logger.info(`Kumas: ${urunAdi} -> ${kumas}`);
    }

    // -- Dikishane --
    if (!isEmpty(dikis)) {
      items.push(
        makeItem(
          orderId,
          itemIndex++,
          rowNum,
          urunAdi,
          kod,
          "Dikishane",
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
      logger.info(`Dikishane: ${urunAdi}`);
    }

    // -- Dosemehane --
    if (!isEmpty(doseme) || !isEmpty(kumas)) {
      items.push(
        makeItem(
          orderId,
          itemIndex++,
          rowNum,
          urunAdi,
          kod,
          "Dosemehane",
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
      logger.info(`Dosemehane: ${urunAdi}`);
    }

    // -- Hicbir kural tetiklenmediyse genel departmana at --
    if (
      !karkasFlag &&
      isEmpty(boya) &&
      isEmpty(kumas) &&
      isEmpty(dikis) &&
      isEmpty(doseme)
    ) {
      const dept = departmanHam || "Karkas Uretimi";
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
      logger.info(`Genel dept (${dept}): ${urunAdi}`);
    }
  }

  if (items.length === 0) {
    logger.warn("Excel'den hic urun ayristirilamadi");
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
    "Sabit parser tamamlandi",
  );

  return { order, imageMap };
}

// -- Yardimci: OrderItem olustur --
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
  const translatedUrunAdi = translateProductName(urunAdi);
  const translatedDetails = translateProductionTerm(details);

  return {
    id: `${orderId}_${index}`,
    product: translatedUrunAdi + (kod ? ` (${kod})` : ""),
    department,
    quantity,
    details: [translatedDetails, olcu ? `Размер: ${olcu}` : ""]
      .filter(Boolean)
      .join(" | "),
    source: department === "Satialma" ? "External" : "Production",
    status: "bekliyor",
    rowIndex,
    fabricDetails: fabricDetails
      ? { ...fabricDetails, arrived: false }
      : undefined,
    paintDetails: paintDetails
      ? { name: translateProductionTerm(paintDetails.name) }
      : undefined,
    imageBuffer,
    imageExtension,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
