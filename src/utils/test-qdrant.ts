import { QdrantClient } from "@qdrant/js-client-rest";
import https from "https";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

/**
 * Qdrant Connection Tester
 *
 * This script attempts to connect to the Qdrant instance configured in .env
 * and performs basic diagnostic checks.
 */
async function testQdrant() {
  console.log("🚀 Qdrant Diagnoz Testi Başlatılıyor...");

  const url =
    process.env.QDRANT_URL?.replace(/\/$/, "") ||
    "https://f504c5e3-9607-4b22-86d7-cb77e1b922e6.eu-central-1-0.aws.cloud.qdrant.io:6333";
  const apiKey = process.env.QDRANT_API_KEY;

  console.log(`--- Yapılandırma ---`);
  console.log(`🔗 Hedef URL: ${url}`);
  console.log(`🔑 API Key set: ${apiKey ? "Yes" : "No"}`);
  console.log(
    `🔐 NODE_TLS_REJECT_UNAUTHORIZED: ${process.env.NODE_TLS_REJECT_UNAUTHORIZED}`,
  );

  // SSL Bypass setup
  const agent = new https.Agent({ rejectUnauthorized: false });

  // 1. Raw Fetch Test
  console.log("\n--- 1. Ham (Raw) HTTP Testi ---");
  try {
    const start = Date.now();
    const healthUrl = `${url}/healthz`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(healthUrl, {
      agent,
      headers: apiKey ? { "api-key": apiKey } : {},
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - start;

    console.log(
      `✅/${response.status === 200 ? "✅" : "⚠️"} Durum: ${response.status} ${response.statusText} (${duration}ms)`,
    );
    const data = await response.text();
    console.log(`📄 Yanıt: ${data}`);
  } catch (err: any) {
    console.error(`❌ Ham Bağlantı Hatası: ${err.message}`);
    analyzeError(err);
  }

  // 2. QdrantClient Test
  console.log("\n--- 2. Qdrant JS Client Testi ---");
  try {
    const client = new QdrantClient({
      url,
      apiKey,
      checkCompatibility: false,
    });

    const start = Date.now();
    const collections = await client.getCollections();
    const duration = Date.now() - start;

    console.log(`✅ Client bağlantısı başarılı! (${duration}ms)`);
    console.log(`📦 Mevcut Koleksiyonlar:`);
    collections.collections.forEach((c) => console.log(` - ${c.name}`));

    // Target Collection Check
    const targetCol = process.env.QDRANT_COLLECTION || "sandaluci_memory";
    console.log(`\n🔍 Hedef Koleksiyon Kontrolü: ${targetCol}`);
    try {
      const info = await client.getCollection(targetCol);
      console.log(`✅ Koleksiyon "${targetCol}" aktif.`);
      console.log(`   Puan Sayısı: ${info.points_count}`);
      console.log(`   Durum: ${info.status}`);
    } catch (e: any) {
      console.log(`⚠️ Koleksiyon "${targetCol}" alınamadı: ${e.message}`);
    }
  } catch (err: any) {
    console.error(`❌ Client Hatası: ${err.message}`);
    analyzeError(err);
  }
}

function analyzeError(error: any) {
  if (error.message.includes("ECONNREFUSED")) {
    console.error(
      "\n💡 İPUCU: Bağlantı reddedildi. VPS firewall'da 6333 portunun açık olduğundan ve Qdrant'ın çalıştığından emin olun.",
    );
  } else if (
    error.message.includes("CERT_HAS_EXPIRED") ||
    error.message.includes("UNABLE_TO_VERIFY_LEAF_SIGNATURE")
  ) {
    console.error(
      "\n💡 İPUCU: SSL Hatası. .env dosyanızda NODE_TLS_REJECT_UNAUTHORIZED=0 olduğundan emin olun.",
    );
  } else if (error.status === 401 || error.status === 403) {
    console.error(
      "\n💡 İPUCU: Yetkilendirme hatası. API Key geçersiz veya sunucu tarafında kapalı.",
    );
  } else if (error.message.includes("ENOTFOUND")) {
    console.error(
      "\n💡 İPUCU: Host adı bulunamadı. URL'nin doğru yazıldığından (örn: domain.com veya IP) emin olun.",
    );
  }
}

testQdrant().then(() => console.log("\n--- Test Tamamlandı ---"));
