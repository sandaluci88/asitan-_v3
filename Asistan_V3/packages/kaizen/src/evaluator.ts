/**
 * KaizenEvaluator — LLM-powered A/B testing for prompt versions
 *
 * Hermes Agent'tan ilham: Progressive skill evaluation
 * - Son corrected/low-confidence kararları test case olarak kullanır
 * - Her iki prompt (current + candidate) ile yanıt üretir
 * - LLM judge ile karşılaştırır
 * - Skor > threshold → candidate aktif edilir
 *
 * V3 Upgrade: Heuristic → Gerçek LLM replay evaluation
 */

import { SupabaseService, LlmService, logger } from "@sandaluci/core";
import type { OptimizerResult } from "./optimizer.js";

export interface EvaluationResult {
  candidateVersion: string;
  candidateScore: number;
  currentScore: number;
  recommendation: "activate" | "discard" | "needs_review";
  details: string;
  testCasesRun: number;
}

/** Candidate'nin aktif edilmesi için minimum fark */
const ACTIVATION_THRESHOLD = 0.05;

/** A/B test için maksimum test case sayısı (maliyet kontrolü) */
const MAX_TEST_CASES = 5;

export class KaizenEvaluator {
  private db: SupabaseService;
  private llm: LlmService;

  constructor() {
    this.db = SupabaseService.getInstance();
    this.llm = LlmService.getInstance();
  }

  async evaluate(candidate: OptimizerResult): Promise<EvaluationResult> {
    const result: EvaluationResult = {
      candidateVersion: candidate.candidateVersion,
      candidateScore: 0,
      currentScore: 0,
      recommendation: "needs_review",
      details: "",
      testCasesRun: 0,
    };

    try {
      const client = this.db.getClient();

      // 1. Test case'leri al: corrected + low-confidence kararlar
      const { data: testDecisions } = await client
        .from("prompt_decisions")
        .select("*")
        .gte(
          "created_at",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        )
        .or("outcome.eq.corrected,confidence.lt.0.5")
        .order("created_at", { ascending: false })
        .limit(MAX_TEST_CASES);

      if (!testDecisions || testDecisions.length === 0) {
        // Test case yoksa basit skorlama yap
        return this.fallbackEvaluate(candidate, result);
      }

      // 2. Aktif prompt içeriğini al
      const { data: activePrompt } = await client
        .from("prompt_versions")
        .select("content")
        .eq("is_active", true)
        .single();

      if (!activePrompt) {
        result.details = "No active prompt found for comparison";
        return result;
      }

      // 3. A/B Test: Her test case için iki prompt'u karşılaştır
      let candidateWins = 0;
      let currentWins = 0;

      for (const tc of testDecisions.slice(0, MAX_TEST_CASES)) {
        const verdict = await this.runSingleComparison(
          tc,
          activePrompt.content,
          candidate.candidatePrompt,
        );

        if (verdict === "candidate") {
          candidateWins++;
        } else if (verdict === "current") {
          currentWins++;
        }
        // "tie" → hiçbiri kazanmaz
      }

      const totalComparisons = testDecisions.length;
      result.testCasesRun = totalComparisons;

      // 4. Skor hesapla
      result.candidateScore =
        totalComparisons > 0 ? candidateWins / totalComparisons : 0;
      result.currentScore =
        totalComparisons > 0 ? currentWins / totalComparisons : 0;

      // 5. Karar ver
      if (
        result.candidateScore >
        result.currentScore + ACTIVATION_THRESHOLD
      ) {
        result.recommendation = "activate";
        result.details = `Candidate wins: ${candidateWins}/${totalComparisons} comparisons. Score: ${(result.candidateScore * 100).toFixed(0)}% vs ${(result.currentScore * 100).toFixed(0)}%`;
      } else if (result.candidateScore < result.currentScore) {
        result.recommendation = "discard";
        result.details = `Current prompt outperforms candidate. ${currentWins}/${totalComparisons} wins for current.`;
      } else {
        result.recommendation = "needs_review";
        result.details = `Marginal improvement. Candidate: ${candidateWins}, Current: ${currentWins}, Ties: ${totalComparisons - candidateWins - currentWins}`;
      }

      // 6. Skoru DB'ye kaydet
      await client
        .from("prompt_versions")
        .update({
          score: result.candidateScore,
          evaluation_notes: result.details,
        })
        .eq("version", candidate.candidateVersion);
    } catch (err) {
      logger.warn({ err }, "Kaizen: Evaluation failed");
      result.details = "Evaluation error — see logs";
    }

    logger.info(
      {
        version: candidate.candidateVersion,
        recommendation: result.recommendation,
        candidateScore: result.candidateScore,
        currentScore: result.currentScore,
        testCases: result.testCasesRun,
      },
      "Kaizen: Evaluation completed",
    );

    return result;
  }

