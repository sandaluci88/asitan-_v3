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
    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": "https://sandaluci.com",
        "X-Title": "Sandaluci Ayça Asistan",
      },
    });
    this.loadSystemPrompt();
  }

  private loadSystemPrompt(): void {
    const promptPath = path.resolve(
      process.env.SYSTEM_PROMPT_PATH || "./docs/sandaluci_soul.md",
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
  ): Promise<string | null> {
    const messages: ChatMessage[] = [
      { role: "system", content: this.systemPrompt },
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
              model:
                process.env.OPENROUTER_MODEL || "google/gemini-3-flash-preview",
              messages,
            },
            { timeout: 60000 },
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
