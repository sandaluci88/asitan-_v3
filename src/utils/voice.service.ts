import fs from "fs";
import path from "path";
import os from "os";
import { Context } from "grammy";
import Groq from "groq-sdk";
import * as dotenv from "dotenv";
import { logger } from "./logger";

dotenv.config();

export class VoiceService {
  private groq: Groq | null = null;

  constructor() {
    // dotenv.config() zaten index.ts'de çağrılıyor ama garantiye alalım
    require('dotenv').config();
    const groqKey = process.env.GROQ_API_KEY?.trim();
    
    if (groqKey) {
      logger.info({ keyStart: groqKey.substring(0, 8) + "..." }, "🔑 Groq API Key yüklendi.");
      this.groq = new Groq({ apiKey: groqKey });
    } else {
      logger.error("❌ GROQ_API_KEY bulunamadı!");
    }
  }

  public async transcribeVoiceMessage(
    ctx: Context,
    fileId: string,
    lang: string = "auto",
  ): Promise<string | null> {
    if (!this.groq) {
      logger.error("❌ GROQ_API_KEY eksik! Sesli mesaj işlenemez.");
      return null;
    }

    let tempFilePath: string | null = null;
    try {
      logger.info({ fileId }, "🎙️ Sesli mesaj indirme başladı (Grammy Native)...");
      
      const file = await ctx.api.getFile(fileId);
      if (!file.file_path) throw new Error("Telegram dosya yolu bulunamadı");

      // Geçici dosya yolu
      const tempFileName = `voice_${Date.now()}_${fileId}.ogg`;
      tempFilePath = path.join(os.tmpdir(), tempFileName);

      // Telegram'dan dosyayı indir (Native HTTPS)
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      
      const downloadFile = (url: string, dest: string) => {
        return new Promise((resolve, reject) => {
          const fileStream = fs.createWriteStream(dest);
          const https = require('https');
          https.get(url, (res: any) => {
            if (res.statusCode !== 200) {
              reject(new Error(`Download failed: ${res.statusCode}`));
              return;
            }
            res.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close();
              resolve(true);
            });
          }).on('error', (err: any) => {
            fs.unlink(dest, () => {});
            reject(err);
          });
        });
      };

      await downloadFile(fileUrl, tempFilePath);
      
      const buffer = fs.readFileSync(tempFilePath);
      logger.info({ tempFilePath, size: buffer.length }, "📁 Geçici ses dosyası hazır. Whisper'a gönderiliyor...");

      // Groq SDK kullanarak Whisper V3 ile çeviri
      const transcription = await this.groq.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: "whisper-large-v3",
        language: lang === "auto" ? undefined : lang,
        response_format: "json",
      });

      if (transcription.text) {
        logger.info({ text: transcription.text.substring(0, 50) + "..." }, "✅ Transcription başarılı.");
        return transcription.text;
      }

      logger.warn("⚠️ Transcription metin döndürmedi.");
      return null;
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, "❌ Sesli mesaj çeviri hatası");
      return null;
    } finally {
      // Temizlik
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (e) {
          logger.warn({ error: e }, "Geçici dosya silinemedi");
        }
      }
    }
  }
}