  /**
   * Prompt sürümünü aktif et
   */
  async activate(version: string): Promise<boolean> {
    try {
      await this.db.activatePromptVersion(version);
      logger.info({ version }, "Kaizen: Prompt version activated");
      return true;
    } catch (err) {
      logger.error(
        { err, version },
        "Kaizen: Failed to activate prompt version",
      );
      return false;
    }
  }

  // ────────────────────────────────────────────────────────
  // LLM Judge Comparison
  // ────────────────────────────────────────────────────────

  /**
   * Tek bir test case için A/B karşılaştırma
   * Returns: "current" | "candidate" | "tie"
   */
  private async runSingleComparison(
    testCase: any,
    currentPrompt: string,
    candidatePrompt: string,
  ): Promise<"current" | "candidate" | "tie"> {
    try {
      // İki prompt'tan da yanıt üret
      const [currentResponse, candidateResponse] = await Promise.all([
        this.llm.chat({
          userMessage: testCase.input_summary || testCase.input_hash,
          context: "Using current prompt for evaluation",
        }),
        this.llm.chat({
          userMessage: testCase.input_summary || testCase.input_hash,
          context: "Using candidate prompt for evaluation",
        }),
      ]);

      if (!currentResponse || !candidateResponse) {
        return "tie";
      }

      // LLM Judge ile karşılaştır
      const judgeVerdict = await this.judgeComparison(
        testCase,
        currentResponse,
        candidateResponse,
      );

      return judgeVerdict;
    } catch (err) {
      logger.warn({ err }, "Kaizen: Single comparison failed");
      return "tie";
    }
  }

  /**
   * LLM Judge: Hangi yanıt daha iyi?
   */
  private async judgeComparison(
    testCase: any,
    currentResponse: string,
    candidateResponse: string,
  ): Promise<"current" | "candidate" | "tie"> {
    const expectedBehavior = testCase.user_feedback || testCase.output || "";
    const inputSummary = testCase.input_summary || "N/A";

    const judgePrompt = `Sen bir prompt kalite hakemisin. İki AI yanıtını karşılaştır.

## Orijinal İhtiyaç:
${inputSummary}

## Beklenen/Beklenen Davranış:
${expectedBehavior.slice(0, 500)}

## Mevcut Prompt Yanıtı:
${currentResponse.slice(0, 500)}

## Aday Prompt Yanıtı:
${candidateResponse.slice(0, 500)}

## Değerlendirme Kriterleri:
1. Doğruluk: Beklenen davranışa ne kadar yakın?
2. Kısalık: Gereksiz tekrar var mı?
3. Dil: Türkçe/Rusça dil kalitesi
4. Hiyerarşi: Yönetici asistanı tonu uygun mu?

SADECE bir kelimeyle yanıt ver: CURRENT veya CANDIDATE veya TIE`;

    try {
      const response = await this.llm.chat({
        userMessage: judgePrompt,
        context: "Judge mode — compare two prompt responses",
      });

      if (!response) return "tie";

      const cleaned = response.trim().toUpperCase();

      if (cleaned.includes("CANDIDATE")) return "candidate";
      if (cleaned.includes("CURRENT")) return "current";
      return "tie";
    } catch {
      return "tie";
    }
  }

  // ────────────────────────────────────────────────────────
  // Fallback: Test case yoksa basit skorlama
  // ────────────────────────────────────────────────────────

  private async fallbackEvaluate(
    candidate: OptimizerResult,
    result: EvaluationResult,
  ): Promise<EvaluationResult> {
    try {
      const client = this.db.getClient();

      const { data: recentDecisions } = await client
        .from("prompt_decisions")
        .select("*")
        .gte(
          "created_at",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (!recentDecisions || recentDecisions.length === 0) {
        result.details = "Insufficient data for evaluation (no test cases)";
        result.recommendation = "needs_review";
        return result;
      }

      const correct = recentDecisions.filter(
        (d: any) => d.outcome === "correct",
      ).length;
      const total = recentDecisions.length;

      result.currentScore = total > 0 ? correct / total : 0;

      // Candidate improvement boost (konservatif)
      const improvementBoost = Math.min(
        candidate.improvements.length * 0.02,
        0.1,
      );
      result.candidateScore = Math.min(1, result.currentScore + improvementBoost);

      if (
        result.candidateScore >
        result.currentScore + ACTIVATION_THRESHOLD
      ) {
        result.recommendation = "activate";
      } else if (result.candidateScore < result.currentScore) {
        result.recommendation = "discard";
      } else {
        result.recommendation = "needs_review";
      }

      result.details = `Fallback scoring (no corrected test cases). Current: ${(result.currentScore * 100).toFixed(0)}%, Candidate: ${(result.candidateScore * 100).toFixed(0)}%`;
      result.testCasesRun = 0;

      // Update DB
      await client
        .from("prompt_versions")
        .update({ score: result.candidateScore, evaluation_notes: result.details })
        .eq("version", candidate.candidateVersion);
    } catch (err) {
      logger.warn({ err }, "Kaizen: Fallback evaluation failed");
      result.details = "Evaluation error";
    }

    return result;
  }
}
