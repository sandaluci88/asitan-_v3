/**
 * KaizenOptimizer — LLM-powered system prompt optimization
 *
 * Hermes Agent skill self-improve loop'tan ilham:
 * - Analyzer'dan pattern'leri alır
 * - LLM (meta-prompt) ile iyileştirilmiş prompt üretir
 * - Candidate prompt'u prompt_versions tablosuna kaydeder
 *
 * V3 Upgrade: Basit rule-based → LLM meta-prompt ile gerçek iyileştirme
 */

import { SupabaseService, LlmService, logger } from "@sandaluci/core";
import { WikiEngine } from "@sandaluci/wiki";
import type { AnalysisResult, Pattern } from "./analyzer.js";

export interface OptimizerResult {
  candidateVersion: string;
  candidatePrompt: string;
  improvements: string[];
  basedOnPatterns: string[];
}

export class KaizenOptimizer {
  private db: SupabaseService;
  private llm: LlmService;
  private wiki: WikiEngine;

  constructor() {
    this.db = SupabaseService.getInstance();
    this.llm = LlmService.getInstance();
    this.wiki = new WikiEngine();
  }

  async optimize(analysis: AnalysisResult): Promise<OptimizerResult | null> {
    if (analysis.patterns.length === 0) {
      logger.info("Kaizen: No patterns found, skipping optimization");
      return null;
    }

    // 1. Aktif prompt'u al
    const current = await this.db.getActivePromptVersion();
    if (!current) {
      logger.info("Kaizen: No active prompt version found");
      return null;
    }

    // 2. Son düzeltilen (corrected) kararları al — meta-prompt için kanıt
    const recentCorrections = await this.getRecentCorrections();

    // 3. Wiki context al
    const wikiContext = await this.wiki.query("prompt optimization system performance");

    // 4. Pattern açıklamalarını hazırla
    const patternDescriptions = analysis.patterns
      .map((p: Pattern) => `- [${p.severity}] ${p.type}: ${p.description}`)
      .join("\n");

    const recommendations = analysis.recommendations.join("\n");

    // 5. LLM meta-prompt ile iyileştirilmiş prompt üret
    const improvedPrompt = await this.generateImprovedPrompt(
      current.content,
      patternDescriptions,
      recommendations,
      recentCorrections,
    );

    if (!improvedPrompt) {
      logger.warn("Kaizen: LLM meta-prompt returned null, falling back to rule-based");
      return this.fallbackOptimize(analysis, current);
    }

    // 6. İyileştirme detaylarını çıkar
    const improvements = analysis.patterns.map((p: Pattern) =>
      this.describeImprovement(p),
    );

    const basedOnPatterns = analysis.patterns.map((p: Pattern) => p.type);

    // 7. Candidate'ı kaydet
    const newVersion = this.incrementVersion(current.version);

    try {
      const client = this.db.getClient();
      await client.from("prompt_versions").insert({
        version: newVersion,
        content: improvedPrompt,
        score: 0,
        is_active: false,
        wiki_context_used: wikiContext.sources || [],
        evaluation_notes: `LLM-optimized based on ${analysis.totalDecisions} decisions, ${analysis.patterns.length} patterns`,
      });
    } catch (err) {
      logger.warn({ err }, "Kaizen: Failed to save candidate prompt");
    }

    const result: OptimizerResult = {
      candidateVersion: newVersion,
      candidatePrompt: improvedPrompt,
      improvements,
      basedOnPatterns,
    };

    logger.info(
      { version: newVersion, improvements: improvements.length, method: "llm-meta-prompt" },
      "Kaizen: Candidate prompt generated via LLM",
    );

    return result;
  }

  // ────────────────────────────────────────────────────────
  // LLM Meta-Prompt
  // ────────────────────────────────────────────────────────

