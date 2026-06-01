/**
 * ConversationMemoryService — Supabase-backed persistent conversation memory
 *
 * Hermes Agent'tan ilham: Session Storage (SQLite → Supabase uyarlaması)
 * - Tüm sohbet geçmişi Supabase conversation_memory tablosunda saklanır
 * - Context compression destekli
 * - Docker redeploy'da bile veri kaybı yok
 * - PostgreSQL FTS + ileride pgvector semantic search
 */

import { SupabaseService } from "./supabase.service.js";
import {
  ContextCompressor,
  type CompressibleMessage,
} from "./context-compressor.js";
import { logger } from "../utils/logger.js";

export interface ConversationMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system" | "summary";
  content: string;
  summary?: string | null;
  tokenCount: number;
  isCompressed: boolean;
  parentId?: string | null;
  createdAt: string;
}

export class ConversationMemoryService {
  private static instance: ConversationMemoryService;
  private db: SupabaseService;
  private compressor: ContextCompressor;

  private constructor() {
    this.db = SupabaseService.getInstance();
    this.compressor = new ContextCompressor();
  }

  public static getInstance(): ConversationMemoryService {
    if (!ConversationMemoryService.instance) {
      ConversationMemoryService.instance = new ConversationMemoryService();
    }
    return ConversationMemoryService.instance;
  }

  // ────────────────────────────────────────────────────────
  // Core CRUD
  // ────────────────────────────────────────────────────────

  /**
   * Mesajı Supabase'e kaydet
   */
  async saveMessage(
    chatId: string,
    role: "user" | "assistant" | "system",
    content: string,
  ): Promise<ConversationMessage | null> {
    const tokenCount = this.compressor.estimateTokens(content);

    try {
      const client = this.db.getClient();
      const { data, error } = await client
        .from("conversation_memory")
        .insert({
          chat_id: String(chatId),
          role,
          content,
          token_count: tokenCount,
          is_compressed: false,
        })
        .select()
        .single();

      if (error) throw error;

      logger.debug(
        { chatId, role, tokenCount },
        "ConversationMemory: Message saved",
      );

      return data
        ? this.mapRow(data)
        : null;
    } catch (err) {
      logger.warn({ err, chatId, role }, "ConversationMemory: Save failed");
      return null;
    }
  }

