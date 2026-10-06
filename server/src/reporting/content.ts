import { z } from "zod";

// The canonical, structured content of a company-level report. Everything the four files (C-level and
// technical deck, C-level and technical proposal) show comes from this one object, so the files can never
// disagree with each other, and any file can be rebuilt later without asking an AI again.
//
// Limits are deliberate: they keep slides and pages from overflowing and they cap what a model can emit.
// Facts that must be exact (evidence counts, titles, sources) are NOT written by the model: code sets them
// from the database and the quality gates re-check them.

const text = (max: number) => z.string().trim().min(1).max(max);
const sourceIds = z.array(z.string().regex(/^S\d{1,3}$/)).max(8).default([]);

export const RATINGS = ["HIGH", "MEDIUM", "LOW"] as const;
export const ratingSchema = z.enum(RATINGS);
export type Rating = z.infer<typeof ratingSchema>;

export const DATA_STATUSES = ["PUBLIC_EVIDENCE", "ASSUMPTION", "TO_CONFIRM"] as const;

export const evidenceCountsSchema = z.object({
  facts: z.number().int().min(0),
  inferences: z.number().int().min(0),
  assumptions: z.number().int().min(0),
  hypotheses: z.number().int().min(0),
});
export type EvidenceCounts = z.infer<typeof evidenceCountsSchema>;

export const opportunityEntrySchema = z.object({
  opportunityId: z.string().min(1).max(64),
  rank: z.number().int().min(1).max(12),
  summary: text(500),
  whyItMatters: text(500),
  feasibility: text(400),
  risks: z.array(text(200)).min(1).max(5),
  dataNeeded: z.array(text(160)).max(6),
  firstStep: text(300),
  ratings: z.object({ value: ratingSchema, feasibility: ratingSchema, risk: ratingSchema, confidence: ratingSchema }),
  ratingRationale: text(400),
  /** Written by code from the database, never by the model. */
  evidence: evidenceCountsSchema,
  sourceIds,
});
export type OpportunityEntry = z.infer<typeof opportunityEntrySchema>;

export const reportContentSchema = z.object({
  schemaVersion: z.literal(1),
  company: z.object({
    name: text(120),
    website: z.string().max(200).nullable(),
    summary: text(700),
  }),
  executive: z.object({
    headline: text(120),
    paragraphs: z.array(text(900)).min(2).max(4),
    recommendation: text(500),
    boardAsk: text(400),
  }),
  priorities: z.array(z.object({ priority: text(200), sourceIds })).min(1).max(6),
  opportunities: z.array(opportunityEntrySchema).min(1).max(12),
  roadmap: z.object({
    phases: z
      .array(
        z.object({
          name: text(80),
          duration: text(40),
          objectives: z.array(text(200)).min(1).max(4),
          deliverables: z.array(text(160)).max(4),
        })
      )
      .min(2)
      .max(5),
  }),
  risks: z
    .array(z.object({ risk: text(200), likelihood: ratingSchema, impact: ratingSchema, mitigation: text(300) }))
    .min(3)
    .max(8),
  technical: z.object({
    architecture: z
      .array(
        z.object({
          opportunityId: z.string().min(1).max(64),
          components: z.array(z.object({ name: text(60), role: text(160) })).min(3).max(7),
          notes: text(400),
        })
      )
      .min(1)
      .max(4),
    dataRequirements: z
      .array(
        z.object({
          source: text(120),
          neededFor: text(160),
          status: z.enum(DATA_STATUSES),
          sourceIds,
        })
      )
      .min(1)
      .max(10),
    integration: z.array(text(220)).min(1).max(6),
    security: z.array(text(220)).min(1).max(6),
    pov: z.object({ scope: text(300), successMetric: text(300), goNoGo: text(300) }),
  }),
  evidenceNote: text(600),
  assumptions: z.array(text(240)).min(1).max(8),
  openQuestions: z.array(text(240)).min(1).max(8),
  glossary: z.array(z.object({ term: text(60), definition: text(240) })).max(12),
});

export type ReportContent = z.infer<typeof reportContentSchema>;

/** The report sections the model writes, one call each (see generate.ts). */
export const SECTION_KEYS = ["company", "executive", "priorities", "roadmap", "risks", "technical", "notes"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
