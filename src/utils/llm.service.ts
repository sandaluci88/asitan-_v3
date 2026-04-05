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

  private loadSystemPrompt(): void {
    const promptPath = path.resolve(
      process.env.SYSTEM_PROMPT_PATH || "./kaya/memory/core_memory.md",
    );
    try {
      this.systemPrompt = fs.readFileSync(promptPath, "utf-8");
    } catch (error) {
      logger.error({ err: error }, "Sistem promptu yüklenemedi");
      this.systemPrompt = "Sen Sandaluci mobilya asistanı Ayça'sın.";
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
}
