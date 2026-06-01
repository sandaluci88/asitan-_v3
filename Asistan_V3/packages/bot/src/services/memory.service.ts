/**
 * MemoryService — Conversation memory with Supabase primary + file fallback
 *
 * V3 Upgrade (Hermes Agent'tan ilham):
 * - Supabase conversation_memory tablosu primary storage
 * - File-based (data/memory/) fallback for dev/offline mode
 * - Automatic context compression when token threshold exceeded
 * - Same interface as before (backward compatible)
 */

import fs from "fs/promises";
import path from "path";
import {
  ConversationMemoryService,
  logger,
} from "@sandaluci/core";
import type { ConversationMessage } from "@sandaluci/core";

export interface MemoryMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export class MemoryService {
  private memoryDir: string;
  private archiveDir: string;
  private maxAgeMs: number; // 7 days
  private drafts: Map<string, any> = new Map();

  // Supabase-backed service
  private conversationMemory: ConversationMemoryService | null = null;

  constructor() {
    this.memoryDir = path.join(process.cwd(), "data", "memory");
    this.archiveDir = path.join(this.memoryDir, "archive");
    this.maxAgeMs = 7 * 24 * 60 * 60 * 1000;

    // Supabase service init (try/catch — env eksik olabilir)
    try {
      this.conversationMemory = ConversationMemoryService.getInstance();
    } catch {
      logger.warn(
        "MemoryService: Supabase ConversationMemory unavailable, using file fallback",
      );
    }
  }

  async initialize() {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
      await fs.mkdir(this.archiveDir, { recursive: true });
    } catch (error) {
      logger.warn({ error }, "Failed to initialize memory directories");
    }

