import fs from "fs";
import path from "path";
import os from "os";
import { Context } from "grammy";
import OpenAI from "openai";
import { logger } from "@sandaluci/core";

export class VoiceService {
  private openai: OpenAI | null = null;
  private readonly MODEL = "google/gemini-2.0-flash-001"; // OpenRouter'da ses işleme için en hızlı ve stabil model

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();

    if (apiKey) {
      logger.info(
        { keyStart: apiKey.substring(0, 8) + "..." },
        "🔑 OpenRouter API (Voice: Gemini) yüklendi.",
      );
      this.openai = new OpenAI({
        apiKey: apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        timeout: 60000,
      });
    } else {
      logger.error("❌ OPENROUTER_API_KEY bulunamadı!");
    }
  }

  public async transcribeVoiceMessage(
    ctx: Context,
    fileId: string,
    _lang: string = "auto",
  ): Promise<string | null> {
    if (!this.openai) {
      logger.error("❌ OpenRouter API eksik! Sesli mesaj işlenemez.");
      return null;
    }

    let tempFilePath: string | null = null;
    try {
      logger.info({ fileId }, "🎙️ Sesli mesaj indirme başladı...");

      const file = await ctx.api.getFile(fileId);
      if (!file.file_path) throw new Error("Telegram dosya yolu bulunamadı");

      // Geçici dosya yolu
      const tempFileName = `voice_${Date.now()}_${fileId}.ogg`;
      tempFilePath = path.join(os.tmpdir(), tempFileName);

      // Telegram'dan dosyayı indir
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

      const https = require("https");
      await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(tempFilePath!);
        https
          .get(fileUrl, (res: any) => {
            if (res.statusCode !== 200)
              return reject(new Error(`Download failed: ${res.statusCode}`));
            res.pipe(fileStream);
            fileStream.on("finish", () => {
              fileStream.close();
              resolve(true);
            });
          })
          .on("error", (err: any) => {
            if (fs.existsSync(tempFilePath!)) fs.unlinkSync(tempFilePath!);
            reject(err);
          });
      });

      // Dosyayı oku ve Base64'e çevir (OpenRouter multimodal için bu formatı tercih eder)
      const audioBuffer = fs.readFileSync(tempFilePath);
      const base64Audio = audioBuffer.toString("base64");

      logger.info(
        { size: audioBuffer.length },
        "📁 Ses dosyası Base64 formatına çevrildi. OpenRouter'a (Gemini) gönderiliyor...",
      );

      // Chat Completions API üzerinden sesli mesajı metne çevir/analiz et
      const response = await this.openai.chat.completions.create({
        model: this.MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Lütfen bu sesli mesajı aynen kelimesi kelimesine metne dök. Sorumluluk al ve sadece konuşulanları yaz.",
              },
              {
                type: "image_url", // OpenRouter multimodal standartlarında genellikle bu yapı kullanılır veya input_audio
                image_url: {
                  url: `data:audio/ogg;base64,${base64Audio}`,
                },
              },
            ],
          },
        ],
      } as any);

      const result = response.choices[0]?.message?.content;
      if (result) {
        logger.info(
          { text: result.substring(0, 50) + "..." },
          "✅ Transcription başarılı (OpenRouter/Gemini).",
        );
        return result;
      }

      logger.warn("⚠️ OpenRouter'dan metin dönmedi.");
      return null;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error?.message || error.message;
      logger.error(
        {
          error: errorMessage,
          status: error.status,
          fileId,
        },
        "❌ Sesli mesaj çeviri hatası (OpenRouter/Gemini)",
      );
      return null;
    } finally {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (_) {}
      }
    }
  }
}
