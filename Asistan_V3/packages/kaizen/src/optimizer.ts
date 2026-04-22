/**
 * KaizenOptimizer — Generates improved system prompts
 *
 * Uses:
 * - Current system prompt
 * - Wiki knowledge about what works/fails
 * - Decision log statistics
 * - Meta-LLM call to generate candidate prompt
 */

import { SupabaseService, logger } from "@sandaluci/core";
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
  private wiki: WikiEngine;

  constructor() {
    this.db = SupabaseService.getInstance();
    this.wiki = new WikiEngine();
  }

  async optimize(analysis: AnalysisResult): Promise<OptimizerResult | null> {
    if (analysis.patterns.length === 0) {
      logger.info("Kaizen: No patterns found, skipping optimization");
      return null;
    }

    // 1. Get current active prompt
    const current = await this.db.getActivePromptVersion();
    if (!current) {
      logger.info("Kaizen: No active prompt version found");
      return null;
    }

    // 2. Get wiki context about prompt performance
    const wikiContext = await this.wiki.query("prompt optimization system performance");

    // 3. Build optimization context
    const patternDescriptions = analysis.patterns
      .map((p: Pattern) => `- [${p.severity}] ${p.type}: ${p.description}`)
      .join("\n");

    const recommendations = analysis.recommendations.join("\n");

    // 4. Generate candidate prompt (in production: LLM call with meta-prompt)
    const improvements: string[] = [];
    const basedOnPatterns = analysis.patterns.map((p: Pattern) => p.type);

    // Apply pattern-based improvements
    for (const pattern of analysis.patterns) {
      switch (pattern.type) {
        case "repeated_mistake":
          improvements.push("Add explicit examples for corrected cases");
          break;
        case "low_confidence":
          improvements.push("Add more context clues for ambiguous queries");
          break;
        case "contradiction":
          improvements.push("Clarify hierarchy of information sources");
          break;
        case "improvement":
          improvements.push("Incorporate discovered pattern into prompt");
          break;
      }
    }

    // 5. Build candidate prompt
    const newVersion = incrementVersion(current.version);
    const candidatePrompt = buildCandidatePrompt(current.content, improvements, recommendations);

    // 6. Save candidate to DB
    try {
      const client = this.db.getClient();
      await client.from("prompt_versions").insert({
        version: newVersion,
        content: candidatePrompt,
        score: 0,
        is_active: false,
        wiki_context_used: wikiContext.sources,
        evaluation_notes: `Based on ${analysis.totalDecisions} decisions, ${analysis.patterns.length} patterns detected`,
      });
    } catch (err) {
      logger.warn({ err }, "Kaizen: Failed to save candidate prompt");
    }

    const result: OptimizerResult = {
      candidateVersion: newVersion,
      candidatePrompt,
      improvements,
      basedOnPatterns,
    };

    logger.info({ version: newVersion, improvements: improvements.length }, "Kaizen: Candidate prompt generated");
    return result;
  }
}

function incrementVersion(version: string): string {
  const parts = version.split(".");
  const patch = parseInt(parts[2] || "0") + 1;
  return `${parts[0]}.${parts[1]}.${patch}`;
}

function buildCandidatePrompt(current: string, improvements: string[], recommendations: string): string {
  const improvementNotes = improvements.map((i, idx) => `${idx + 1}. ${i}`).join("\n");

  return `${current}

---
## Kaizen Improvements (${new Date().toISOString().split("T")[0]})
Applied improvements:
${improvementNotes}

Recommendations:
${recommendations}
---`;
}