  /**
   * LLM ile iyileştirilmiş prompt üret (Hermes skill_edit pattern)
   */
  private async generateImprovedPrompt(
    currentPrompt: string,
    patternDescriptions: string,
    recommendations: string,
    corrections: Array<{ input: string; output: string; feedback?: string }>,
  ): Promise<string | null> {
    const correctionsText = corrections.length > 0
      ? corrections
          .slice(0, 5)
          .map(
            (c, i) =>
              `${i + 1}. İstek: "${c.input.slice(0, 100)}"\n   Beklenen: "${c.feedback || "düzeltildi"}"\n   Alınan: "${c.output.slice(0, 100)}"`,
          )
          .join("\n")
      : "Son 7 günde düzeltme yok.";

    const metaPrompt = `Sen bir prompt optimizasyon AI'sın. Fabrika asistanı (Ayça) için sistem prompt'unu iyileştireceksin.

## MEVCUT PROMPT:
\`\`\`
${currentPrompt.slice(0, 3000)}
\`\`\`

## TESPİT EDİLEN SORUNLAR:
${patternDescriptions}

## ÖNERİLER:
${recommendations}

## SON DÜZELTMELER (kullanıcı geri bildirimi):
${correctionsText}

## KURALLAR:
1. Orijinal yapıyı ve kişiliği (Ayça persona) koru
2. Tespit edilen zayıf alanlar için spesifik yönlendirme ekle
3. Mevcut kuralları asla kaldırma, sadece ekle/netleştir
4. Türkçe yaz
5. Sadece İYİLEŞTİRİLMİŞ prompt'u çıktı ver — başka açıklama ekleme
6. "## Kaizen Improvements" bölümü EKLEME — sadece temiz prompt ver

İYİLEŞTİRİLMİŞ PROMPT:`;

    try {
      const response = await this.llm.chat({
        userMessage: metaPrompt,
        context: "Meta-prompt optimization mode — generate improved system prompt",
      });

      if (!response) return null;

      // LLM bazen markdown kod bloğu içine alabilir — temizle
      let cleaned = response.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:markdown|text)?\n?/, "").replace(/\n?```$/, "");
      }

      return cleaned;
    } catch (err) {
      logger.warn({ err }, "Kaizen: LLM meta-prompt failed");
      return null;
    }
  }

  // ────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────

  private async getRecentCorrections(): Promise<
    Array<{ input: string; output: string; feedback?: string }>
  > {
    try {
      const client = this.db.getClient();
      const since = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data } = await client
        .from("prompt_decisions")
        .select("input_summary, output, user_feedback")
        .eq("outcome", "corrected")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10);

      return (data || []).map((d: any) => ({
        input: d.input_summary || "",
        output: d.output || "",
        feedback: d.user_feedback || undefined,
      }));
    } catch {
      return [];
    }
  }

  private describeImprovement(pattern: Pattern): string {
    switch (pattern.type) {
      case "repeated_mistake":
        return `Tekrarlayan hata düzeltmesi eklendi: ${pattern.description}`;
      case "low_confidence":
        return `Düşük güven alanına ek bağlam eklendi: ${pattern.description}`;
      case "contradiction":
        return `Çelişki giderme kuralı eklendi: ${pattern.description}`;
      case "improvement":
        return `İyileştirme kalıbı entegre edildi: ${pattern.description}`;
      default:
        return `Genel iyileştirme: ${pattern.description}`;
    }
  }

  /**
   * Fallback: LLM başarısız olursa basit rule-based iyileştirme
   */
  private fallbackOptimize(
    analysis: AnalysisResult,
    current: { version: string; content: string },
  ): OptimizerResult {
    const improvements = analysis.patterns.map((p: Pattern) =>
      this.describeImprovement(p),
    );
    const basedOnPatterns = analysis.patterns.map((p: Pattern) => p.type);
    const newVersion = this.incrementVersion(current.version);

    const improvementNotes = improvements.map((i, idx) => `${idx + 1}. ${i}`).join("\n");

    const candidatePrompt = `${current.content}

---
## Kaizen Improvements (${new Date().toISOString().split("T")[0]})
Applied improvements:
${improvementNotes}

Recommendations:
${analysis.recommendations.join("\n")}
---`;

    return {
      candidateVersion: newVersion,
      candidatePrompt,
      improvements,
      basedOnPatterns,
    };
  }

  private incrementVersion(version: string): string {
    const parts = version.split(".");
    const patch = parseInt(parts[2] || "0") + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }
}
