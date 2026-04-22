/**
 * WikiEngine — Core wiki operations: ingest, query, lint
 *
 * Three-layer architecture:
 * - raw/    → immutable sources (never modified)
 * - wiki/   → LLM-generated markdown pages
 * - schema/ → operational rules (CLAUDE.md)
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { SupabaseService } from "@sandaluci/core";
import { logger } from "@sandaluci/core";
import type { WikiPage, WikiPageType } from "@sandaluci/core";

const DEFAULT_VAULT_PATH = path.resolve(process.cwd(), "vault");

export interface WikiEngineConfig {
  vaultPath?: string;
  autoIngest?: boolean;
}

export interface IngestResult {
  slug: string;
  title: string;
  pagesCreated: string[];
  pagesUpdated: string[];
}

export interface QueryResult {
  answer: string;
  sources: string[];
  confidence: number;
}

export interface LintIssue {
  type: "orphan" | "stale" | "broken_link" | "missing_page" | "contradiction";
  slug: string;
  description: string;
  severity: "low" | "medium" | "high";
}

export interface LintReport {
  timestamp: string;
  totalPages: number;
  issues: LintIssue[];
  suggestions: string[];
}

export class WikiEngine {
  private vaultPath: string;
  private db: SupabaseService;

  constructor(config?: WikiEngineConfig) {
    this.vaultPath = config?.vaultPath || process.env.VAULT_PATH || DEFAULT_VAULT_PATH;
    this.db = SupabaseService.getInstance();
  }

  // --- Path helpers ---
  get rawPath() { return path.join(this.vaultPath, "raw"); }
  get wikiPath() { return path.join(this.vaultPath, "wiki"); }
  get indexPath() { return path.join(this.wikiPath, "index.md"); }
  get logPath() { return path.join(this.wikiPath, "log.md"); }

  // --- Ingest ---
  async ingest(
    source: string,
    content: string,
    metadata?: { tags?: string[]; sourceFile?: string },
  ): Promise<IngestResult> {
    const result: IngestResult = { slug: "", title: "", pagesCreated: [], pagesUpdated: [] };

    // 1. Save raw source
    const rawDir = this.getRawDir(source);
    const rawFile = path.join(rawDir, `${Date.now()}.md`);
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(rawFile, content, "utf-8");

    // 2. Extract structured data from content
    const extracted = this.extractKnowledge(content, source);

    // 3. Create/update wiki pages
    for (const page of extracted.pages) {
      const existing = await this.db.getWikiPage(page.slug);
      if (existing) {
        await this.updateWikiPage(page.slug, page, metadata);
        result.pagesUpdated.push(page.slug);
      } else {
        await this.createWikiPage(page, metadata);
        result.pagesCreated.push(page.slug);
      }
    }

    // 4. Update index.md
    await this.updateIndex();

    // 5. Append to log.md
    this.appendLog("ingest", source, result.pagesCreated.concat(result.pagesUpdated));

    result.slug = extracted.pages[0]?.slug || "";
    result.title = extracted.pages[0]?.title || "";

    logger.info({ result }, "Wiki ingest completed");
    return result;
  }

  // --- Query ---
  async query(question: string, limit = 5): Promise<{ context: string; sources: string[] }> {
    const sources: string[] = [];
    const contextParts: string[] = [];

    // 1. Full-text search via Supabase
    try {
      const results = await this.db.searchWikiPages(question, limit);
      if (results && results.length > 0) {
        for (const r of results) {
          sources.push(r.slug);
          const page = await this.db.getWikiPage(r.slug);
          if (page) {
            contextParts.push(`## ${page.title}\n${page.content}`);
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, "Wiki DB search failed, falling back to file search");
    }

    // 2. Fallback: file-based search
    if (contextParts.length === 0) {
      const fileResults = this.searchFiles(question, limit);
      for (const r of fileResults) {
        sources.push(r.slug);
        contextParts.push(`## ${r.title}\n${r.content}`);
      }
    }

    return {
      context: contextParts.join("\n\n---\n\n"),
      sources,
    };
  }

  // --- Lint ---
  async lint(): Promise<LintReport> {
    const issues: LintIssue[] = [];
    const suggestions: string[] = [];
    let totalPages = 0;

    // Read all wiki pages from filesystem
    const wikiFiles = this.getAllWikiFiles();
    totalPages = wikiFiles.length;

    // Build link graph
    const linkGraph = new Map<string, Set<string>>();
    const allSlugs = new Set<string>();

    for (const file of wikiFiles) {
      const page = this.parseWikiFile(file);
      if (!page) continue;

      const slug = page.slug || this.fileToSlug(file);
      allSlugs.add(slug);

      const outgoing = this.extractWikilinks(page.content);
      linkGraph.set(slug, new Set(outgoing));

      // Check for stale pages (30+ days)
      const updated = page.data?.updated || page.data?.created;
      if (updated) {
        const age = Date.now() - new Date(updated).getTime();
        if (age > 30 * 24 * 60 * 60 * 1000) {
          issues.push({
            type: "stale",
            slug,
            description: `Page not updated in ${Math.round(age / (24 * 60 * 60 * 1000))} days`,
            severity: "low",
          });
        }
      }
    }

    // Check for orphans (no incoming links)
    const incomingMap = new Map<string, number>();
    for (const [, outgoing] of linkGraph) {
      for (const target of outgoing) {
        incomingMap.set(target, (incomingMap.get(target) || 0) + 1);
      }
    }

    for (const slug of allSlugs) {
      if (!incomingMap.has(slug) && slug !== "index" && slug !== "log") {
        issues.push({
          type: "orphan",
          slug,
          description: "No incoming links from other pages",
          severity: "medium",
        });
      }
    }

    // Check for broken links
    for (const [slug, outgoing] of linkGraph) {
      for (const target of outgoing) {
        if (!allSlugs.has(target)) {
          issues.push({
            type: "broken_link",
            slug,
            description: `Links to non-existent page: [[${target}]]`,
            severity: "high",
          });
          suggestions.push(`Create page: ${target}`);
        }
      }
    }

    // Update log
    this.appendLog("lint", `Lint report: ${issues.length} issues found`, []);

    return {
      timestamp: new Date().toISOString(),
      totalPages,
      issues,
      suggestions,
    };
  }

  // --- Private helpers ---

  private getRawDir(source: string): string {
    if (source.includes("@") || source.includes("email")) return path.join(this.rawPath, "emails");
    if (source.endsWith(".xlsx") || source.endsWith(".xls")) return path.join(this.rawPath, "excels");
    if (source.includes("konuşma") || source.includes("conversation")) return path.join(this.rawPath, "conversations");
    return path.join(this.rawPath, "policies");
  }

  private extractKnowledge(content: string, source: string): { pages: Array<{ slug: string; title: string; content: string; pageType: WikiPageType; tags: string[] }> } {
    // Simple extraction — in production this would call LLM
    const pages: Array<{ slug: string; title: string; content: string; pageType: WikiPageType; tags: string[] }> = [];
    const lines = content.split("\n").filter(l => l.trim());

    if (lines.length > 0) {
      const title = lines[0].replace(/^#+\s*/, "").trim() || source;
      const slug = source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      pages.push({
        slug,
        title,
        content,
        pageType: "concept",
        tags: [source],
      });
    }

    return { pages };
  }

  private async createWikiPage(
    page: { slug: string; title: string; content: string; pageType: WikiPageType; tags: string[] },
    metadata?: { tags?: string[]; sourceFile?: string },
  ): Promise<void> {
    // Save to filesystem
    const wikiFile = path.join(this.wikiPath, `${page.slug}.md`);
    const wikiDir = path.dirname(wikiFile);
    fs.mkdirSync(wikiDir, { recursive: true });

    const frontmatter = {
      slug: page.slug,
      title: page.title,
      type: page.pageType,
      tags: [...(page.tags || []), ...(metadata?.tags || [])],
      created: new Date().toISOString().split("T")[0],
      updated: new Date().toISOString().split("T")[0],
      sources: metadata?.sourceFile ? [metadata.sourceFile] : [],
    };

    const fileContent = matter.stringify(page.content, frontmatter);
    fs.writeFileSync(wikiFile, fileContent, "utf-8");

    // Save to Supabase
    try {
      await this.db.upsertWikiPage({
        slug: page.slug,
        title: page.title,
        content: page.content,
        pageType: page.pageType,
        tags: frontmatter.tags,
        sourceRefs: frontmatter.sources,
      });
    } catch (err) {
      logger.warn({ err, slug: page.slug }, "Failed to save wiki page to DB");
    }
  }

  private async updateWikiPage(
    slug: string,
    page: { title?: string; content?: string; tags?: string[] },
    metadata?: { tags?: string[]; sourceFile?: string },
  ): Promise<void> {
    // Update filesystem
    const wikiFile = path.join(this.wikiPath, `${slug}.md`);
    if (fs.existsSync(wikiFile)) {
      const existing = matter(fs.readFileSync(wikiFile, "utf-8"));
      const updated = {
        ...existing.data,
        updated: new Date().toISOString().split("T")[0],
        tags: [...new Set([...(existing.data.tags || []), ...(page.tags || []), ...(metadata?.tags || [])])],
        sources: [...new Set([...(existing.data.sources || []), ...(metadata?.sourceFile ? [metadata.sourceFile] : [])])],
      };
      fs.writeFileSync(wikiFile, matter.stringify(page.content || existing.content, updated), "utf-8");
    }

    // Update Supabase
    try {
      await this.db.upsertWikiPage({
        slug,
        title: page.title,
        content: page.content,
        tags: [...(page.tags || []), ...(metadata?.tags || [])],
        sourceRefs: metadata?.sourceFile ? [metadata.sourceFile] : [],
      });
    } catch (err) {
      logger.warn({ err, slug }, "Failed to update wiki page in DB");
    }
  }

  private async updateIndex(): Promise<void> {
    // Index is maintained by filesystem + Supabase
    // For now, just log that we should update it
    logger.info("Wiki index update triggered");
  }

  private appendLog(operation: string, title: string, affectedPages: string[]): void {
    const date = new Date().toISOString().split("T")[0];
    const entry = `## [${date}] ${operation} | ${title}\n${affectedPages.length > 0 ? `- Etkilenen sayfalar: ${affectedPages.join(", ")}\n` : ""}\n`;

    if (fs.existsSync(this.logPath)) {
      fs.appendFileSync(this.logPath, entry, "utf-8");
    }
  }

  private searchFiles(query: string, limit: number): Array<{ slug: string; title: string; content: string }> {
    const results: Array<{ slug: string; title: string; content: string }> = [];
    const queryLower = query.toLowerCase();
    const files = this.getAllWikiFiles();

    for (const file of files) {
      if (results.length >= limit) break;
      const raw = fs.readFileSync(file, "utf-8");
      const parsed = matter(raw);
      const content = parsed.content.toLowerCase();
      const title = parsed.data.title || path.basename(file, ".md");

      if (content.includes(queryLower) || title.toLowerCase().includes(queryLower)) {
        results.push({
          slug: parsed.data.slug || this.fileToSlug(file),
          title,
          content: parsed.content,
        });
      }
    }

    return results;
  }

  private getAllWikiFiles(dir?: string): string[] {
    const searchDir = dir || this.wikiPath;
    const files: string[] = [];

    if (!fs.existsSync(searchDir)) return files;

    const entries = fs.readdirSync(searchDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(searchDir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.getAllWikiFiles(fullPath));
      } else if (entry.name.endsWith(".md") && entry.name !== "index.md" && entry.name !== "log.md") {
        files.push(fullPath);
      }
    }

    return files;
  }

  private parseWikiFile(filePath: string): { slug: string; content: string; data: any } | null {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = matter(raw);
      return {
        slug: parsed.data.slug || this.fileToSlug(filePath),
        content: parsed.content,
        data: parsed.data,
      };
    } catch {
      return null;
    }
  }

  private fileToSlug(filePath: string): string {
    const relative = path.relative(this.wikiPath, filePath);
    return relative.replace(/\\/g, "/").replace(/\.md$/, "");
  }

  private extractWikilinks(content: string): string[] {
    const regex = /\[\[([^\]]+)\]\]/g;
    const links: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      links.push(match[1]);
    }
    return links;
  }
}
