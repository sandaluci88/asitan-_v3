import { QdrantClient } from "@qdrant/js-client-rest";
import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import OpenAI from "openai";
import pino from "pino";
import dotenv from "dotenv";

dotenv.config();
const logger = pino({ name: "DoctorService" });

export interface DiagnosticResult {
  service: string;
  status: "OK" | "ERROR" | "WARNING";
  message: string;
  remedy?: string;
}

export class DoctorService {
  private qdrantClient: QdrantClient;
  private supabaseUrl: string;
  private supabaseKey: string;
  private openai: OpenAI;

  constructor() {
    // SSL bypass
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    this.qdrantClient = new QdrantClient({
      url:
        process.env.QDRANT_URL?.replace(/\/$/, "") ||
        "https://f504c5e3-9607-4b22-86d7-cb77e1b922e6.eu-central-1-0.aws.cloud.qdrant.io:6333",
      apiKey: process.env.QDRANT_API_KEY,
      checkCompatibility: false,
    });
    this.supabaseUrl = process.env.SUPABASE_URL || "";
    this.supabaseKey = process.env.SUPABASE_KEY || "";
    this.openai = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }

  public async checkQdrant(): Promise<DiagnosticResult> {
    const rawUrl =
      process.env.QDRANT_URL ||
      "https://f504c5e3-9607-4b22-86d7-cb77e1b922e6.eu-central-1-0.aws.cloud.qdrant.io:6333";
    const url = rawUrl.trim().replace(/\/$/, "");
    const apiKey = process.env.QDRANT_API_KEY;

    try {
      // 1. Raw Fetch Attempt without the problematic 'agent' property
      // We rely on globally set NODE_TLS_REJECT_UNAUTHORIZED = "0"
      let fetchDetails = "N/A";
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(`${url}/healthz`, {
          signal: controller.signal,
          headers: apiKey ? { "api-key": apiKey } : {},
          // @ts-ignore - Re-introducing the agent that works in checkNetwork
          agent: new (require("https").Agent)({ rejectUnauthorized: false }),
        });

        clearTimeout(timeoutId);
        fetchDetails = `HTTP ${response.status} ${response.statusText}`;
        if (!response.ok) throw new Error(`Status: ${response.status}`);
      } catch (fetchErr: any) {
        throw new Error(
          `Raw Fetch Failed (Status: ${fetchDetails}): ${fetchErr.message}`,
        );
      }

      // 2. Client attempt
      await this.qdrantClient.getCollections();
      return {
        service: "Qdrant",
        status: "OK",
        message: `Bağlantı başarılı. (URL: ${url})`,
      };
    } catch (error: any) {
      let remedy = "QDRANT_URL ve QDRANT_API_KEY değişkenlerini kontrol edin.";
      const errorMsg = error.message || "Bilinmeyen hata";

      if (errorMsg.includes("fetch failed") || errorMsg.includes("aborted")) {
        remedy =
          "Ağ Zaman Aşımı! SSL bypass devrede olmasına rağmen erişim yok. Cloudflare veya WAF ayarlarını kontrol edin.";
      }

      return {
        service: "Qdrant",
        status: "ERROR",
        message: `Hata: ${errorMsg}\nURL: ${url}`,
        remedy,
      };
    }
  }

  public async checkSupabase(): Promise<DiagnosticResult> {
    if (!this.supabaseUrl || !this.supabaseKey) {
      return {
        service: "Supabase",
        status: "WARNING",
        message: "Kimlik bilgileri eksik.",
      };
    }
    const supabase = createClient(this.supabaseUrl, this.supabaseKey);
    try {
      const { error } = await supabase.from("orders").select("id").limit(1);
      if (error) throw error;
      return {
        service: "Supabase",
        status: "OK",
        message: `Bağlantı OK. Proje: ${this.supabaseUrl.split("//")[1].split(".")[0]}`,
      };
    } catch (error: any) {
      return {
        service: "Supabase",
        status: "ERROR",
        message: `Sorgu hatası: ${error.message}`,
        remedy: "Supabase ayarlarını kontrol edin.",
      };
    }
  }

  public async checkLLM(): Promise<DiagnosticResult> {
    try {
      await this.openai.chat.completions.create({
        model: process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      });
      return {
        service: "LLM (OpenRouter)",
        status: "OK",
        message: "Bağlantı başarılı.",
      };
    } catch (error: any) {
      return {
        service: "LLM (OpenRouter)",
        status: "ERROR",
        message: error.message,
      };
    }
  }

  public async checkGmail(): Promise<DiagnosticResult> {
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER || "",
        pass: process.env.GMAIL_PASS || "",
      },
      tls: { rejectUnauthorized: false },
    });
    try {
      await client.connect();
      await client.logout();
      return {
        service: "Gmail (IMAP)",
        status: "OK",
        message: "Giriş başarılı.",
      };
    } catch (error: any) {
      return {
        service: "Gmail (IMAP)",
        status: "ERROR",
        message: error.message,
      };
    }
  }

  public async checkNetwork(): Promise<DiagnosticResult> {
    const qdrantUrl = new URL(
      process.env.QDRANT_URL ||
        "https://f504c5e3-9607-4b22-86d7-cb77e1b922e6.eu-central-1-0.aws.cloud.qdrant.io:6333",
    );

    const targets = [
      {
        host: qdrantUrl.hostname,
        port: qdrantUrl.port
          ? parseInt(qdrantUrl.port)
          : qdrantUrl.protocol === "https:"
            ? 443
            : 80,
      },
      { host: "google.com", port: 443 }, // Internet check
      { host: "aejhzxvuegchakaknwts.supabase.co", port: 443 }, // Supabase check
    ];

    let report = "Ağ Tarama Sonuçları:\n";
    for (const target of targets) {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 3000);
        const protocol = target.port === 443 ? "https" : "http";

        await fetch(`${protocol}://${target.host}:${target.port}/healthz`, {
          signal: controller.signal,
          // @ts-ignore
          agent:
            target.port === 443
              ? new (require("https").Agent)({ rejectUnauthorized: false })
              : undefined,
        });
        clearTimeout(id);
        report += `✅ ${target.host}:${target.port} -> ERİŞİLEBİLİR (${Date.now() - start}ms)\n`;
      } catch (e: any) {
        report += `❌ ${target.host}:${target.port} -> HATA: ${e.message}\n`;
      }
    }

    return {
      service: "Network Scanner",
      status: "WARNING",
      message: report,
    };
  }

  public async runFullDiagnostics(): Promise<DiagnosticResult[]> {
    return [
      await this.checkQdrant(),
      await this.checkNetwork(),
      await this.checkSupabase(),
      await this.checkLLM(),
      await this.checkGmail(),
    ];
  }

  public formatReport(results: DiagnosticResult[]): string {
    const escape = (str: string) =>
      str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let report = "<b>🩺 SİSTEM SAĞLIK RAPORU (DOCTOR)</b>\n\n";
    results.forEach((res) => {
      const icon =
        res.status === "OK" ? "✅" : res.status === "WARNING" ? "⚠️" : "❌";
      report += `${icon} <b>${escape(res.service)}</b>: ${res.status}\n`;
      report += `📝 <i>${escape(res.message)}</i>\n`;
      if (res.remedy) report += `💡 <b>Çözüm:</b> ${escape(res.remedy)}\n`;
      report += "┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n";
    });
    const errors = results.filter((r) => r.status === "ERROR").length;
    report +=
      errors === 0
        ? "\n🚀 <b>Sistem stabil.</b>"
        : `\n⚠️ <b>${errors} hata bulundu.</b>`;
    return report;
  }
}