    logger.info(
      { supabase: !!this.conversationMemory },
      "MemoryService initialized",
    );
  }

  // ────────────────────────────────────────────────────────
  // Core: Save Message
  // ────────────────────────────────────────────────────────

  /**
   * Mesajı kaydet — Supabase primary, file fallback
   */
  async saveMessage(
    chatId: string | number,
    role: "user" | "assistant",
    content: string,
  ): Promise<void> {
    const chatIdStr = String(chatId);

    // Supabise primary
    if (this.conversationMemory) {
      const saved = await this.conversationMemory.saveMessage(
        chatIdStr,
        role,
        content,
      );

      if (saved) {
        // Compression kontrolü (async, await etmeye gerek yok)
        this.conversationMemory
          .compressOldMessages(chatIdStr)
          .catch((err) =>
            logger.warn({ err, chatId: chatIdStr }, "Compression trigger failed"),
          );
        return;
      }
    }

    // File fallback
    await this.saveMessageToFile(chatIdStr, role, content);
  }

  // ────────────────────────────────────────────────────────
  // Core: Get History
  // ────────────────────────────────────────────────────────

  /**
   * Sohbet geçmişini al — Supabase primary, file fallback
   */
  async getHistory(chatId: string | number): Promise<MemoryMessage[]> {
    const chatIdStr = String(chatId);

    // Supabase primary
    if (this.conversationMemory) {
      const messages = await this.conversationMemory.getHistory(chatIdStr);

      if (messages.length > 0) {
        return this.conversationToMemory(messages);
      }

      // Supabase boşsa dosyadan okumayı dene (migration senaryosu)
      const fileMessages = await this.getHistoryFromFile(chatIdStr);
      if (fileMessages.length > 0) {
        // Dosyadaki mesajları Supabase'e migrate et (arka planda)
        this.migrateFileToSupabase(chatIdStr, fileMessages).catch(() => {});
        return fileMessages;
      }

      return [];
    }

    // File fallback
    return this.getHistoryFromFile(chatIdStr);
  }

  // ────────────────────────────────────────────────────────
  // Drafts (in-memory, değişmedi)
  // ────────────────────────────────────────────────────────

  saveDraft(id: string, data: any) {
    this.drafts.set(id, data);
    setTimeout(() => this.drafts.delete(id), 30 * 60 * 1000);
  }

  getDraft(id: string) {
    return this.drafts.get(id);
  }

  deleteDraft(id: string) {
    this.drafts.delete(id);
  }

  // ────────────────────────────────────────────────────────
  // Stats (yeni)
  // ────────────────────────────────────────────────────────

  /**
   * Token sayısını al
   */
  async getTokenCount(chatId: string | number): Promise<number> {
    if (this.conversationMemory) {
      return this.conversationMemory.getTokenCount(String(chatId));
    }
    return 0;
  }

  /**
   * Mesaj sayısını al
   */
  async getMessageCount(chatId: string | number): Promise<number> {
    if (this.conversationMemory) {
      return this.conversationMemory.getMessageCount(String(chatId));
    }
    return 0;
  }

  // ────────────────────────────────────────────────────────
  // Internal: File-based operations (fallback)
  // ────────────────────────────────────────────────────────

  private async ensureDirs() {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
      await fs.mkdir(this.archiveDir, { recursive: true });
    } catch {
      // Ignored if already exists
    }
  }

  private getFilePath(chatId: string): string {
    return path.join(this.memoryDir, `${chatId}.json`);
  }

  private getArchiveFilePath(chatId: string): string {
    return path.join(this.archiveDir, `${chatId}_archive.json`);
  }

  private async saveMessageToFile(
    chatId: string,
    role: "user" | "assistant",
    content: string,
  ): Promise<void> {
    const messages = await this.getHistoryFromFile(chatId);
    messages.push({ role, content, timestamp: Date.now() });

    try {
      await this.ensureDirs();
      await fs.writeFile(
        this.getFilePath(chatId),
        JSON.stringify(messages, null, 2),
        "utf-8",
      );
    } catch (error) {
      logger.warn({ error, chatId }, "Failed to save message to file");
    }
  }

  private async getHistoryFromFile(chatId: string): Promise<MemoryMessage[]> {
    const filePath = this.getFilePath(chatId);
    try {
      const data = await fs.readFile(filePath, "utf-8");
      const allMessages: MemoryMessage[] = JSON.parse(data);

      const now = Date.now();
      const activeMessages = allMessages.filter(
        (msg) => now - msg.timestamp <= this.maxAgeMs,
      );

      const archivedMessages = allMessages.filter(
        (msg) => now - msg.timestamp > this.maxAgeMs,
      );

      if (archivedMessages.length > 0) {
        await this.archiveMessages(chatId, archivedMessages);
        await this.ensureDirs();
        await fs.writeFile(
          filePath,
          JSON.stringify(activeMessages, null, 2),
          "utf-8",
        );
      }

      return activeMessages;
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        logger.warn({ error, chatId }, "Failed to read history from file");
      }
      return [];
    }
  }

  private async archiveMessages(
    chatId: string,
    newArchivedMessages: MemoryMessage[],
  ) {
    if (newArchivedMessages.length === 0) return;

    const archivePath = this.getArchiveFilePath(chatId);
    let existingArchive: MemoryMessage[] = [];
    try {
      const data = await fs.readFile(archivePath, "utf-8");
      existingArchive = JSON.parse(data);
    } catch {
      // It's okay if archive doesn't exist yet
    }

    const combinedArchive = [...existingArchive, ...newArchivedMessages];

    try {
      await this.ensureDirs();
      await fs.writeFile(
        archivePath,
        JSON.stringify(combinedArchive, null, 2),
        "utf-8",
      );
    } catch (error) {
      logger.warn({ error, chatId }, "Failed to write to archive file");
    }
  }

  /**
   * Dosyadaki mesajları Supabase'e migrate et
   */
  private async migrateFileToSupabase(
    chatId: string,
    messages: MemoryMessage[],
  ): Promise<void> {
    if (!this.conversationMemory || messages.length === 0) return;

    logger.info(
      { chatId, count: messages.length },
      "MemoryService: Migrating file messages to Supabase",
    );

    for (const msg of messages) {
      await this.conversationMemory.saveMessage(chatId, msg.role, msg.content);
    }

    logger.info(
      { chatId, migrated: messages.length },
      "MemoryService: Migration completed",
    );
  }

  /**
   * ConversationMessage[] → MemoryMessage[] dönüşümü
   */
  private conversationToMemory(
    messages: ConversationMessage[],
  ): MemoryMessage[] {
    return messages.map((m) => ({
      role: m.role === "summary" ? "assistant" : (m.role as "user" | "assistant"),
      content: m.content,
      timestamp: new Date(m.createdAt).getTime(),
    }));
  }
}

export const memoryService = new MemoryService();
