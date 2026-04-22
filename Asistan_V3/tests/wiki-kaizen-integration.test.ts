/**
 * Test Suite 3: Wiki Engine + Kaizen Tracker
 * Tests the new V3 modules: wiki ingest/query/lint and kaizen decision tracking
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(".env") });
import { WikiEngine } from "../packages/wiki/src/engine.js";
import { KaizenTracker } from "../packages/kaizen/src/tracker.js";
import { KaizenAnalyzer } from "../packages/kaizen/src/analyzer.js";

const TEST_VAULT = path.resolve("vault");

// ─── Wiki Engine ───────────────────────────────────────────────

describe("WikiEngine", () => {
  let engine: WikiEngine;

  beforeAll(() => {
    engine = new WikiEngine({ vaultPath: TEST_VAULT });
  });

  describe("filesystem structure", () => {
    it("has vault directory", () => {
      expect(fs.existsSync(TEST_VAULT)).toBe(true);
    });

    it("has raw subdirectories", () => {
      expect(fs.existsSync(path.join(TEST_VAULT, "raw/emails"))).toBe(true);
      expect(fs.existsSync(path.join(TEST_VAULT, "raw/excels"))).toBe(true);
      expect(fs.existsSync(path.join(TEST_VAULT, "raw/conversations"))).toBe(true);
      expect(fs.existsSync(path.join(TEST_VAULT, "raw/policies"))).toBe(true);
    });

    it("has wiki subdirectories", () => {
      expect(fs.existsSync(path.join(TEST_VAULT, "wiki/departments"))).toBe(true);
      expect(fs.existsSync(path.join(TEST_VAULT, "wiki/orders"))).toBe(true);
      expect(fs.existsSync(path.join(TEST_VAULT, "wiki/procedures"))).toBe(true);
      expect(fs.existsSync(path.join(TEST_VAULT, "wiki/people"))).toBe(true);
      expect(fs.existsSync(path.join(TEST_VAULT, "wiki/products"))).toBe(true);
    });

    it("has index.md", () => {
      expect(fs.existsSync(path.join(TEST_VAULT, "wiki/index.md"))).toBe(true);
    });

    it("has log.md", () => {
      expect(fs.existsSync(path.join(TEST_VAULT, "wiki/log.md"))).toBe(true);
    });

    it("has schema/CLAUDE.md", () => {
      expect(fs.existsSync(path.join(TEST_VAULT, "schema/CLAUDE.md"))).toBe(true);
    });
  });

  describe("seed data", () => {
    it("has all 6 department pages", () => {
      const deptDir = path.join(TEST_VAULT, "wiki/departments");
      const files = fs.readdirSync(deptDir).filter((f) => f.endsWith(".md"));
      expect(files.length).toBe(6);
      expect(files).toContain("karkas.md");
      expect(files).toContain("metal.md");
      expect(files).toContain("boyahane.md");
      expect(files).toContain("dikishane.md");
      expect(files).toContain("dosemehane.md");
      expect(files).toContain("mobilya-dekorasyon.md");
    });

    it("has Marina person page", () => {
      expect(fs.existsSync(path.join(TEST_VAULT, "wiki/people/marina.md"))).toBe(true);
    });

    it("has procedure pages", () => {
      expect(fs.existsSync(path.join(TEST_VAULT, "wiki/procedures/order-distribution.md"))).toBe(true);
      expect(fs.existsSync(path.join(TEST_VAULT, "wiki/procedures/fabric-tracking.md"))).toBe(true);
    });

    it("department pages have correct frontmatter", () => {
      const matter = require("gray-matter");
      const karkas = matter.read(path.join(TEST_VAULT, "wiki/departments/karkas.md"));
      expect(karkas.data.type).toBe("department");
      expect(karkas.data.slug).toBe("departments/karkas");
      expect(karkas.data.tags).toContain("karkas");
    });
  });

  describe("query()", () => {
    it("finds relevant pages by keyword", async () => {
      const result = await engine.query("karkas");
      expect(result.sources.length).toBeGreaterThan(0);
    });

    it("finds pages for fabric tracking", async () => {
      const result = await engine.query("kumas takip");
      expect(result.sources.length).toBeGreaterThan(0);
    });

    it("finds pages about Marina", async () => {
      const result = await engine.query("marina");
      expect(result.sources.length).toBeGreaterThan(0);
    });

    it("returns empty for nonsensical query", async () => {
      const result = await engine.query("xyzqwerty12345");
      expect(result.sources.length).toBe(0);
    });

    it("returns context string with content", async () => {
      const result = await engine.query("boyahane");
      if (result.sources.length > 0) {
        expect(result.context.length).toBeGreaterThan(0);
      }
    });
  });

  describe("lint()", () => {
    it("runs lint without errors", async () => {
      const report = await engine.lint();
      expect(report).toHaveProperty("totalPages");
      expect(report).toHaveProperty("issues");
      expect(report).toHaveProperty("suggestions");
      expect(report.totalPages).toBeGreaterThan(0);
    });

    it("detects all wiki files", async () => {
      const report = await engine.lint();
      expect(report.totalPages).toBeGreaterThanOrEqual(9); // 6 dept + 1 person + 2 procedures
    });
  });
});

// ─── Kaizen Tracker ────────────────────────────────────────────

describe("KaizenTracker", () => {
  it("returns singleton instance", () => {
    const a = KaizenTracker.getInstance();
    const b = KaizenTracker.getInstance();
    expect(a).toBe(b);
  });

  it("has default version 3.0.0", () => {
    const tracker = KaizenTracker.getInstance();
    expect(tracker.getVersion()).toBe("3.0.0");
  });

  it("can update version", () => {
    const tracker = KaizenTracker.getInstance();
    tracker.setVersion("3.0.1");
    expect(tracker.getVersion()).toBe("3.0.1");
    // Reset
    tracker.setVersion("3.0.0");
  });

  it("log() does not throw", async () => {
    const tracker = KaizenTracker.getInstance();
    // This will fail on DB if Supabase is unreachable, but should not throw
    await expect(
      tracker.log({
        input: "test input",
        output: "test output",
        interactionType: "general",
      }),
    ).resolves.toBeUndefined();
  });
});

// ─── Kaizen Analyzer ───────────────────────────────────────────

describe("KaizenAnalyzer", () => {
  it("analyze() returns structure without throwing", async () => {
    const analyzer = new KaizenAnalyzer();
    const result = await analyzer.analyze(1);
    expect(result).toHaveProperty("date");
    expect(result).toHaveProperty("totalDecisions");
    expect(result).toHaveProperty("patterns");
    expect(result).toHaveProperty("recommendations");
    expect(Array.isArray(result.patterns)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
  });
});
