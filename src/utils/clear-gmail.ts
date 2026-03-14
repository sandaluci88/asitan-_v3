import { ImapFlow } from "imapflow";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function clearTestEmails() {
  console.log("🔍 Temizleme işlemi başlatılıyor...");
  console.log(`📧 Kullanıcı: ${process.env.GMAIL_USER}`);

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER || "",
      pass: process.env.GMAIL_PASS || "",
    },
    tls: { rejectUnauthorized: true },
  });

  try {
    await client.connect();
    console.log("✅ BAĞLANTI BAŞARILI! Mailler kontrol ediliyor...");

    const lock = await client.getMailboxLock("INBOX");
    try {
      // Tüm mailleri silmek için "1:*" kullanıyoruz. İsterseniz arama kriteri ekleyebilirsiniz.
      // search({ seen: false }) vb.
      const searchResult = await client.search({ all: true });

      if (searchResult && searchResult.length > 0) {
        console.log(
          `🗑️ Toplam ${searchResult.length} mesaj bulundu. Siliniyor...`,
        );

        // Gelen Kutusu'ndaki tüm mesajları silindi olarak işaretle
        await client.messageFlagsAdd("1:*", ["\\Deleted"]);

        // İşaretli mesajları kalıcı olarak sil
        await client.mailboxClose(); // Bu otomatik expunge yapar IMAPFlow'da
        // Ya da await client.expunge() kullanılabilir.
        console.log("✨ Gelen kutusu başarıyla temizlendi.");
      } else {
        console.log("📭 Gelen kutusunda silinecek mail bulunamadı.");
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (error: any) {
    console.error("❌ HATA OLUŞTU:");
    console.error(`Mesaj: ${error.message}`);
    if (error.response) {
      console.error(`Sunucu Yanıtı: ${error.response}`);
    }
  }
}

clearTestEmails();
