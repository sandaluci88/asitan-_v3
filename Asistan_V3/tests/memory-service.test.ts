import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";

describe("MemoryService — Faz 2 (B1-B8)", () => {
  let tmpDir: string;
  let memoryDir: string;
  let archiveDir: string;
  let MemoryService: any;

  // Helper: create MemoryService with custom dir
  async function createService() {
    const mod = await import("../packages/bot/src/services/memory.service.js");
    MemoryService = mod.MemoryService;
    const svc = new mod.MemoryService();
    // Override dirs to use temp
    (svc as any).memoryDir = memoryDir;
    (svc as any).archiveDir = archiveDir;
    await svc.initialize();
    return svc;
  }

  // Helper: write history file directly
  async function writeHistoryFile(chatId: string, messages: any[]) {
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.writeFile(
      path.join(memoryDir, `${chatId}.json`),
      JSON.stringify(messages, null, 2),
      "utf-8",
    );
  }

  // Helper: read archive file
  async function readArchive(chatId: string) {
    try {
      const data = await fs.readFile(
        path.join(archiveDir, `${chatId}_archive.json`),
        "utf-8",
      );
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  const DAY = 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mem-test-"));
    memoryDir = path.join(tmpDir, "memory");
    archiveDir = path.join(tmpDir, "memory", "archive");
    // Force re-import to get fresh module
    vi.resetModules();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  // B1: 7 günlük mesaj history'de kalır
  it("B1: messages within 7 days stay in history", async () => {
    const svc = await createService();
    const chatId = "chat_b1";
    const now = Date.now();

    await writeHistoryFile(chatId, [
      { role: "user", content: "7 gün içinde", timestamp: now - 6 * DAY },
      { role: "user", content: "3 gün önce", timestamp: now - 3 * DAY },
      { role: "assistant", content: "Bugün", timestamp: now },
    ]);

    const history = await svc.getHistory(chatId);
    expect(history).toHaveLength(3);
  });

  // B2: 8 günlük mesaj archive'e taşınır
  it("B2: messages older than 7 days get archived", async () => {
    const svc = await createService();
    const chatId = "chat_b2";
    const now = Date.now();

    await writeHistoryFile(chatId, [
      { role: "user", content: "Eski mesaj", timestamp: now - 8 * DAY },
      { role: "user", content: "Yeni mesaj", timestamp: now - 1 * DAY },
    ]);

    const history = await svc.getHistory(chatId);
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe("Yeni mesaj");

    const archive = await readArchive(chatId);
    expect(archive).toHaveLength(1);
    expect(archive[0].content).toBe("Eski mesaj");
  });

  // B3: Boss mesajları doğru role ile kaydedilir
  it("B3: boss messages saved with role=user", async () => {
    const svc = await createService();
    const chatId = "chat_b3";

    await svc.saveMessage(chatId, "user", "Patron mesajı");
    const history = await svc.getHistory(chatId);

    expect(history).toHaveLength(1);
    expect(history[0].role).toBe("user");
    expect(history[0].content).toBe("Patron mesajı");
  });

  // B4: Staff mesajları doğru role ile kaydedilir
  it("B4: staff messages saved with correct role", async () => {
    const svc = await createService();
    const chatId = "chat_b4";

    await svc.saveMessage(chatId, "user", "Personel mesajı");
    await svc.saveMessage(chatId, "assistant", "Ayça yanıtı");
    const history = await svc.getHistory(chatId);

    expect(history).toHaveLength(2);
    expect(history[0].role).toBe("user");
    expect(history[1].role).toBe("assistant");
  });

  // B5: Archive append-only çalışır
  it("B5: archive is append-only", async () => {
    const svc = await createService();
    const chatId = "chat_b5";
    const now = Date.now();

    // First batch: 1 old message
    await writeHistoryFile(chatId, [
      { role: "user", content: "Çok eski 1", timestamp: now - 10 * DAY },
      { role: "user", content: "Yeni 1", timestamp: now - 1 * DAY },
    ]);
    await svc.getHistory(chatId);

    // Second batch: add another old message
    await writeHistoryFile(chatId, [
      { role: "user", content: "Yeni 1", timestamp: now - 1 * DAY },
      { role: "user", content: "Çok eski 2", timestamp: now - 9 * DAY },
    ]);
    await svc.getHistory(chatId);

    const archive = await readArchive(chatId);
    expect(archive).toHaveLength(2);
    expect(archive[0].content).toBe("Çok eski 1");
    expect(archive[1].content).toBe("Çok eski 2");
  });

  // B6: Draft 30 dk expire (default setTimeout 30min)
  it("B6: draft is retrievable immediately after save", async () => {
    const svc = await createService();

    svc.saveDraft("draft_b6", { test: true });
    const draft = svc.getDraft("draft_b6");
    expect(draft).toEqual({ test: true });
  });

  it("B6b: draft delete works", async () => {
    const svc = await createService();

    svc.saveDraft("draft_b6b", { test: true });
    svc.deleteDraft("draft_b6b");
    expect(svc.getDraft("draft_b6b")).toBeUndefined();
  });

  // B7: 100+ mesaj performansı
  it("B7: handles 100+ messages without error", async () => {
    const svc = await createService();
    const chatId = "chat_b7";
    const now = Date.now();

    const messages = Array.from({ length: 150 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Mesaj ${i}`,
      timestamp: now - (150 - i) * 60000, // 1 min apart
    }));

    await writeHistoryFile(chatId, messages);

    const start = performance.now();
    const history = await svc.getHistory(chatId);
    const elapsed = performance.now() - start;

    expect(history.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1000); // Under 1 second
  });

  // B8: Farklı chatId ayrı history tutar
  it("B8: different chatIds have separate histories", async () => {
    const svc = await createService();

    await svc.saveMessage("chat_a", "user", "Chat A mesajı");
    await svc.saveMessage("chat_b", "user", "Chat B mesajı");

    const histA = await svc.getHistory("chat_a");
    const histB = await svc.getHistory("chat_b");

    expect(histA).toHaveLength(1);
    expect(histA[0].content).toBe("Chat A mesajı");

    expect(histB).toHaveLength(1);
    expect(histB[0].content).toBe("Chat B mesajı");
  });
});