  /**
   * Son N günün mesajlarını getir (compression dahil)
   * Varsayılan: son 3 gün
   */
  async getHistory(
    chatId: string,
    days = 3,
  ): Promise<ConversationMessage[]> {
    try {
      const client = this.db.getClient();
      const since = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data, error } = await client
        .from("conversation_memory")
        .select("*")
        .eq("chat_id", String(chatId))
        .gte("created_at", since)
        .order("created_at", { ascending: true });

      if (error) throw error;

      return (data || []).map((row: any) => this.mapRow(row));
    } catch (err) {
      logger.warn(
        { err, chatId },
        "ConversationMemory: Get history failed",
      );
      return [];
    }
  }

  /**
   * Son N mesajı getir (LLM context window için)
   */
  async getRecentMessages(
    chatId: string,
    count = 10,
  ): Promise<ConversationMessage[]> {
    try {
      const client = this.db.getClient();

      const { data, error } = await client
        .from("conversation_memory")
        .select("*")
        .eq("chat_id", String(chatId))
        .order("created_at", { ascending: false })
        .limit(count);

      if (error) throw error;

      // Kronolojik sıraya çevir
      return (data || [])
        .map((row: any) => this.mapRow(row))
        .reverse();
    } catch (err) {
      logger.warn(
        { err, chatId },
        "ConversationMemory: Get recent failed",
      );
      return [];
    }
  }

  // ────────────────────────────────────────────────────────
  // Compression
  // ────────────────────────────────────────────────────────

  /**
   * Eski mesajları compress et (gerekirse)
   * Message handler'da her saveMessage sonrası çağrılır
   */
  async compressOldMessages(chatId: string): Promise<boolean> {
    try {
      const stats = await this.getTokenCount(chatId);

      if (!this.compressor.needsCompression(stats)) {
        return false;
      }

      logger.info(
        { chatId, totalTokens: stats },
        "ConversationMemory: Starting compression",
      );

      // Tüm mesajları al (compression için)
      const allMessages = await this.getAllMessages(chatId);

      if (allMessages.length <= ContextCompressor.KEEP_RECENT_COUNT) {
        return false;
      }

      const compressibleMessages: CompressibleMessage[] = allMessages.map(
        (m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          tokenCount: m.tokenCount,
          isCompressed: m.isCompressed,
          createdAt: m.createdAt,
        }),
      );

      const result = await this.compressor.compress(compressibleMessages);

      if (!result) {
        return false;
      }

      // Summary mesajını kaydet
      const client = this.db.getClient();
      const { data: summaryRow, error: insertError } = await client
        .from("conversation_memory")
        .insert({
          chat_id: String(chatId),
          role: "summary",
          content: result.summaryContent,
          summary: result.summaryContent,
          token_count: result.summaryTokenCount,
          is_compressed: true,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Compressed mesajları sil (yerine summary geldi)
      if (result.compressedMessageIds.length > 0 && summaryRow) {
        const { error: deleteError } = await client
          .from("conversation_memory")
          .delete()
          .in("id", result.compressedMessageIds);

        if (deleteError) {
          logger.warn(
            { err: deleteError, chatId },
            "ConversationMemory: Failed to delete compressed messages",
          );
        }
      }

      logger.info(
        {
          chatId,
          compressedCount: result.compressedMessageIds.length,
          savedTokens:
            allMessages.reduce((s, m) => s + m.tokenCount, 0) -
            result.summaryTokenCount,
        },
        "ConversationMemory: Compression completed",
      );

      return true;
    } catch (err) {
      logger.warn(
        { err, chatId },
        "ConversationMemory: Compression failed",
      );
      return false;
    }
  }

  // ────────────────────────────────────────────────────────
  // Search
  // ────────────────────────────────────────────────────────

  /**
   * İçerik bazlı mesaj arama
   */
  async searchByContent(
    chatId: string,
    query: string,
    limit = 10,
  ): Promise<ConversationMessage[]> {
    try {
      const client = this.db.getClient();

      const { data, error } = await client
        .from("conversation_memory")
        .select("*")
        .eq("chat_id", String(chatId))
        .ilike("content", `%${query}%`)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map((row: any) => this.mapRow(row));
    } catch (err) {
      logger.warn(
        { err, chatId, query },
        "ConversationMemory: Search failed",
      );
      return [];
    }
  }

  // ────────────────────────────────────────────────────────
  // Stats
  // ────────────────────────────────────────────────────────

  /**
   * Toplam token sayısını al
   */
  async getTokenCount(chatId: string): Promise<number> {
    try {
      const client = this.db.getClient();

      const { data, error } = await client
        .from("conversation_memory")
        .select("token_count")
        .eq("chat_id", String(chatId));

      if (error) throw error;

      return (data || []).reduce(
        (sum: number, row: any) => sum + (row.token_count || 0),
        0,
      );
    } catch {
      return 0;
    }
  }

  /**
   * Mesaj sayısını al
   */
  async getMessageCount(chatId: string): Promise<number> {
    try {
      const client = this.db.getClient();

      const { count, error } = await client
        .from("conversation_memory")
        .select("*", { count: "exact", head: true })
        .eq("chat_id", String(chatId));

      if (error) throw error;

      return count || 0;
    } catch {
      return 0;
    }
  }

  // ────────────────────────────────────────────────────────
  // Internal
  // ────────────────────────────────────────────────────────

  /**
   * Tüm mesajları al (compression için)
   */
  private async getAllMessages(
    chatId: string,
  ): Promise<ConversationMessage[]> {
    try {
      const client = this.db.getClient();

      const { data, error } = await client
        .from("conversation_memory")
        .select("*")
        .eq("chat_id", String(chatId))
        .order("created_at", { ascending: true });

      if (error) throw error;

      return (data || []).map((row: any) => this.mapRow(row));
    } catch (err) {
      logger.warn(
        { err, chatId },
        "ConversationMemory: GetAll failed",
      );
      return [];
    }
  }

  /**
   * DB row → ConversationMessage map
   */
  private mapRow(row: any): ConversationMessage {
    return {
      id: row.id,
      chatId: row.chat_id,
      role: row.role,
      content: row.content,
      summary: row.summary,
      tokenCount: row.token_count || 0,
      isCompressed: row.is_compressed || false,
      parentId: row.parent_id,
      createdAt: row.created_at,
    };
  }
}
