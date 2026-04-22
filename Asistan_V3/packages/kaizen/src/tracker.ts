/**
 * KaizenTracker — Logs every LLM decision for self-improvement
 *
 * Pattern: Every LLM call logs input, output, confidence, context.
 * Analyzer scans for patterns. Optimizer generates better prompts.
 */

import crypto from "crypto";
import { SupabaseService, logger } from "@sandaluci/core";
import type { PromptDecision } from "@sandaluci/core";

export class KaizenTracker {
  private static instance: KaizenTracker;
  private db: SupabaseService;
  private currentVersion: string;

  private constructor() {
    this.db = SupabaseService.getInstance();
    this.currentVersion = "3.0.0";
  }

  public static getInstance(): KaizenTracker {
    if (!KaizenTracker.instance) {
      KaizenTracker.instance = new KaizenTracker();
    }
    return KaizenTracker.instance;
  }

  async log(decision: {
    input: string;
    output: string;
    context?: Record<string, unknown>;
    confidence?: number;
    interactionType?: PromptDecision["interactionType"];
  }): Promise<void> {
    const inputHash = crypto.createHash("sha256").update(decision.input).digest("hex").slice(0, 16);

    try {
      await this.db.logPromptDecision({
        promptVersion: this.currentVersion,
        inputHash,
        inputSummary: decision.input.slice(0, 200),
        output: decision.output,
        context: decision.context,
        confidence: decision.confidence,
        outcome: "unknown",
        interactionType: decision.interactionType,
      });
    } catch (err) {
      logger.warn({ err }, "Kaizen: Failed to log decision");
    }
  }

  async recordOutcome(inputHash: string, outcome: "correct" | "corrected" | "rejected", feedback?: string): Promise<void> {
    // In a full implementation, this would update the decision record
    logger.info({ inputHash, outcome, feedback }, "Kaizen: Outcome recorded");
  }

  setVersion(version: string): void {
    this.currentVersion = version;
    logger.info({ version }, "Kaizen: Prompt version updated");
  }

  getVersion(): string {
    return this.currentVersion;
  }
}
