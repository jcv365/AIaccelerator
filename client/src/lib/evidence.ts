import type { Level } from "./opportunity";

export interface EvidenceQuality {
  credibility: Level;
  applicability: Level;
  depth: Level;
  relevance: Level;
  rationale: string;
}

export interface EvidenceRow {
  id: string;
  claim: string;
  type: string;
  confidence?: number | null;
  source?: string | null;
  location?: string | null;
  excerpt?: string | null;
  capturedAt: string;
  quality?: EvidenceQuality | null;
  qualityModel?: string | null;
  qualityAt?: string | null;
  opportunity: { id: string; title: string };
}

const DAY_MS = 86_400_000;

/**
 * Recency comes from the capture date, never from the AI. Same thresholds as the server's scoring:
 * up to a year old is HIGH, up to two years MEDIUM, older LOW.
 */
export function recencyLevel(capturedAt: string, now: number = Date.now()): Level {
  const ageDays = (now - new Date(capturedAt).getTime()) / DAY_MS;
  if (Number.isNaN(ageDays) || ageDays > 730) return "LOW";
  return ageDays <= 365 ? "HIGH" : "MEDIUM";
}

export const LEVEL_LABEL: Record<Level, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
