import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to share mutable state with mocked modules
const { mockLogPromptDecision, mockGetActivePromptVersion, mockQuery, getMockDecisions, setMockDecisions } = vi.hoisted(() => {
  let mockDecisions: any[] = [];
  return {
    mockLogPromptDecision: vi.fn(async () => {}),
    mockGetActivePromptVersion: vi.fn(async () => null),
    mockQuery: vi.fn(async () => ({ context: "", sources: [] })),
    getMockDecisions: () => mockDecisions,
    setMockDecisions: (d: any[]) => { mockDecisions = d; },
  };
});

vi.mock("@sandaluci/core", () => ({
  SupabaseService: {
    getInstance: () => ({
      logPromptDecision: mockLogPromptDecision,
      getActivePromptVersion: mockGetActivePromptVersion,
      activatePromptVersion: vi.fn(async () => {}),
      getClient: () => ({
        from: (table: string) => {
          const result = {
            data: table === "prompt_decisions" ? getMockDecisions() : [],
            error: null,
          };
          const chain: any = {
            select: () => chain,
            gte: () => chain,
            order: () => chain,
            limit: () => Promise.resolve(result),
            insert: () => Promise.resolve({ error: null }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
            then: (resolve: any) => Promise.resolve(result).then(resolve),
          };
          return chain;
        },
      }),
    }),
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@sandaluci/wiki", () => {
  class MockWikiEngine {
    query = mockQuery;
  }
  return { WikiEngine: MockWikiEngine };
});

describe("Kaizen — Faz 4 (D1-D8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockDecisions([]);
  });

  // D1: LLM çağrısı sonrası KaizenTracker.log() çağrılır
  it("D1: tracker.log() records LLM decision with input/output", async () => {
    const { KaizenTracker } = await import("../packages/kaizen/src/tracker.js");
    const tracker = KaizenTracker.getInstance();

    await tracker.log({
      input: "Siparişler ne durumda?",
      output: "3 aktif sipariş var",
      confidence: 0.85,
      interactionType: "order_status",
    });

    expect(mockLogPromptDecision).toHaveBeenCalledOnce();
    const call = mockLogPromptDecision.mock.calls[0][0];
    expect(call.promptVersion).toBe("3.0.0");
    expect(call.confidence).toBe(0.85);
    expect(call.interactionType).toBe("order_status");
  });

  // D2: Low confidence (<0.5) pattern tespiti
  it("D2: analyzer detects low_confidence pattern when >3 decisions < 0.5", async () => {
    setMockDecisions(Array.from({ length: 5 }, (_, i) => ({
      id: `d_${i}`,
      confidence: 0.3,
      input_summary: `Low confidence query ${i}`,
      outcome: "correct",
      user_feedback: null,
    })));

    const { KaizenAnalyzer } = await import("../packages/kaizen/src/analyzer.js");
    const analyzer = new KaizenAnalyzer();
    const result = await analyzer.analyze(7);

    expect(result.totalDecisions).toBe(5);
    const lowConfPatterns = result.patterns.filter(p => p.type === "low_confidence");
    expect(lowConfPatterns).toHaveLength(1);
    expect(lowConfPatterns[0].severity).toBe("medium");
  });

  // D3: Repeated mistake pattern tespiti
  it("D3: analyzer detects repeated_mistake pattern when >2 corrected outcomes", async () => {
    setMockDecisions(Array.from({ length: 4 }, (_, i) => ({
      id: `c_${i}`,
      confidence: 0.7,
      input_summary: `Mistake ${i}`,
      outcome: "corrected",
      user_feedback: `Feedback ${i}`,
    })));

    const { KaizenAnalyzer } = await import("../packages/kaizen/src/analyzer.js");
    const analyzer = new KaizenAnalyzer();
    const result = await analyzer.analyze(7);

    const mistakePatterns = result.patterns.filter(p => p.type === "repeated_mistake");
    expect(mistakePatterns).toHaveLength(1);
    expect(mistakePatterns[0].severity).toBe("high");
  });

  // D4: Candidate prompt üretimi
  it("D4: optimizer generates candidate prompt from analysis", async () => {
    mockGetActivePromptVersion.mockResolvedValueOnce({
      version: "3.0.0",
      content: "Current system prompt for Ayca",
    });

    const analysisResult = {
      date: "2026-04-28",
      totalDecisions: 20,
      patterns: [
        { type: "repeated_mistake" as const, description: "5 corrected", evidence: [], severity: "high" as const, affectedInteractions: [] },
      ],
      recommendations: ["Add examples"],
    };

    const { KaizenOptimizer } = await import("../packages/kaizen/src/optimizer.js");
    const optimizer = new KaizenOptimizer();
    const result = await optimizer.optimize(analysisResult);

    expect(result).not.toBeNull();
    expect(result!.candidateVersion).toBe("3.0.1");
    expect(result!.improvements).toContain("Add explicit examples for corrected cases");
    expect(result!.basedOnPatterns).toContain("repeated_mistake");
    expect(result!.candidatePrompt).toContain("Kaizen Improvements");
  });

  // D5: +5% iyileşme → activate
  it("D5: evaluator recommends 'activate' when candidate > current + 5%", async () => {
    // 70% correct → currentScore = 0.7, 3 improvements × 0.02 = 0.06 → candidate = 0.76 > 0.75
    setMockDecisions([
      ...Array.from({ length: 7 }, () => ({ outcome: "correct" })),
      ...Array.from({ length: 3 }, () => ({ outcome: "corrected" })),
    ]);

    const candidate = {
      candidateVersion: "3.0.1",
      candidatePrompt: "Improved prompt",
      improvements: ["fix1", "fix2", "fix3"],
      basedOnPatterns: ["repeated_mistake"],
    };

    const { KaizenEvaluator } = await import("../packages/kaizen/src/evaluator.js");
    const evaluator = new KaizenEvaluator();
    const result = await evaluator.evaluate(candidate);

    expect(result.recommendation).toBe("activate");
    expect(result.candidateScore).toBeGreaterThan(result.currentScore + 0.05);
  });

  // D6: Düşüş → needs_review
  it("D6: evaluator recommends 'needs_review' when candidate == current (no improvement)", async () => {
    setMockDecisions(Array.from({ length: 10 }, () => ({ outcome: "correct" })));

    const candidate = {
      candidateVersion: "3.0.2",
      candidatePrompt: "Same prompt",
      improvements: [],
      basedOnPatterns: [],
    };

    const { KaizenEvaluator } = await import("../packages/kaizen/src/evaluator.js");
    const evaluator = new KaizenEvaluator();
    const result = await evaluator.evaluate(candidate);

    expect(result.recommendation).toBe("needs_review");
    expect(result.candidateScore).toBe(result.currentScore);
  });

  // D7: Prompt versiyon izleme
  it("D7: tracker version can be set and retrieved", async () => {
    const { KaizenTracker } = await import("../packages/kaizen/src/tracker.js");
    const tracker = KaizenTracker.getInstance();

    expect(tracker.getVersion()).toBe("3.0.0");

    tracker.setVersion("3.0.5");
    expect(tracker.getVersion()).toBe("3.0.5");

    await tracker.log({ input: "test", output: "test" });
    const call = mockLogPromptDecision.mock.calls[0][0];
    expect(call.promptVersion).toBe("3.0.5");
  });

  // D8: Wiki context Kaizen optimizer'a dahil edilir
  it("D8: optimizer includes wiki context in prompt generation", async () => {
    mockQuery.mockResolvedValueOnce({
      context: "Prompt optimization: use shorter instructions",
      sources: ["procedures/prompt-optimization"],
    });

    mockGetActivePromptVersion.mockResolvedValueOnce({
      version: "3.0.0",
      content: "Current prompt",
    });

    const analysisResult = {
      date: "2026-04-28",
      totalDecisions: 10,
      patterns: [
        { type: "low_confidence" as const, description: "4 low conf", evidence: [], severity: "medium" as const, affectedInteractions: [] },
      ],
      recommendations: ["Improve context"],
    };

    const { KaizenOptimizer } = await import("../packages/kaizen/src/optimizer.js");
    const optimizer = new KaizenOptimizer();
    const result = await optimizer.optimize(analysisResult);

    expect(mockQuery).toHaveBeenCalledWith("prompt optimization system performance");
    expect(result).not.toBeNull();
  });
});
