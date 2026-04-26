/**
 * Test Suite 5: Excel Order Parsing + Connection Tests
 * Uses real V2 Excel sample + Supabase + LLM connectivity
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(".env") });

// ─── Excel Parsing ─────────────────────────────────────────────

describe("Excel File Reading", () => {
  const excelPath = path.resolve("tests/test-siparis.xlsx");

  it("sample Excel file exists", () => {
    expect(fs.existsSync(excelPath)).toBe(true);
  });

  it("file is not empty", () => {
    const stats = fs.statSync(excelPath);
    expect(stats.size).toBeGreaterThan(1000);
  });

  it("can read Excel with xlsx library", async () => {
    const XLSX = await import("xlsx");
    const buffer = fs.readFileSync(excelPath);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    expect(workbook.SheetNames.length).toBeGreaterThan(0);

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    expect(rows.length).toBeGreaterThan(0);

    // Check it has expected columns (siparis formu structure)
    const firstRow = rows[0] as Record<string, unknown>;
    const keys = Object.keys(firstRow);
    expect(keys.length).toBeGreaterThan(0);
  });
});

// ─── Supabase Connection ───────────────────────────────────────

describe("Supabase Connection", () => {
  it("has valid credentials", () => {
    expect(process.env.SUPABASE_URL).toContain("supabase.co");
    expect(process.env.SUPABASE_KEY).toBeTruthy();
  });

  it("can query staff table", async () => {
    const { SupabaseService } = await import("../packages/core/src/services/supabase.service.js");
    const db = SupabaseService.getInstance();
    const staff = await db.getAllStaff();
    expect(Array.isArray(staff)).toBe(true);
  }, 15_000);

  it("can query active orders", async () => {
    const { SupabaseService } = await import("../packages/core/src/services/supabase.service.js");
    const db = SupabaseService.getInstance();
    const orders = await db.getActiveOrders();
    expect(Array.isArray(orders)).toBe(true);
  }, 15_000);
});

// ─── OpenRouter LLM ────────────────────────────────────────────

describe("OpenRouter LLM", () => {
  it("API key starts with sk-or-v1", () => {
    expect(process.env.OPENROUTER_API_KEY).toMatch(/^sk-or-v1-/);
  });

  it("can generate Turkish response for boss", async () => {
    const { LlmService } = await import("../packages/core/src/services/llm.service.js");
    const llm = LlmService.getInstance();
    const response = await llm.chat({
      userMessage: "Sandaluci'de bugün kaç aktif sipariş var? (Bilmiyorsan 'bilmiyorum' yaz)",
      role: "boss",
    });
    expect(response).toBeTruthy();
    expect(response!.length).toBeGreaterThan(10);
  }, 30_000);

  it("can generate Russian response for staff", async () => {
    const { LlmService } = await import("../packages/core/src/services/llm.service.js");
    const llm = LlmService.getInstance();
    const response = await llm.chat({
      userMessage: "Какой статус моего заказа?",
      role: "staff",
    });
    expect(response).toBeTruthy();
  }, 30_000);

  it("rejects non-work questions from staff (work-only guard)", async () => {
    const { LlmService } = await import("../packages/core/src/services/llm.service.js");
    const llm = LlmService.getInstance();
    const response = await llm.chat({
      userMessage: "Как погода сегодня?",
      role: "staff",
    });
    expect(response).toBeTruthy();
    // Response should indicate work-only (in Russian)
    const hasWorkRefusal = /работ|работ|заказ|только/i.test(response!);
    expect(hasWorkRefusal).toBe(true);
  }, 30_000);

  it("can translate furniture terms to Russian", async () => {
    const { LlmService } = await import("../packages/core/src/services/llm.service.js");
    const llm = LlmService.getInstance();
    const result = await llm.translateToRussian([
      "Karkas Üretimi",
      "Dikişhane",
      "Döşemehane",
      "Boyahane",
    ]);
    expect(result.length).toBe(4);
    const cyrillicCount = result.filter((r) => /[а-яА-ЯёЁ]/.test(r)).length;
    expect(cyrillicCount).toBeGreaterThanOrEqual(2);
  }, 30_000);
});

// ─── Staff Data ────────────────────────────────────────────────

describe("Staff Data Integrity", () => {
  it("staff.json has Marina", () => {
    const staff = JSON.parse(fs.readFileSync("data/staff.json", "utf-8"));
    const marina = staff.find((s: any) => s.isMarina);
    expect(marina).toBeTruthy();
    expect(marina.name).toBe("Marina");
    expect(marina.role).toBe("coordinator");
  });

  it("all staff (except boss) have Russian language", () => {
    const staff = JSON.parse(fs.readFileSync("data/staff.json", "utf-8"));
    const workers = staff.filter((s: any) => s.role !== "boss");
    for (const s of workers) {
      expect(s.language).toBe("ru");
    }
  });

  it("has staff for key departments", () => {
    const staff = JSON.parse(fs.readFileSync("data/staff.json", "utf-8"));
    const departments = staff.map((s: any) => s.department);
    expect(departments).toContain("Karkas Uretimi");
    expect(departments).toContain("Boyahane");
    expect(departments).toContain("Dosemehane");
    expect(departments).toContain("Dikishane");
  });
});
