import { z } from "zod";

export const WikiPageTypeSchema = z.enum([
  "department",
  "order",
  "person",
  "procedure",
  "product",
  "concept",
  "synthesis",
]);

export const WikiPageSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
  pageType: WikiPageTypeSchema,
  tags: z.array(z.string()).default([]),
  sourceRefs: z.array(z.string()).default([]),
  outgoingLinks: z.array(z.string()).default([]),
  incomingLinks: z.array(z.string()).default([]),
  lastLintStatus: z.enum(["healthy", "stale", "orphan", "contradiction"]).optional(),
  lintNotes: z.string().optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});

export const WikiChangelogSchema = z.object({
  id: z.string().uuid().optional(),
  pageSlug: z.string().min(1),
  changeType: z.enum(["created", "updated", "contradiction_flagged", "linted", "merged"]),
  diffSummary: z.string().optional(),
  triggeredBy: z.enum(["interaction", "cron", "manual"]),
  createdAt: z.string().datetime({ offset: true }).optional(),
});

export const WikiLogEntrySchema = z.object({
  date: z.string(),
  operation: z.enum(["ingest", "query", "lint"]),
  title: z.string(),
  details: z.array(z.string()).default([]),
  affectedPages: z.array(z.string()).default([]),
});

export type WikiPageType = z.infer<typeof WikiPageTypeSchema>;
export type WikiPage = z.infer<typeof WikiPageSchema>;
export type WikiChangelog = z.infer<typeof WikiChangelogSchema>;
export type WikiLogEntry = z.infer<typeof WikiLogEntrySchema>;
