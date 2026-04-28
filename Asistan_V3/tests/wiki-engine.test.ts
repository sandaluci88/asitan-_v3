import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// Mock SupabaseService before import
vi.mock("@sandaluci/core", () => ({
  SupabaseService: {
    getInstance: () => ({
      searchWikiPages: vi.fn(async () => []),
      getWikiPage: vi.fn(async () => null),
      upsertWikiPage: vi.fn(async () => {}),
    }),
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("WikiEngine — Faz 3 (C1-C7)", () => {
  let tmpVault: string;
  let wikiDir: string;
  let rawDir: string;
  let WikiEngine: any;

  async function createEngine() {
    vi.resetModules();
    const mod = await import("../packages/wiki/src/engine.js");
    WikiEngine = mod.WikiEngine;
    const engine = new WikiEngine({ vaultPath: tmpVault, autoIngest: false });
    return engine;
  }

  // Helper: create a wiki page file
  function createWikiPage(subpath: string, title: string, content: string, extra?: Record<string, any>) {
    const fullPath = path.join(wikiDir, subpath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const frontmatter = {
      slug: subpath.replace(/\.md$/, ""),
      title,
      type: "concept",
      tags: [],
      created: "2026-04-28",
      updated: "2026-04-28",
      ...extra,
    };
    const fmLines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n");
    fs.writeFileSync(fullPath, `---\n${fmLines}\n---\n\n${content}`, "utf-8");
  }

  beforeEach(async () => {
    tmpVault = await fs.promises.mkdtemp(path.join(os.tmpdir(), "wiki-test-"));
    wikiDir = path.join(tmpVault, "wiki");
    rawDir = path.join(tmpVault, "raw");
    fs.mkdirSync(wikiDir, { recursive: true });
    fs.mkdirSync(rawDir, { recursive: true });

    // Create index.md and log.md (required by engine)
    fs.writeFileSync(path.join(wikiDir, "index.md"), "# Wiki Index\n", "utf-8");
    fs.writeFileSync(path.join(wikiDir, "log.md"), "# Wiki Log\n", "utf-8");
  });

  afterEach(async () => {
    await fs.promises.rm(tmpVault, { recursive: true, force: true }).catch(() => {});
  });

  // C1: Departman sorusu → wiki bilgisi
  it("C1: department question returns wiki page content", async () => {
    const engine = await createEngine();
    createWikiPage(
      "departments/karkas.md",
      "Karkas Üretimi",
      "Karkas departmanı ahşap iskelet üretiminden sorumludur. Personel: Bekbergen. Üretim süreci: kesim, monte, kalite kontrol.",
    );

    const result = await engine.query("karkas");
    expect(result.context).toContain("Karkas");
    expect(result.sources.length).toBeGreaterThan(0);
  });

  // C2: "Marina kim?" → wiki bilgisi
  it("C2: person question returns wiki page about Marina", async () => {
    const engine = await createEngine();
    createWikiPage(
      "people/marina.md",
      "Marina",
      "Marina, Sandaluci'de koordinatör ve dış satın alma sorumlusu olarak çalışır. Kumaş, plastik sandalye, çivi ve sünger tedarikini yönetir.",
    );

    const result = await engine.query("marina");
    expect(result.context).toContain("Marina");
    expect(result.context).toMatch(/koordinatör|satın alma/i);
  });

  // C3: Dağıtım prosedürü → wiki bilgisi
  it("C3: distribution procedure returns wiki page", async () => {
    const engine = await createEngine();
    createWikiPage(
      "procedures/order-distribution.md",
      "Sipariş Dağıtım Prosedürü",
      "Sipariş dağıtımı: Karkas, Metal, Boyahane otomatik dağıtılır. Dikishane ve Döşemehane manuel atanır. Marina her iki departmana iş emri gönderir.",
    );

    const result = await engine.query("sipariş dağıtım prosedürü");
    expect(result.context).toMatch(/Dikishane|Döşemehane|otomatik/);
  });

  // C4: Bilinmeyen konu → wiki boş döner
  it("C4: unknown topic returns empty context", async () => {
    const engine = await createEngine();
    createWikiPage("departments/karkas.md", "Karkas", "Karkas üretimi bilgisi.");

    const result = await engine.query("quantum physics explained");
    expect(result.context).toBe("");
    expect(result.sources).toHaveLength(0);
  });

  // C5: Wiki lint — orphan sayfa tespiti
  it("C5: lint detects orphan pages (no incoming links)", async () => {
    const engine = await createEngine();
    createWikiPage(
      "departments/karkas.md",
      "Karkas",
      "Karkas departmanı. [[metal]] ile çalışır.",
    );
    createWikiPage(
      "people/marina.md",
      "Marina",
      "Marina bilgisi. Bağlantısı yok.",
    );

    const report = await engine.lint();
    expect(report.totalPages).toBe(2);
    // marina.md has no incoming links (orphan)
    const orphanIssues = report.issues.filter((i: any) => i.type === "orphan");
    expect(orphanIssues.length).toBeGreaterThan(0);
  });

  // C6: Wiki ingest — yeni kaynak ekleme
  it("C6: ingest creates new wiki page from source", async () => {
    const engine = await createEngine();

    const result = await engine.ingest("test-source", "# Yeni Test Sayfası\n\nBu yeni bir test sayfasıdır.", { tags: ["test"] });
    expect(result.pagesCreated.length).toBeGreaterThan(0);

    // Verify file was created in raw/
    const rawFiles = fs.readdirSync(path.join(rawDir, "policies"));
    expect(rawFiles.length).toBeGreaterThan(0);
  });

  // C7: Wiki log — sorgu/operasyon kaydı
  it("C7: operations are logged to log.md", async () => {
    const engine = await createEngine();
    createWikiPage("departments/karkas.md", "Karkas", "Karkas bilgisi.");

    // Perform ingest (which logs)
    await engine.ingest("log-test", "# Log Test\nTest content.");

    const logContent = fs.readFileSync(path.join(wikiDir, "log.md"), "utf-8");
    expect(logContent).toMatch(/ingest/i);
  });
});
