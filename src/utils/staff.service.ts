import fs from "fs";
import path from "path";
import { SupabaseService } from "./supabase.service";
import { Language } from "./i18n";

export interface Staff {
  id?: string;
  telegramId?: number;
  name: string;
  department: string;
  role: string;
  phone?: string;
  language: Language;
  isMarina?: boolean;
}

export class StaffService {
  private static instance: StaffService;
  private supabase: SupabaseService;
  private staffFilePath: string;
  private memoryFilePath: string;
  private staffList: Staff[] = [];

  private constructor() {
    this.supabase = SupabaseService.getInstance();
    this.staffFilePath = path.resolve(process.cwd(), "data", "staff.json");
    this.memoryFilePath = path.resolve(process.cwd(), "data", "memory.md");
    this.ensureDataDirectory();
    this.loadStaffFromSupabase(); // Başlangıçta DB'den çek
  }

  public static getInstance(): StaffService {
    if (!StaffService.instance) {
      StaffService.instance = new StaffService();
    }
    return StaffService.instance;
  }

  private ensureDataDirectory() {
    const dataDir = path.dirname(this.staffFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.staffFilePath)) {
      fs.writeFileSync(this.staffFilePath, JSON.stringify([], null, 2));
    }
  }

  private async loadStaffFromSupabase() {
    try {
      const data = await this.supabase.getAllStaff();
      if (data) {
        // DB'den gelen veriyi yerel interface ile uyumlu hale getir (snake_case -> camelCase)
        this.staffList = data.map((s: any) => ({
          id: s.id,
          telegramId: s.telegram_id,
          name: s.name,
          department: s.department,
          role: s.role,
          phone: s.phone,
          language: s.language || "ru",
          isMarina: s.is_marina,
        }));
        this.saveToLocalFile(); // Yerelde yedekle
      }
    } catch (error) {
      console.error(
        "❌ Personel DB'den yüklenemedi, yerel dosyaya dönülüyor:",
        error,
      );
      this.loadFromLocalFile();
    }
  }

  private loadFromLocalFile() {
    try {
      if (fs.existsSync(this.staffFilePath)) {
        const data = fs.readFileSync(this.staffFilePath, "utf-8");
        this.staffList = JSON.parse(data);
      }
    } catch (err) {
      console.error("❌ Yerel personel dosyası okunamadı:", err);
    }
  }

  private saveToLocalFile() {
    try {
      fs.writeFileSync(
        this.staffFilePath,
        JSON.stringify(this.staffList, null, 2),
      );
    } catch (error) {
      console.error("❌ Personel yerel dosyaya kaydedilemedi:", error);
    }
  }

  public getStaffByTelegramId(telegramId: number): Staff | undefined {
    return this.staffList.find((s) => s.telegramId === telegramId);
  }

  public getStaffByDepartment(department: string): Staff[] {
    const staff = this.staffList.filter(
      (s) =>
        s.department.toLowerCase().includes(department.toLowerCase()) ||
        department.toLowerCase().includes(s.department.toLowerCase()),
    );

    // 🧪 GELİŞTİRİCİ MODU: Eğer bu departmanda hiç personel yoksa ve DEV_MODE=true ise,
    // tüm iş emirleri test için oturum sahibinin (TELEGRAM_CHAT_ID) hesabına yönlendirilir.
    // ÜRETİMDE (DEV_MODE=false) bu fallback DEVRE DIŞIDIR.
    const isDevMode = process.env.DEV_MODE === "true";
    if (staff.length === 0 && isDevMode && process.env.TELEGRAM_CHAT_ID) {
      console.log(
        `🧪 [DEV_MODE] ${department} için personel yok → Test yönlendirmesi aktif (ChatID: ${process.env.TELEGRAM_CHAT_ID})`,
      );
      return [
        {
          telegramId: Number(process.env.TELEGRAM_CHAT_ID),
          name: `Test Ustası (${department})`,
          department: department,
          role: "Personnel",
          language: "tr",
        },
      ];
    }

    return staff;
  }

  public getStaffByName(name: string): Staff | undefined {
    const staff = this.staffList.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );

    // Sanal test personeli aranıyorsa doğrudan sanal bir obje döndür (Sadece Geliştirici Modu için)
    if (
      !staff &&
      name.startsWith("Test Ustası") &&
      process.env.TELEGRAM_CHAT_ID
    ) {
      return {
        telegramId: Number(process.env.TELEGRAM_CHAT_ID),
        name: name,
        department: "Test",
        role: "Personnel",
        language: "tr",
      };
    }

    return staff;
  }

  /**
   * TEST AMAÇLI: Tüm departmanları kullanıcı ID'sine yönlendirmek için.
   */
  public getTestStaff(telegramId: number): Staff {
    return {
      telegramId,
      name: "Test Personeli",
      department: "Test",
      role: "Personnel",
      language: "ru",
    };
  }

  public getMarina(): Staff | undefined {
    return this.staffList.find((s) => s.isMarina === true);
  }

  public getAllStaff(): Staff[] {
    return this.staffList;
  }

  public async registerStaff(
    telegramId: number,
    name: string,
    department: string,
    phone?: string,
    role: string = "Personnel",
    language: Language = "ru",
  ) {
    const staffData = {
      telegramId,
      name,
      department,
      phone,
      role,
      language,
    };

    try {
      await this.supabase.upsertStaff(staffData);
      // DB başarılıysa yerel listeyi tazele
      await this.loadStaffFromSupabase();
    } catch (error) {
      console.error("❌ Personel DB'ye kaydedilemedi (Supabase hatası):", error);
      // Hata fırlatmıyoruz ki middleware çökmesin, yerel listeyle devam edilsin.
    }
  }

  /**
   * Excel'den gelen personel listesini işler ve bekleyen (pending) olarak kaydeder.
   */
  public async processStaffExcel(rows: any[]) {
    console.log(`📊 ${rows.length} satırlık personel listesi işleniyor...`);

    for (const row of rows) {
      // Beklenen sütunlar: İsim, Departman, Telefon (veya Col1, Col2, Col3)
      const name = row.İsim || row.Name || row.Col1 || row.Col2;
      const dept = row.Departman || row.Department || row.Col2 || row.Col3;
      let phone = row.Telefon || row.Phone || row.Col3 || row.Col4;

      if (!name || !dept) continue;

      // Telefon numarasını temizle (sadece rakamlar)
      if (phone) {
        phone = phone.toString().replace(/\D/g, "");
        if (!phone.startsWith("+")) phone = "+" + phone;
      }

      const staffData: Staff = {
        name: name.toString().trim(),
        department: dept.toString().trim(),
        phone: phone ? phone.toString().trim() : undefined,
        role: "Personnel",
        language: "ru",
      };

      try {
        await this.supabase.upsertStaff(staffData);
      } catch (err) {
        console.error(`❌ ${name} kaydı sırasında hata:`, err);
      }
    }

    await this.loadStaffFromSupabase();
  }

  /**
   * Telefon numarası ile eşleşen personeli bulur ve Telegram ID'sini atar.
   */
  public async verifyStaffByPhone(
    telegramId: number,
    phone: string,
  ): Promise<Staff | null> {
    const cleanPhone = phone.replace(/\D/g, "");
    const staff = this.staffList.find((s) => {
      const sPhone = s.phone ? s.phone.replace(/\D/g, "") : "";
      return sPhone.includes(cleanPhone);
    });

    if (!staff) {
      console.log(`⚠️ Telefon eşleşmesi bulunamadı: ${phone}`);
      return null;
    }

    const updatedStaff: Staff = {
      ...staff,
      telegramId,
    };

    try {
      await this.supabase.upsertStaff(updatedStaff);
      await this.loadStaffFromSupabase();
      return updatedStaff;
    } catch (err) {
      console.error("❌ Kayıt tamamlanamadı:", err);
      return null;
    }
  }

  public async removeStaff(telegramId: number): Promise<boolean> {
    const index = this.staffList.findIndex((s) => s.telegramId === telegramId);
    if (index !== -1) {
      try {
        await this.supabase.deleteStaff(telegramId);
        this.staffList.splice(index, 1);
        this.saveToLocalFile();
        return true;
      } catch (error) {
        console.error("❌ Personel DB'den silinemedi:", error);
        return false;
      }
    }
    return false;
  }

  /**
   * Patronun (Barış Bey) daha önce özel cümleyle tanınıp tanınmadığını kontrol eder.
   */
  public isBossRecognizedInMemory(): boolean {
    if (!fs.existsSync(this.memoryFilePath)) return false;
    const content = fs.readFileSync(this.memoryFilePath, "utf-8");
    return content.includes("BARIS_BEY_RECOGNIZED=TRUE");
  }

  /**
   * Patronun tanındığını memory.md dosyasına kaydeder.
   */
  public async setBossRecognizedInMemory() {
    const timestamp = new Date().toISOString();
    const entry = `\n<!-- MEMORY_ENTRY_START -->\n[${timestamp}] BARIŞ_BEY_RECOGNIZED=TRUE\nBarış Bey asistan Ayça tarafından başarıyla tanındı ve sisteme dahil edildi.\n<!-- MEMORY_ENTRY_END -->\n`;
    
    try {
      if (!fs.existsSync(this.memoryFilePath)) {
        fs.writeFileSync(this.memoryFilePath, "# Sandaluci - Ayça Hafıza Kayıtları\n" + entry);
      } else {
        fs.appendFileSync(this.memoryFilePath, entry);
      }
      console.log("📝 Ayça hafızasına Barış Bey'i kaydetti.");
    } catch (error) {
      console.error("❌ Memory dosyasına yazılamadı:", error);
    }
  }

  public isBoss(telegramId: number): boolean {
    const bossIdRaw = (process.env.TELEGRAM_BOSS_ID || "").trim();
    // Virgül ile ayrılmış birden fazla ID'yi destekle (Örn: "ID1,ID2" veya "ID1")
    const bossIds = bossIdRaw
      .split(",")
      .map((id) => id.trim().replace(/['"]/g, ""))
      .filter((id) => id !== "");

    const isMatch = bossIds.includes(telegramId.toString());

    if (isMatch) {
      console.log(`✅ [isBoss Match] User: ${telegramId} is recognized as BOSS`);
      return true;
    } else if (bossIdRaw) {
      console.log(
        `🔍 [isBoss Non-Match] User: ${telegramId}, Config Boss IDs: ${JSON.stringify(bossIds)}`,
      );
    }

    // 2. Staff listesindeki role kontrolü (Yedek yöntem)
    const staff = this.getStaffByTelegramId(telegramId);
    return staff?.role === "SuperAdmin";
  }

  public async processExcelStaff(
    buffer: Buffer,
    _uid: string = "0",
  ): Promise<{ count: number }> {
    const { XlsxUtils } = require("./xlsx-utils");
    const rows = XlsxUtils.parseExcel(buffer);

    let count = 0;
    for (const row of rows) {
      if (row.phone) {
        try {
          await this.supabase.upsertStaff({
            name: row.name || "Bilinmiyor",
            phone: row.phone.toString(),
            department: row.department || "Diğer",
          });
          count++;
        } catch (err) {
          console.error(`❌ Personel Excel satırı Supabase'e yazılamadı:`, err);
        }
      }
    }
    try {
      await this.loadStaffFromSupabase();
    } catch (e) {
      console.warn("⚠️ Excel sonrası personel DB'den tazelenemedi.");
    }
    return { count };
  }

  public getDepartments(): string[] {
    return [
      "Karkas Üretimi",
      "Metal Üretimi",
      "Mobilya Dekorasyon",
      "Dikişhane",
      "Döşemehane",
      "Boyahane",
      "Satınalma",
      "Kalite Kontrol",
      "Paketleme",
      "Sevkiyat",
    ];
  }
}
