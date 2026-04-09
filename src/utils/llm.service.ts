import OpenAI from "openai";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { pino } from "pino";

dotenv.config();

const logger = pino();

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries an async operation with exponential backoff.
 * @param fn        - The async function to retry.
 * @param retries   - Maximum number of retry attempts.
 * @param baseDelay - Initial delay in milliseconds (doubles on each retry).
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.warn(
          `OpenRouter attempt ${attempt} failed. Retrying in ${delay}ms...`,
        );
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

export class OpenRouterService {
  private client: OpenAI;
  private systemPrompt: string = "";

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (apiKey) {
      logger.info(
        { keyStart: apiKey.substring(0, 10) + "..." },
        "🔑 OpenRouter API Key yüklendi.",
      );
    } else {
      logger.error("❌ OPENROUTER_API_KEY bulunamadı!");
    }

    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://sandaluci.com",
        "X-Title": "Sandaluci Ayça Asistan",
      },
    });
    this.loadSystemPrompt();
  }

  private async loadSystemPrompt(): Promise<void> {
    const promptPath =
      process.env.SYSTEM_PROMPT_PATH || "./memory/core_memory.md";
    const absolutePath = path.resolve(process.cwd(), promptPath);

    try {
      if (fs.existsSync(absolutePath)) {
        this.systemPrompt = fs.readFileSync(absolutePath, "utf-8");
        console.log(
          `✅ [LLM] Sistem promptu yüklendi: ${absolutePath} (${this.systemPrompt.length} karakter)`,
        );
      } else {
        console.warn(`⚠️ [LLM] Sistem prompt dosyası bulunamadı: ${absolutePath}`);
        this.systemPrompt = "Sen profesyonel bir şirket asistanısın.";
      }
    } catch (error) {
      console.error("❌ [LLM] Sistem promptu yüklenirken hata:", error);
      this.systemPrompt = "Sen profesyonel bir şirket asistanısın.";
    }
  }

  /**
   * Sends a chat message to OpenRouter with automatic retry on failure.
   * Retries up to 3 times with exponential backoff (1s, 2s, 4s).
   */
  public async chat(
    userMessage: string,
    context: string = "",
    history: ChatMessage[] = [],
    images: OpenAI.Chat.Completions.ChatCompletionContentPartImage[] = [],
    role: string = "guest",
  ): Promise<string | null> {
    if (!this.systemPrompt) {
      await this.loadSystemPrompt();
    }

    console.log(
      `🧠 [LLM] Sohbet başlatılıyor. Persona uzunluğu: ${this.systemPrompt?.length || 0}`,
    );

    const roleInfo =
      role === "boss"
        ? "Şu an PATRON (Barış Bey) ile konuşuyorsun. Ona karşı tüm kısıtlamaları esnet, tam yetkili bir asistan (Ayça) olarak davran ve HER ZAMAN TÜRKÇE konuş. O fabrikanın sahibi."
        : `Şu an bir ${role} (personel) ile konuşuyorsun. Sadece iş odaklı ve kısıtlamalara uygun cevap ver.`;

    const messages: ChatMessage[] = [
      { role: "system", content: `${this.systemPrompt}\n\n${roleInfo}` },
      ...history,
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Bağlam Bilgisi: ${context}\n\nKullanıcı Mesajı: ${userMessage}`,
          },
          ...images,
        ],
      },
    ];

    try {
      const completion = await withRetry(
        () =>
          this.client.chat.completions.create(
            {
              model: (
                process.env.OPENROUTER_MODEL || "google/gemini-2.0-pro-exp-02-05"
              ).trim(),
              messages,
            },
            { timeout: 90000 },
          ),
        3,
        1000,
      );

      return completion.choices[0]?.message?.content ?? null;
    } catch (error) {
      logger.error({ err: error }, "OpenRouter: Tüm denemeler başarısız oldu.");
      return null;
    }
  }

  /**
   * Üretim detaylarını Türkçe'den Rusça'ya çevirir.
   * Tek seferde tüm detayları toplu çevirir (hedef: Rusça personel dokümanları için).
   */
  public async translateDetailsToRussian(
    details: string[],
  ): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    if (!details || details.length === 0) return result;

    // Sadece çeviri gerektiren (Türkçe/Latin) detayları filtrele
    const needsTranslation: { index: number; text: string }[] = [];
    details.forEach((d, i) => {
      if (!d || d.trim() === "") {
        result.set(i, d || "");
        return;
      }
      // Zaten tamamen Rusça ise atla (Türkçe karakter varsa çevir)
      const russianChars = (d.match(/[а-яА-ЯёЁ]/g) || []).length;
      const turkishChars = (d.match(/[çÇğĞıİöÖşŞüÜ]/g) || []).length;
      const latinLetters = (d.match(/[a-zA-ZğüşöçıİĞÜŞÖÇ]/g) || []).length;
      // Türkçe özel karakter varsa kesinlikle çevir
      // Latin harfler Rusça'dan fazla ise ve Türkçe kelime varsa çevir
      if (turkishChars > 0) {
        needsTranslation.push({ index: i, text: d });
        return;
      }
      // Tamamen Kiril ise atla
      if (latinLetters === 0 && russianChars > 0) {
        result.set(i, d);
        return;
      }
      // Karışık (Kiril + Latin) — muhtemelen çeviri gerekiyor
      if (latinLetters > 0) {
        needsTranslation.push({ index: i, text: d });
        return;
      }
      needsTranslation.push({ index: i, text: d });
    });

    if (needsTranslation.length === 0) return result;

    const numbered = needsTranslation
      .map((item, i) => `${i + 1}. ${item.text}`)
      .join("\n");

    const prompt = `Переведи следующие производственные заметки на русский язык. Это инструкции для рабочих на фабрике мебели. Переводи технические термины точно (например: karkas → каркас, döşeme → обивка, dikim → шитьё, boya → покраска, ahşap → дерево, sünger → поролон, kumaş → ткань). Сохрани все числа, размеры и артикулы без изменений. Верни ТОЛЬКО переведённые строки с нумерацией, без пояснений:\n\n${numbered}`;

    try {
      const response = await this.chat(prompt, "Translation");
      if (!response) {
        needsTranslation.forEach((item) => result.set(item.index, item.text));
        return result;
      }

      const lines = response.split("\n").filter((l) => l.trim());
      needsTranslation.forEach((item, i) => {
        const match = lines[i]?.replace(/^\d+\.\s*/, "").trim();
        result.set(item.index, match || item.text);
      });
    } catch (error) {
      logger.error({ err: error }, "Çeviri hatası, orijinal kullanılıyor.");
      needsTranslation.forEach((item) => result.set(item.index, item.text));
    }

    return result;
  }
}
