import fs from "fs/promises";
import path from "path";
import fsSync from "fs";
import { SupabaseService } from "./supabase.service.js";
import { Language } from "../utils/i18n.js";
import { logger } from "../utils/logger.js";

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
    this.loadStaffFromSupabase();
  }

  public static getInstance(): StaffService {
    if (!StaffService.instance) {
      StaffService.instance = new StaffService();
    }
    return StaffService.instance;
  }

  private ensureDataDirectory() {
    const dataDir = path.dirname(this.staffFilePath);
    if (!fsSync.existsSync(dataDir)) {
      fsSync.mkdirSync(dataDir, { recursive: true });
    }
    if (!fsSync.existsSync(this.staffFilePath)) {
      fsSync.writeFileSync(this.staffFilePath, JSON.stringify([], null, 2));
    }
  }

  private async loadStaffFromSupabase() {
    // TEST MODU: DEV_MODE=true iken yerel staff.json'dan yukle
    if (process.env.DEV_MODE === "true") {
      logger.info(
        "[DEV_MODE] Yerel staff.json kullaniliyor (Supabase atlandi)",
      );
      await this.loadFromLocalFile();
      return;
    }

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
        await this.saveToLocalFile();
      }
    } catch (error) {
      logger.error(
        { err: error },
        "Personel DB'den yuklenemedi, yerel dosyaya donuluyor",
      );
      await this.loadFromLocalFile();
    }
  }

  private async loadFromLocalFile() {
    try {
      const data = await fs.readFile(this.staffFilePath, "utf-8");
      this.staffList = JSON.parse(data);
    } catch (err) {
      if ((err as any).code !== "ENOENT") {
        logger.error({ err }, "Yerel personel dosyasi okunamadi");
      }
    }
  }

  private async saveToLocalFile() {
    try {
      await fs.writeFile(
        this.staffFilePath,
        JSON.stringify(this.staffList, null, 2),
      );
    } catch (error) {
      logger.error({ err: error }, "Personel yerel dosyaya kaydedilemedi");
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

    // GELISTIRICI MODU: Eger bu departmanda hic personel yoksa ve DEV_MODE=true ise,
    // tum is emirleri test icin oturum sahibinin hesabina yonlendirilir.
    const isDevMode = process.env.DEV_MODE === "true";
    if (staff.length === 0 && isDevMode && process.env.TELEGRAM_CHAT_ID) {
      logger.info(
        `[DEV_MODE] ${department} icin personel yok -> Test yonlendirmesi aktif`,
      );
      return [
        {
          telegramId: Number(process.env.TELEGRAM_CHAT_ID),
          name: `Test Ustasi (${department})`,
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

    // Sanal test personeli araniliyorsa dogrudan sanal bir obje dondur (Sadece Gelistirici Modu icin)
    if (
      !staff &&
      name.startsWith("Test Ustasi") &&
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
   * TEST AMACLI: Tum departmanlari kullanici ID'sine yonlendirmek icin.
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
    const marina = this.staffList.find(
      (s) => s.isMarina === true || s.role === "Coordinator",
    );
    if (marina) return marina;

    const marinaId =
      process.env.TELEGRAM_MARINA_ID || process.env.TELEGRAM_BOSS_ID;
    if (marinaId) {
      return this.getStaffByTelegramId(Number(marinaId));
    }
    return undefined;
  }

  public isCoordinator(telegramId: number): boolean {
    const marinaIdRaw = (process.env.TELEGRAM_MARINA_ID || "").trim();
    const bossIdRaw = (process.env.TELEGRAM_BOSS_ID || "").trim();

    const coordinatorIds = [
      ...marinaIdRaw.split(",").map((id) => id.trim()),
      ...bossIdRaw.split(",").map((id) => id.trim()),
    ].filter((id) => id !== "");

    if (coordinatorIds.includes(telegramId.toString())) {
      return true;
    }

    const staff = this.getStaffByTelegramId(telegramId);
    return staff?.role === "Coordinator" || staff?.isMarina === true;
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
      await this.loadStaffFromSupabase();
    } catch (error) {
      logger.error(
        { err: error },
        "Personel DB'ye kaydedilemedi (Supabase hatasi)",
      );
      const existingIdx = this.staffList.findIndex(
        (s) => s.telegramId === telegramId,
      );
      if (existingIdx >= 0) {
        this.staffList[existingIdx] = {
          ...this.staffList[existingIdx],
          ...staffData,
        };
      } else {
        this.staffList.push(staffData as Staff);
      }
      await this.saveToLocalFile();
    }
  }

  /**
   * Excel'den gelen personel listesini isler ve bekleyen (pending) olarak kaydeder.
   */
  public async processStaffExcel(rows: any[]) {
    logger.info(`${rows.length} satirlik personel listesi isleniyor...`);

    for (const row of rows) {
      const name = row.Isim || row.Name || row.Col1 || row.Col2;
      const dept = row.Departman || row.Department || row.Col2 || row.Col3;
      let phone = row.Telefon || row.Phone || row.Col3 || row.Col4;

      if (!name || !dept) continue;

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
        logger.error({ err }, `${name} kaydi sirasinda hata, yerele ekleniyor`);
        const existingIdx = this.staffList.findIndex(
          (s) => s.name === name.toString().trim(),
        );
        if (existingIdx >= 0) {
          this.staffList[existingIdx] = {
            ...this.staffList[existingIdx],
            ...staffData,
          };
        } else {
          this.staffList.push(staffData);
        }
        await this.saveToLocalFile();
      }
    }

    try {
      await this.loadStaffFromSupabase();
    } catch (_) {
      // hata loglanir
    }
  }

  /**
   * Telefon numarasi ile eslesen personeli bulur ve Telegram ID'sini atar.
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
      logger.info(`Telefon eslesmesi bulunamadi: ${phone}`);
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
      logger.error(
        { err },
        "Kayit Supabase'e tamamlanamadi, yerel listeye aliniyor",
      );
      const index = this.staffList.findIndex((s) => s.phone === staff.phone);
      if (index !== -1) {
        this.staffList[index] = updatedStaff;
        await this.saveToLocalFile();
      }
      return updatedStaff;
    }
  }

  public async removeStaff(telegramId: number): Promise<boolean> {
    const index = this.staffList.findIndex((s) => s.telegramId === telegramId);
    if (index !== -1) {
      try {
        await this.supabase.deleteStaff(telegramId);
      } catch (error) {
        logger.error(
          { err: error },
          "Personel DB'den silinemedi (yerel listeden silinmeye devam edilecek)",
        );
      }
      this.staffList.splice(index, 1);
      await this.saveToLocalFile();
      return true;
    }
    return false;
  }

  /**
   * Patronun (Baris Bey) daha once ozel cumleyle taninip taninmadigini kontrol eder.
   */
  public async isBossRecognizedInMemory(): Promise<boolean> {
    try {
      const content = await fs.readFile(this.memoryFilePath, "utf-8");
      return content.includes("BARIS_BEY_RECOGNIZED=TRUE");
    } catch {
      return false;
    }
  }

  /**
   * Patronun tanindigini memory.md dosyasina kaydeder.
   */
  public async setBossRecognizedInMemory() {
    const timestamp = new Date().toISOString();
    const entry = `\n<!-- MEMORY_ENTRY_START -->\n[${timestamp}] BARIS_BEY_RECOGNIZED=TRUE\nBaris Bey asistan Ayca tarafindan basariyla tanindi ve sisteme dahil edildi.\n<!-- MEMORY_ENTRY_END -->\n`;

    try {
      try {
        await fs.access(this.memoryFilePath);
        await fs.appendFile(this.memoryFilePath, entry);
      } catch {
        await fs.writeFile(
          this.memoryFilePath,
          "# Sandaluci - Ayca Hafiza Kayitlari\n" + entry,
        );
      }
      logger.info("Ayca hafizasina Baris Bey'i kaydetti.");
    } catch (error) {
      logger.error({ err: error }, "Memory dosyasina yazilamadi");
    }
  }

  public isBoss(telegramId: number): boolean {
    const bossIdRaw = (process.env.TELEGRAM_BOSS_ID || "").trim();
    const bossIds = bossIdRaw
      .split(",")
      .map((id) => id.trim().replace(/['"]/g, ""))
      .filter((id) => id !== "");

    const isMatch = bossIds.includes(telegramId.toString());

    if (isMatch) {
      logger.info(`[isBoss Match] User: ${telegramId} is recognized as BOSS`);
      return true;
    }

    const staff = this.getStaffByTelegramId(telegramId);
    return staff?.role === "SuperAdmin";
  }

  public async processExcelStaff(
    buffer: Buffer,
    _uid: string = "0",
  ): Promise<{ count: number }> {
    const { XlsxUtils } = await import("../utils/xlsx-utils.js");
    const rows = await XlsxUtils.parseExcel(buffer);

    let count = 0;
    for (const row of rows) {
      if (row.phone) {
        try {
          await this.supabase.upsertStaff({
            name: row.name || "Bilinmiyor",
            phone: row.phone.toString(),
            department: row.department || "Diger",
          });
          count++;
        } catch (err) {
          logger.error({ err }, "Personel Excel satiri Supabase'e yazilamadi");
        }
      }
    }
    try {
      await this.loadStaffFromSupabase();
    } catch (_) {
      logger.warn("Excel sonrasi personel DB'den tazelenemedi.");
    }
    return { count };
  }

  public getDepartments(): string[] {
    return [
      "Karkas Uretimi",
      "Metal Uretimi",
      "Mobilya Dekorasyon",
      "Dikishane",
      "Dosemehane",
      "Boyahane",
      "Satialma",
      "Kalite Kontrol",
      "Paketleme",
      "Sevkiyat",
    ];
  }
}
