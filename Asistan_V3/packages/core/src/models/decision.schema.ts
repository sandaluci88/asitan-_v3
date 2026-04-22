import { z } from "zod";

export const DecisionOutcomeSchema = z.enum([
  "correct",
  "corrected",
  "rejected",
  "unknown",
]);

export const PromptDecisionSchema = z.object({
  id: z.string().uuid().optional(),
  promptVersion: z.string().min(1),
  inputHash: z.string(),
  inputSummary: z.string().optional(),
  output: z.string(),
  context: z.record(z.unknown()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  outcome: DecisionOutcomeSchema.default("unknown"),
  userFeedback: z.string().optional(),
  interactionType: z.enum(["order_status", "production_request", "general", "distribution", "staff_management"]).optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
});

export const PromptVersionSchema = z.object({
  id: z.string().uuid().optional(),
  version: z.string().min(1),
  content: z.string(),
  score: z.number().default(0),
  isActive: z.boolean().default(false),
  wikiContextUsed: z.array(z.string()).default([]),
  evaluationNotes: z.string().optional(),
  activatedAt: z.string().datetime({ offset: true }).optional(),
  deactivatedAt: z.string().datetime({ offset: true }).optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
});

export type DecisionOutcome = z.infer<typeof DecisionOutcomeSchema>;
export type PromptDecision = z.infer<typeof PromptDecisionSchema>;
export type PromptVersion = z.infer<typeof PromptVersionSchema>;
