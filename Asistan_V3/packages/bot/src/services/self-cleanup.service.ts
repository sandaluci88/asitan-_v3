import fs from "fs";
import path from "path";
import os from "os";
import { logger } from "@sandaluci/core";

export class SelfCleanupService {
  /**
   * Sistemsel temizlik yapar: Geçici dosyalar, test scriptleri ve loglar.
   */
  public static async performCleanup(): Promise<{
    success: boolean;
    deletedItems: string[];
  }> {
    const deletedItems: string[] = [];
    const baseDir = process.cwd();
    const utilsDir = path.join(baseDir, "src", "utils");

    try {
      // 1. Test Scriptlerini Temizle (src/utils/test-*.ts ve check-*.ts)
      if (fs.existsSync(utilsDir)) {
        const files = fs.readdirSync(utilsDir);
        for (const file of files) {
          if (
            file.startsWith("test-") ||
            file.startsWith("check-") ||
            file.endsWith("-test.ts")
          ) {
            const filePath = path.join(utilsDir, file);
            fs.unlinkSync(filePath);
            deletedItems.push(`Script: ${file}`);
          }
        }
      }

      // 2. Geçici Ses Dosyalarını Temizle (/tmp içindeki voice_*)
      const tempDir = os.tmpdir();
      const tempFiles = fs.readdirSync(tempDir);
      for (const file of tempFiles) {
        if (
          file.startsWith("voice_") &&
          (file.endsWith(".ogg") || file.endsWith(".mp3"))
        ) {
          const filePath = path.join(tempDir, file);
          try {
            fs.unlinkSync(filePath);
            deletedItems.push(`Temp: ${file}`);
          } catch (_) {
            // Dosya o an kullanılıyor olabilir, geç
          }
        }
      }

      // 3. Kök dizindeki geçici/test dosyalarını temizle
      const rootFiles = [
        "check-db-counts.js",
        "cleanup-db.js",
        "db2.txt",
        "db_err.txt",
        "output.txt",
        "report_output.txt",
        "test-output.png",
        "test-pdf-view.ts",
        "verify_db_output.txt",
        "verify_results.txt",
      ];
      for (const file of rootFiles) {
        const filePath = path.join(baseDir, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedItems.push(`Root: ${file}`);
        }
      }

      // 4. Diğer özel scriptleri temizle (src/utils içinde)
      const specialScripts = [
        "full-cleanup.ts",
        "list-recent-uids.ts",
        "verify-db.ts",
        "reset-mail-flag.ts",
        "clear-gmail.ts",
        "analyze-dump.ts",
      ];
      for (const script of specialScripts) {
        const scriptPath = path.join(utilsDir, script);
        if (fs.existsSync(scriptPath)) {
          fs.unlinkSync(scriptPath);
          deletedItems.push(`Script: ${script}`);
        }
      }

      // 5. Yerel Veri Dosyalarını Sıfırla (Loglar)
      const logFile = path.join(baseDir, "data", "verilen_siparisler.log");
      if (fs.existsSync(logFile)) {
        fs.writeFileSync(logFile, "");
        deletedItems.push("Log: verilen_siparisler.log (sıfırlandı)");
      }

      logger.info(
        { deletedCount: deletedItems.length },
        "✨ Self-cleanup başarıyla tamamlandı.",
      );
      return { success: true, deletedItems };
    } catch (error: any) {
      logger.error(
        { error: error.message },
        "❌ Self-cleanup sırasında hata oluştu.",
      );
      return { success: false, deletedItems };
    }
  }
}
