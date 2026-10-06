// Shared shapes and helpers for the screens that read GET /opportunities.

export type Level = "HIGH" | "MEDIUM" | "LOW";

export interface LatestAssessment {
  id: string;
  category: string;
  estimatedAnnualValue: number | null;
  priority: Level;
  recommendation: "PROCEED_TO_POV" | "INVESTIGATE" | "STOP" | "NO_AI";
  confidence: number;
  effort: Level;
  risk: Level;
  whyBelieve: string[];
  couldDisprove: string[];
  rationale: string;
  model: string;
  createdAt: string;
}

export interface LatestDecision {
  id: string;
  decision: string;
  rationale: string | null;
  decidedAt: string;
}

export interface OpportunityRow {
  id: string;
  title: string;
  status: string;
  category: string | null;
  estimatedAnnualValue: number | null;
  priority: Level | null;
  evidenceScore: number | null;
  latestAssessment: LatestAssessment | null;
  latestDecision: LatestDecision | null;
  createdAt?: string;
  _count?: { evidence: number; decisions: number };
}

/** The user's own figure wins; the AI's is a fallback and is flagged as such by `valueSource`. */
export function effectiveValue(o: Pick<OpportunityRow, "estimatedAnnualValue" | "latestAssessment">): number | null {
  return o.estimatedAnnualValue ?? o.latestAssessment?.estimatedAnnualValue ?? null;
}

export function valueSource(o: Pick<OpportunityRow, "estimatedAnnualValue" | "latestAssessment">): "user" | "ai" | null {
  if (o.estimatedAnnualValue != null) return "user";
  return o.latestAssessment?.estimatedAnnualValue != null ? "ai" : null;
}

export function effectiveCategory(o: Pick<OpportunityRow, "category" | "latestAssessment">): string | null {
  return o.category ?? o.latestAssessment?.category ?? null;
}

export function effectivePriority(o: Pick<OpportunityRow, "priority" | "latestAssessment">): Level | null {
  return o.priority ?? o.latestAssessment?.priority ?? null;
}

/** Whole rand, compact for large figures: R1.2M, R450k, R900. */
export function formatRand(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1_000_000) return `R${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `R${Math.round(value / 1_000)}k`;
  return `R${value}`;
}
