import type { Rating, ReportContent } from "../content.js";
import type { SourceRef } from "../sources.js";

// Shared by the deck and document renderers: the template tokens from the approved mockups (navy and blue on
// light pages), the input type, and the wording that must be identical in every file (status line, labels).

export const THEME = {
  ink: "13203A",
  inkMuted: "51607A",
  blue: "2563EB",
  paper: "FFFFFF",
  paperSoft: "F3F6FB",
  rule: "D9E0EC",
  green: "15803D",
  amber: "B45309",
  red: "B91C1C",
  // Arial is on every machine and in the LibreOffice renderer, so layout checks match what clients see.
  font: "Arial",
} as const;

export type Audience = "C_LEVEL" | "TECHNICAL";

export interface RenderMeta {
  version: number;
  status: "DRAFT" | "APPROVED";
  generatedAt: Date;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  /** When the analysis run behind this report ran; absent means every run was combined. */
  analysisRanAt?: Date | null;
  /** The organisation named as author on the cover and in file properties. */
  author: string;
}

export interface RenderInput {
  content: ReportContent;
  sources: SourceRef[];
  /** Opportunity titles by id; the content holds ids only. */
  titles: Record<string, string>;
  meta: RenderMeta;
}

export const CONFIDENTIAL = "Confidential: prepared for the named client only";

export const AUDIENCE_LABEL: Record<Audience, string> = {
  C_LEVEL: "Executive briefing",
  TECHNICAL: "Technical briefing",
};

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** How the report's evidence was scoped: one dated analysis run, or all runs together. */
export function analysisLine(meta: RenderMeta): string {
  return meta.analysisRanAt ? `Analysis run of ${formatDate(meta.analysisRanAt)}` : "All analysis runs combined";
}

/** The one status line used on covers, footers and document control. */
export function statusLine(meta: RenderMeta): string {
  if (meta.status === "APPROVED") {
    const by = meta.approvedBy ? ` by ${meta.approvedBy}` : "";
    const on = meta.approvedAt ? ` on ${formatDate(meta.approvedAt)}` : "";
    return `Approved${by}${on}`;
  }
  return "DRAFT: AI-generated, verify before sharing";
}

export function titleFor(input: RenderInput, opportunityId: string): string {
  return input.titles[opportunityId] ?? "Untitled opportunity";
}

export function ratingLabel(r: Rating): string {
  return r === "HIGH" ? "High" : r === "MEDIUM" ? "Medium" : "Low";
}

/** Colour for a rating where HIGH is good (value, feasibility, confidence). */
export function goodRatingColor(r: Rating): string {
  return r === "HIGH" ? THEME.green : r === "MEDIUM" ? THEME.amber : THEME.red;
}

/** Colour for a rating where HIGH is bad (risk, likelihood, impact). */
export function badRatingColor(r: Rating): string {
  return r === "HIGH" ? THEME.red : r === "MEDIUM" ? THEME.amber : THEME.green;
}

export const DATA_STATUS_LABEL = {
  PUBLIC_EVIDENCE: "Public evidence",
  ASSUMPTION: "Assumption",
  TO_CONFIRM: "To confirm",
} as const;

export function evidenceSummary(e: { facts: number; inferences: number; assumptions: number; hypotheses: number }): string {
  return `${e.facts} fact${e.facts === 1 ? "" : "s"} · ${e.inferences} inference${e.inferences === 1 ? "" : "s"} · ${e.assumptions} assumption${e.assumptions === 1 ? "" : "s"} · ${e.hypotheses} AI hypothes${e.hypotheses === 1 ? "is" : "es"}`;
}

export function cite(ids: string[]): string {
  return ids.length ? ` [${ids.join(", ")}]` : "";
}

export function fileTitle(content: ReportContent, audience: Audience): string {
  return `${content.company.name}: AI opportunity assessment (${AUDIENCE_LABEL[audience].toLowerCase()})`;
}

export function sortedOpportunities(content: ReportContent) {
  return [...content.opportunities].sort((a, b) => a.rank - b.rank);
}
