/**
 * Test Suite 4: Connections & Environment
 * Tests .env loading, Supabase connectivity, LLM connectivity
 */

import { describe, it, expect, beforeAll } from "vitest";

// ─── Environment ───────────────────────────────────────────────

describe("Environment Variables", () => {
  beforeAll(() => {
    // Load .env for testing
    require("dotenv").config({ path: ".env" });
  });

  it("has TELEGRAM_BOT_TOKEN", () => {
    expect(process.env.TELEGRAM_BOT_TOKEN).toBeTruthy();
    expect(process.env.TELEGRAM_BOT_TOKEN!.length).toBeGreaterThan(40);
  });

  it("has TELEGRAM_BOSS_ID as number", () => {
    const id = Number(process.env.TELEGRAM_BOSS_ID);
    expect(id).toBeGreaterThan(0);
    expect(Number.isNaN(id)).toBe(false);
  });

  it("has OPENROUTER_API_KEY", () => {
    expect(process.env.OPENROUTER_API_KEY).toBeTruthy();
    expect(process.env.OPENROUTER_API_KEY).toMatch(/^sk-or-v1-/);
  });

  it("has OPENROUTER_MODEL set", () => {
    expect(process.env.OPENROUTER_MODEL).toBeTruthy();
    expect(process.env.OPENROUTER_MODEL).toContain("gemini");
  });

  it("has SUPABASE_URL", () => {
    expect(process.env.SUPABASE_URL).toBeTruthy();
    expect(process.env.SUPABASE_URL).toContain("supabase.co");
  });

  it("has SUPABASE_KEY (JWT format)", () => {
    expect(process.env.SUPABASE_KEY).toBeTruthy();
    // JWT has 3 parts separated by dots
    const parts = process.env.SUPABASE_KEY!.split(".");
    expect(parts.length).toBe(3);
  });

  it("has SYSTEM_PROMPT_PATH", () => {
    expect(process.env.SYSTEM_PROMPT_PATH).toBeTruthy();
  });

  it("has PORT", () => {
    expect(process.env.PORT).toBeTruthy();
    const port = Number(process.env.PORT);
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });
});

// ─── Filesystem ────────────────────────────────────────────────

describe("Filesystem Readiness", () => {
  it("core_memory.md exists at SYSTEM_PROMPT_PATH", () => {
    require("dotenv").config({ path: ".env" });
    const fs = require("fs");
    const promptPath = process.env.SYSTEM_PROMPT_PATH!;
    expect(fs.existsSync(promptPath)).toBe(true);
  });

  it("core_memory.md contains Ayça persona", () => {
    require("dotenv").config({ path: ".env" });
    const fs = require("fs");
    const content = fs.readFileSync(process.env.SYSTEM_PROMPT_PATH!, "utf-8");
    expect(content).toContain("Ayça");
    expect(content).toContain("Barış Bey");
    expect(content).toContain("Marina");
    expect(content).toContain("ORDER GUARD");
  });

  it("staff.json exists and has valid structure", () => {
    const fs = require("fs");
    const path = require("path");
    const staffPath = path.resolve("data/staff.json");
    expect(fs.existsSync(staffPath)).toBe(true);

    const staff = JSON.parse(fs.readFileSync(staffPath, "utf-8"));
    expect(Array.isArray(staff)).toBe(true);
    expect(staff.length).toBeGreaterThan(0);

    for (const s of staff) {
      expect(s).toHaveProperty("telegramId");
      expect(s).toHaveProperty("name");
      expect(s).toHaveProperty("department");
    }
  });

  it("supabase_schema_v3.sql exists", () => {
    const fs = require("fs");
    const path = require("path");
    expect(fs.existsSync(path.resolve("supabase_schema_v3.sql"))).toBe(true);
  });

  it(".env is in .gitignore", () => {
    const fs = require("fs");
    const gitignore = fs.readFileSync(".gitignore", "utf-8");
    expect(gitignore).toContain(".env");
  });
});

// ─── Supabase Connection ───────────────────────────────────────

describe("Supabase Connection", () => {
  beforeAll(() => {
    require("dotenv").config({ path: ".env" });
  });

  it("can connect and query staff", async () => {
    const { SupabaseService } = await import("../packages/core/src/services/supabase.service.js");
    const db = SupabaseService.getInstance();
    const staff = await db.getAllStaff();
    expect(Array.isArray(staff)).toBe(true);
  }, 15_000);
});

// ─── LLM Connection ───────────────────────────────────────────

describe("OpenRouter LLM Connection", () => {
  beforeAll(() => {
    require("dotenv").config({ path: ".env" });
  });

  it("can get a response from the model", async () => {
    const { LlmService } = await import("../packages/core/src/services/llm.service.js");
    const llm = LlmService.getInstance();
    const response = await llm.chat({
      userMessage: "Ping — yanıt olarak 'Pong' yaz.",
      role: "boss",
    });
    expect(response).toBeTruthy();
    expect(response!.toLowerCase()).toContain("pong");
  }, 30_000);

  it("can translate Turkish to Russian", async () => {
    const { LlmService } = await import("../packages/core/src/services/llm.service.js");
    const llm = LlmService.getInstance();
    const result = await llm.translateToRussian(["Karkas Üretimi", "Dikişhane", "Boyahane"]);
    expect(result.length).toBe(3);
    // At least some should contain Cyrillic
    const hasCyrillic = result.some((r) => /[а-яА-ЯёЁ]/.test(r));
    expect(hasCyrillic).toBe(true);
  }, 30_000);
});
