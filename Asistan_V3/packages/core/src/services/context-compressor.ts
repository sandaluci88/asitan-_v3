/**
 * ContextCompressor — LLM-powered conversation compression
 *
 * Hermes Agent'tan ilham: context window yönetimi
 * Token limiti yaklaşınca eski mesajları LLM ile özetler.
 * Son N mesaj her zaman korunur (compression window).
 *
 * Supabase (PostgreSQL) ile çalışır — compressed mesajlar
 * is_compressed=true olarak işaretlenir.
 */

import { LlmService } from "./llm.service.js";
import { logger } from "../utils/logger.js";

export interface CompressibleMessage {
  id: string;
  role: "user" | "assistant" | "system" | "summary";
  content: string;
  tokenCount: number;
  isCompressed: boolean;
  createdAt: string;
}

export interface CompressionResult {
  summaryContent: string;
  summaryTokenCount: number;
  compressedMessageIds: string[];
  keptMessageCount: number;
}

/** Token eşik: 6000 token üstünde compression tetiklenir */
const COMPRESSION_THRESHOLD_TOKENS = 6000;

/** Son N mesaj compression'dan muaf */
const KEEP_RECENT_COUNT = 6;

/** Türkçe: ~1.5 token/char, Rusça: ~2 token/char ortalama */
const TOKENS_PER_CHAR = 1.7;

export class ContextCompressor {
  private llm: LlmService;

  constructor() {
    this.llm = LlmService.getInstance();
  }

  /**
   * Token sayısını tahmin et (kabul edilebilir yaklaşım)
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / TOKENS_PER_CHAR);
  }

  /**
   * Compression gerekli mi kontrol et
   */
  needsCompression(totalTokens: number): boolean {
    return totalTokens > COMPRESSION_THRESHOLD_TOKENS;
  }

  /**
   * Eski mesajları LLM ile özetle
   *
   * Akış:
   * 1. Mesajları kronolojik sırala
   * 2. Son KEEP_RECENT_COUNT mesajı ayır
   * 3. Kalan eski mesajları LLM'e gönder → özet al
   * 4. Özet mesajını döndür (DB'ye kayıt caller'da yapılır)
   */
  async compress(
    messages: CompressibleMessage[],
  ): Promise<CompressionResult | null> {
    // Zaten yeterince mesaj yoksa compression yapma
    if (messages.length <= KEEP_RECENT_COUNT) {
      return null;
    }

    const toCompress = messages.slice(0, -KEEP_RECENT_COUNT);
    const totalTokensToCompress = toCompress.reduce(
      (sum, m) => sum + m.tokenCount,
      0,
    );

    // Sıkıştırılacak mesaj çok azsa atla
    if (totalTokensToCompress < 500) {
      return null;
    }

    // Önceki compressed (summary) mesajları dahil et
    const previousSummaries = toCompress.filter((m) => m.isCompressed);
    const rawMessages = toCompress.filter((m) => !m.isCompressed);

    const conversationText = this.formatForCompression(
      rawMessages,
      previousSummaries,
    );

    try {
      const summaryContent = await this.generateSummary(conversationText);

      if (!summaryContent) {
        logger.warn("ContextCompressor: LLM returned empty summary");
        return null;
      }

      const summaryTokenCount = this.estimateTokens(summaryContent);
      const result: CompressionResult = {
        summaryContent,
        summaryTokenCount,
        compressedMessageIds: toCompress.map((m) => m.id),
        keptMessageCount: KEEP_RECENT_COUNT,
      };

      logger.info(
        {
          compressedCount: toCompress.length,
          savedTokens: totalTokensToCompress - summaryTokenCount,
          keptCount: KEEP_RECENT_COUNT,
        },
        "ContextCompressor: Compression completed",
      );

      return result;
    } catch (err) {
      logger.warn({ err }, "ContextCompressor: LLM summary failed");
      return null;
    }
  }

  /**
   * Mesajları compression için formatla
   */
  private formatForCompression(
    rawMessages: CompressibleMessage[],
    previousSummaries: CompressibleMessage[],
  ): string {
    const parts: string[] = [];

    // Önceki özet varsa başa ekle
    if (previousSummaries.length > 0) {
      parts.push("=== ÖNCEKİ ÖZET ===");
      for (const s of previousSummaries) {
        parts.push(s.content);
      }
      parts.push("=== ÖNCEKİ ÖZET SONU ===\n");
    }

    // Ham mesajları ekle
    for (const msg of rawMessages) {
      const roleLabel =
        msg.role === "user" ? "Kullanıcı" : msg.role === "assistant" ? "Ayça" : "Sistem";
      parts.push(`[${roleLabel}]: ${msg.content}`);
    }

    return parts.join("\n");
  }

  /**
   * LLM ile özet oluştur
   */
  private async generateSummary(conversationText: string): Promise<string | null> {
    const metaPrompt = `Aşağıdaki fabrika asistanı (Ayça) ve kullanıcı arasındaki konuşmayı özetle.

KRİTİK KURALLAR:
- Sipariş numaraları, müşteri adları, ürün detayları KESİNLİKLE korunacak
- Alınan kararlar, aksiyon maddeleri korunacak
- Departman atamaları, üretim durumu korunacak
- Selamlaşma, sohbet, tekrarlar atlanacak
- Özgün dilde (Türkçe veya Rusça) özet yazılacak
- Kısa ve öz ol (maksimum 500 kelime)

Konuşma:
${conversationText}

ÖZET:`;

    return await this.llm.chat({
      userMessage: metaPrompt,
      context: "Conversation compression mode — summarize the above conversation",
    });
  }

  /**
   * Statik yardımcılar
   */
  static get COMPRESSION_THRESHOLD(): number {
    return COMPRESSION_THRESHOLD_TOKENS;
  }

  static get KEEP_RECENT_COUNT(): number {
    return KEEP_RECENT_COUNT;
  }
}
