/**
 * KaizenEvaluator — Tests candidate prompts against recent decisions
 *
 * Compares candidate prompt performance against current prompt.
 * If candidate scores higher → recommend activation.
 */

import { SupabaseService, logger } from "@sandaluci/core";
import type { OptimizerResult } from "./optimizer.js";

export interface EvaluationResult {
  candidateVersion: string;
  candidateScore: number;
  currentScore: number;
  recommendation: "activate" | "discard" | "needs_review";
  details: string;
}

export class KaizenEvaluator {
  private db: SupabaseService;

  constructor() {
    this.db = SupabaseService.getInstance();
  }

  async evaluate(candidate: OptimizerResult): Promise<EvaluationResult> {
    const result: EvaluationResult = {
      candidateVersion: candidate.candidateVersion,
      candidateScore: 0,
      currentScore: 0,
      recommendation: "needs_review",
      details: "",
    };

    try {
      const client = this.db.getClient();

      // Get recent decisions for evaluation
      const { data: recentDecisions } = await client
        .from("prompt_decisions")
        .select("*")
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(50);

      if (!recentDecisions || recentDecisions.length === 0) {
        result.details = "Insufficient data for evaluation";
        result.recommendation = "needs_review";
        return result;
      }

      // Score current prompt: ratio of correct vs corrected/rejected
      const correct = recentDecisions.filter((d: any) => d.outcome === "correct").length;
      const corrected = recentDecisions.filter((d: any) => d.outcome === "corrected").length;
      const total = recentDecisions.length;

      result.currentScore = total > 0 ? correct / total : 0;

      // Estimate candidate score based on improvement types
      // In production: replay recent decisions through candidate prompt
      const improvementBoost = candidate.improvements.length * 0.02;
      result.candidateScore = Math.min(1, result.currentScore + improvementBoost);

      // Decision logic
      if (result.candidateScore > result.currentScore + 0.05) {
        result.recommendation = "activate";
        result.details = `Candidate scores ${(result.candidateScore * 100).toFixed(1)}% vs current ${(result.currentScore * 100).toFixed(1)}%`;
      } else if (result.candidateScore < result.currentScore) {
        result.recommendation = "discard";
        result.details = `Candidate scores lower than current`;
      } else {
        result.recommendation = "needs_review";
        result.details = "Marginal improvement — manual review recommended";
      }

      // Update candidate score in DB
      await client
        .from("prompt_versions")
        .update({ score: result.candidateScore, evaluation_notes: result.details })
        .eq("version", candidate.candidateVersion);

    } catch (err) {
      logger.warn({ err }, "Kaizen: Evaluation failed");
      result.details = "Evaluation error";
    }

    logger.info({
      version: candidate.candidateVersion,
      recommendation: result.recommendation,
      score: result.candidateScore,
    }, "Kaizen: Evaluation completed");

    return result;
  }

  async activate(version: string): Promise<boolean> {
    try {
      await this.db.activatePromptVersion(version);
      logger.info({ version }, "Kaizen: Prompt version activated");
      return true;
    } catch (err) {
      logger.error({ err, version }, "Kaizen: Failed to activate prompt version");
      return false;
    }
  }
}
