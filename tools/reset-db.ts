import { SupabaseService } from "../src/utils/supabase.service";
import dotenv from "dotenv";

dotenv.config();

async function runReset() {
  console.log("🚀 Veritabanı sıfırlama işlemi başlatılıyor...");
  const supabase = SupabaseService.getInstance();

  try {
    await supabase.resetDatabase();
    console.log("✅ İşlem başarıyla tamamlandı.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Veritabanı sıfırlanırken hata oluştu:", error);
    process.exit(1);
  }
}

runReset();
