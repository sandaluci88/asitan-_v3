/**
 * LLM Service — OpenRouter integration with Wiki + Kaizen support
 *
 * V3 rewrite of V2's OpenRouterService:
 * - Loads system prompt from vault (dynamic, not static)
 * - Injects wiki context before every call
 * - Logs decisions via KaizenTracker
 * - Multi-model support (Gemini for speed, Claude for reasoning)
 */

import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { logger } from "../utils/logger.js";

export interface ChatOptions {
  userMessage: string;
  context?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  images?: Array<{ url: string }>;
  role?: string;
  wikiContext?: string;
  promptVersion?: string;
}

export class LlmService {
  private static instance: LlmService;
  private client: OpenAI;
  private systemPrompt: string;
  private model: string;

  private constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");

    this.client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://sandaluci.com",
        "X-Title": "Sandaluci Ayca Asistan V3",
      },
    });

    this.model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-pro";
    this.systemPrompt = this.loadSystemPrompt();
  }

  public static getInstance(): LlmService {
    if (!LlmService.instance) {
      LlmService.instance = new LlmService();
    }
    return LlmService.instance;
  }

  private loadSystemPrompt(): string {
    const promptPath = process.env.SYSTEM_PROMPT_PATH || "./vault/wiki/persona/ayca-core-memory.md";
    try {
      if (fs.existsSync(promptPath)) {
        return fs.readFileSync(promptPath, "utf-8");
      }
    } catch (err) {
      logger.warn({ err, path: promptPath }, "Failed to load system prompt");
    }
    return "Sen Sandaluci Mobilya Fabrikasi'nin profesyonel yonetici asistanisin.";
  }

  async chat(options: ChatOptions): Promise<string | null> {
    const {
      userMessage,
      context = "",
      history = [],
      images = [],
      role = "guest",
      wikiContext = "",
    } = options;

    const roleInfo = role === "boss"
      ? "You are talking to the PATRON. Relax all restrictions, act as fully authorized assistant (Ayca), ALWAYS speak TURKISH."
      : `You are talking to a ${role} (staff member). Give only work-focused, restricted answers in RUSSIAN.`;

    let systemContent = this.systemPrompt + "\n\n" + roleInfo;
    if (wikiContext) {
      systemContent += `\n\n## Wiki Knowledge (use as context):\n${wikiContext}`;
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
      ...history.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
    ];

    const userContent = context
      ? `${context}\n\nKullanici: ${userMessage}`
      : userMessage;

    if (images.length > 0) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: userContent },
          ...images.map((img) => ({ type: "image_url" as const, image_url: { url: img.url } })),
        ],
      });
    } else {
      messages.push({ role: "user", content: userContent });
    }

    try {
      const completion = await this.withRetry(() =>
        this.client.chat.completions.create({
          model: this.model,
          messages,
        }),
      );
      return completion.choices[0]?.message?.content || null;
    } catch (err) {
      logger.error({ err, model: this.model }, "LLM chat failed");
      return null;
    }
  }

  async translateToRussian(details: string[]): Promise<string[]> {
    const needsTranslation = details.filter((d) =>
      /[a-zçğıöşüÇĞİÖŞÜ]/.test(d) && !/[а-яА-ЯёЁ]/.test(d),
    );
    if (needsTranslation.length === 0) return details;

    try {
      const numbered = details.map((d, i) => `${i + 1}. ${d}`).join("\n");
      const completion = await this.withRetry(() =>
        this.client.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: "system",
              content: "Переведи следующий список мебельной терминологии на русский. Сохрани нумерацию. karkas→каркас, boya→покраска, dikiş→шитьё, döşeme→обивка, kumaş→ткань.",
            },
            { role: "user", content: numbered },
          ],
        }),
      );

      const response = completion.choices[0]?.message?.content || "";
      const lines = response.split("\n").filter((l) => l.trim());
      const result = [...details];

      for (const line of lines) {
        const match = line.match(/^(\d+)\.\s*(.+)$/);
        if (match) {
          const idx = parseInt(match[1]) - 1;
          if (idx >= 0 && idx < result.length) {
            result[idx] = match[2].trim();
          }
        }
      }
      return result;
    } catch (err) {
      logger.warn({ err }, "Translation failed");
      return details;
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelay = 1000): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        if (attempt === retries) throw err;
        const delay = baseDelay * Math.pow(2, attempt);
        logger.warn({ attempt, delay, err: err?.message }, "LLM retry");
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new Error("Unreachable");
  }
}
