/**
 * KaizenAnalyzer — Detects patterns in LLM decisions
 *
 * Runs daily (cron) to find:
 * - Repeated mistakes
 * - Low-confidence decisions
 * - Contradictions
 * - Improvement opportunities
 */

import { SupabaseService, logger } from "@sandaluci/core";

export interface AnalysisResult {
  date: string;
  totalDecisions: number;
  patterns: Pattern[];
  recommendations: string[];
}

export interface Pattern {
  type: "repeated_mistake" | "low_confidence" | "contradiction" | "improvement";
  description: string;
  evidence: string[];
  severity: "low" | "medium" | "high";
  affectedInteractions: string[];
}

export class KaizenAnalyzer {
  private db: SupabaseService;

  constructor() {
    this.db = SupabaseService.getInstance();
  }

  async analyze(days = 7): Promise<AnalysisResult> {
    const result: AnalysisResult = {
      date: new Date().toISOString().split("T")[0],
      totalDecisions: 0,
      patterns: [],
      recommendations: [],
    };

    try {
      // In production, this queries prompt_decisions from last N days
      // and uses LLM to detect patterns

      // Placeholder: query recent decisions
      const client = this.db.getClient();
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data: decisions, error } = await client
        .from("prompt_decisions")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false });

      if (error) throw error;

      result.totalDecisions = decisions?.length || 0;

      // Pattern: low confidence decisions
      const lowConfidence = decisions?.filter((d: any) => d.confidence && d.confidence < 0.5) || [];
      if (lowConfidence.length > 3) {
        result.patterns.push({
          type: "low_confidence",
          description: `${lowConfidence.length} decisions with confidence < 0.5 in last ${days} days`,
          evidence: lowConfidence.map((d: any) => d.input_summary).slice(5),
          severity: "medium",
          affectedInteractions: lowConfidence.map((d: any) => d.id),
        });
        result.recommendations.push("Review low-confidence interaction types for prompt improvement");
      }

      // Pattern: corrected outcomes
      const corrected = decisions?.filter((d: any) => d.outcome === "corrected") || [];
      if (corrected.length > 2) {
        result.patterns.push({
          type: "repeated_mistake",
          description: `${corrected.length} decisions were corrected by users`,
          evidence: corrected.map((d: any) => d.user_feedback).filter(Boolean).slice(5),
          severity: "high",
          affectedInteractions: corrected.map((d: any) => d.id),
        });
        result.recommendations.push("Analyze corrected responses for systematic prompt improvements");
      }

    } catch (err) {
      logger.warn({ err }, "Kaizen: Analysis failed");
    }

    logger.info({ patterns: result.patterns.length, recommendations: result.recommendations.length }, "Kaizen analysis completed");
    return result;
  }
}
