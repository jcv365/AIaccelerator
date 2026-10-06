// Deterministic evidence scoring: no AI call, so the same rows always give the same number.
// An opportunity's score only exists once at least one of its evidence rows has been quality-assessed;
// otherwise it is null (the UI says "not scored"), never a guessed figure.

export type Level = "HIGH" | "MEDIUM" | "LOW";

export interface EvidenceQuality {
  credibility: Level;
  applicability: Level;
  depth: Level;
  relevance: Level;
  rationale: string;
}

export interface ScorableEvidence {
  quality?: unknown;
  confidence?: number | null;
  capturedAt?: Date | string | null;
}

const LEVEL_VALUE: Record<Level, number> = { HIGH: 1, MEDIUM: 0.6, LOW: 0.3 };
const DAY_MS = 24 * 60 * 60 * 1000;

function isLevel(value: unknown): value is Level {
  return value === "HIGH" || value === "MEDIUM" || value === "LOW";
}

/** The stored quality JSON if it has the expected shape, otherwise null. */
export function readQuality(value: unknown): EvidenceQuality | null {
  if (!value || typeof value !== "object") return null;
  const q = value as Record<string, unknown>;
  if (!isLevel(q.credibility) || !isLevel(q.applicability) || !isLevel(q.depth) || !isLevel(q.relevance)) return null;
  return {
    credibility: q.credibility,
    applicability: q.applicability,
    depth: q.depth,
    relevance: q.relevance,
    rationale: typeof q.rationale === "string" ? q.rationale : "",
  };
}

/** How fresh the evidence is, from when it was captured. Computed, never asked of the AI. */
export function recencyLevel(capturedAt: Date | string | null | undefined, now: Date = new Date()): Level {
  if (!capturedAt) return "LOW";
  const captured = new Date(capturedAt).getTime();
  if (Number.isNaN(captured)) return "LOW";
  const ageDays = (now.getTime() - captured) / DAY_MS;
  if (ageDays <= 365) return "HIGH";
  if (ageDays <= 730) return "MEDIUM";
  return "LOW";
}

const RECENCY_FACTOR: Record<Level, number> = { HIGH: 1, MEDIUM: 0.85, LOW: 0.7 };

/** 0-100 for the evidence behind one opportunity, or null when none of it has been quality-assessed. */
export function computeEvidenceScore(evidence: ScorableEvidence[], now: Date = new Date()): number | null {
  const scores: number[] = [];
  for (const item of evidence) {
    const quality = readQuality(item.quality);
    if (!quality) continue;
    const criteria = [quality.credibility, quality.applicability, quality.depth, quality.relevance];
    const qualityScore = criteria.reduce((sum, level) => sum + LEVEL_VALUE[level], 0) / criteria.length;
    const confidence = typeof item.confidence === "number" ? Math.min(1, Math.max(0, item.confidence)) : null;
    const blended = confidence === null ? qualityScore : 0.7 * qualityScore + 0.3 * confidence;
    scores.push(blended * RECENCY_FACTOR[recencyLevel(item.capturedAt, now)]);
  }
  if (scores.length === 0) return null;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(mean * 100);
}
