import * as fs from "fs";
import * as path from "path";
import { Bot, InlineKeyboard, InputFile } from "grammy";
import * as dotenv from "dotenv";
import { OrderService } from "./src/utils/order.service";
import { StaffService } from "./src/utils/staff.service";
import { XlsxUtils } from "./src/utils/xlsx-utils";
import { translateDepartment } from "./src/utils/i18n";

dotenv.config();

// Doğru ENV anahtarları
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error("❌ TELEGRAM_BOT_TOKEN eksik!");
  process.exit(1);
}

const bot = new Bot(botToken);
const orderService = OrderService.getInstance();
const staffService = StaffService.getInstance();

// Sabit ID'ler (staff.json'dan)
const marinaId = 1030595483;
const bossId = 6030287709;

const MANUAL_DEPARTMENTS = [
  "Dikişhane",
  "Döşemehane",
  "Dikiş",
  "Döşeme",
  "Швейный цех",
  "Обивочный цех",
  "Швейный",
  "Обивочный",
  "Sewing",
  "Upholstery",
];

const isManualDept = (dept: string) => {
  const d = (dept || "").toLowerCase().trim();
  if (!d) return false;
  return MANUAL_DEPARTMENTS.some((manual) => {
    const m = manual.toLowerCase();
    return d.includes(m) || m.includes(d);
  });
};

async function simulate() {
  console.log("🚀 Simülasyon başlatılıyor...");
  const filePath = path.join(
    process.cwd(),
    "docs",
    "SIPARIS FORMU-DENEME SIPARIS.xlsx",
  );
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Dosya bulunamadı: ${filePath}`);
    return;
  }
  const fileContent = fs.readFileSync(filePath);

  console.log("📊 Excel ayrıştırılıyor...");
  const excelRows = await XlsxUtils.parseExcel(fileContent);
  const promptData = excelRows.map((r: any) => {
    const copy = { ...r };
    delete copy._imageBuffer;
    return copy;
  });

  console.log("📝 Sipariş nesnesi oluşturuluyor...");
  const order = await orderService.parseAndCreateOrder(
    "SIMÜLASYON TEST: " + path.basename(filePath),
    JSON.stringify(promptData, null, 2),
    "sim_" + Date.now().toString(),
    [
      {
        filename: path.basename(filePath),
        content: fileContent,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  );

  if (!order) {
    console.error("❌ Sipariş oluşturulamadı (Service null döndü)!");
    return;
  }

  console.log(`✅ Sipariş Kaydedildi: ${order.orderNumber}`);

  const autoDepts = Array.from(
    new Set(order.items.map((i: any) => i.department)),
  ).filter((d: any) => !isManualDept(d)) as string[];

  const hasManualDepts = order.items.some((i: any) =>
    isManualDept(i.department),
  );

  console.log(`🔍 Otomatik Birimler: ${autoDepts.join(", ")}`);
  console.log(
    `🔍 Manuel Birimler Var mı?: ${hasManualDepts ? "Evet" : "Hayır"}`,
  );

  // OTOMATİK DAĞITIM (Boyahane dahil)
  if (autoDepts.length > 0) {
    console.log(`🕒 Otomatik birimler dağıtılıyor...`);
    await processOrderDistribution(order, [], excelRows, undefined, autoDepts);
  }

  // MANUEL DAĞITIM BİLGİSİ
  if (hasManualDepts) {
    const deptsToAssign = Array.from(
      new Set(
        order.items
          .filter((i: any) => isManualDept(i.department))
          .map((i: any) => i.department as string),
      ),
    );
    console.log(
      `📝 Atama bekleyen (Marina'ya gidecek) birimler: ${deptsToAssign.join(", ")}`,
    );
  }

  console.log("🏁 Simülasyon tamamlandı.");
}

async function processOrderDistribution(
  order: any,
  images: any[],
  excelRows: any[],
  manualAssignments: Record<string, number> | undefined,
  targetDepts: string[],
) {
  for (const currentDept of targetDepts) {
    const deptItems = order.items.filter(
      (i: any) => i.department === currentDept,
    );
    if (deptItems.length === 0) continue;

    try {
      // PDF oluşturma (OrderService içindeki pdfService üzerinden)
      const pdfBuffer = await (
        orderService as any
      ).pdfService.generateJobOrderPDF(
        deptItems,
        order.customerName || "Simülasyon Müşterisi",
        currentDept,
      );

      let targetIds: number[] = [];
      const departmentalStaffIds = staffService
        .getStaffByDepartment(currentDept)
        .map((s) => s.telegramId)
        .filter((id) => !!id) as number[];

      if (departmentalStaffIds.length > 0) {
        targetIds = departmentalStaffIds;
      } else {
        // Personel yoksa test için Boss'a (6030287709) gönder
        targetIds = [bossId];
      }

      for (const targetId of targetIds) {
        const staff = staffService.getStaffByTelegramId(targetId);

        // KRİTİK: Boyahane ve Satınalma için RU zorlaması
        const lang =
          currentDept.toLowerCase() === "satınalma" ||
          currentDept.toLowerCase().includes("boya")
            ? "ru"
            : staff?.language || "ru";

        console.log(
          `📤 [DAĞITIM] ${currentDept} -> ID: ${targetId} | Dil: ${lang}`,
        );

        await bot.api.sendDocument(
          targetId,
          new InputFile(pdfBuffer, `${currentDept}_Simulasyon.pdf`),
          {
            caption: `📄 🧪 <b>TEST DAĞITIMI</b>\n\n<b>Birim:</b> ${translateDepartment(currentDept, lang)}\n<b>Dil:</b> ${lang}\n\n<i>Bu bir simülasyon mesajıdır.</i>`,
            parse_mode: "HTML",
          },
        );
      }
    } catch (err) {
      console.error(`❌ Hata (${currentDept}):`, err);
    }
  }
}

simulate().catch(console.error);
