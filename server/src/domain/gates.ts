// The checklist an opportunity must meet to move from Qualified to Hypothesis ("ready to be a use case").
// Pure functions only: the routes load the data, this decides.

export type GateFix = "overview" | "reasoning" | "evidence";

export interface GateCriterion {
  key: "problem" | "owner" | "value" | "hypothesis" | "data" | "suitability" | "evidence" | "risks";
  label: string;
  met: boolean;
  /** Why it is not met; absent when it is. */
  reason?: string;
  /** Which tab of the opportunity page fixes it. */
  fix: GateFix;
}

export interface GateResult {
  to: "HYPOTHESIS";
  met: boolean;
  criteria: GateCriterion[];
}

export interface GateOpportunity {
  businessProblem?: string | null;
  owner?: string | null;
  potentialValue?: string | null;
  estimatedAnnualValue?: number | null;
  hypothesis?: string | null;
  dependencies?: string | null;
  aiSuitability?: string | null;
  risks?: string | null;
  /** Fields the scan drafted that nobody has saved since. */
  aiDraftFields: string[];
}

export interface GateEvidence {
  type: string;
  documentId: string | null;
}

export const MIN_PROBLEM_LENGTH = 40;
const NOT_FILLED_IN = "Not filled in yet";
const AI_DRAFT = "AI draft: review it, then save it";

// "...measured by days to settle", "KPI: days to settle", "Metric: days to settle"
const METRIC_PHRASE = /measured\s+(by|in|as)\s+\S+|\b(kpi|metric)s?\b[:\s]+\S+/i;

const filled = (value: string | null | undefined): boolean => typeof value === "string" && value.trim() !== "";

/** A free-text field a person must have written or reviewed. */
function reviewedText(
  value: string | null | undefined,
  field: string,
  drafts: string[]
): { met: boolean; reason?: string } {
  if (!filled(value)) return { met: false, reason: NOT_FILLED_IN };
  if (drafts.includes(field)) return { met: false, reason: AI_DRAFT };
  return { met: true };
}

export function evaluateHypothesisGate(opp: GateOpportunity, evidence: GateEvidence[]): GateResult {
  const drafts = opp.aiDraftFields;
  const criteria: GateCriterion[] = [];
  const add = (key: GateCriterion["key"], label: string, fix: GateFix, result: { met: boolean; reason?: string }) =>
    criteria.push({ key, label, fix, met: result.met, ...(result.met ? {} : { reason: result.reason }) });

  add("problem", "Business problem described", "overview",
    filled(opp.businessProblem) && opp.businessProblem!.trim().length >= MIN_PROBLEM_LENGTH
      ? { met: true }
      : { met: false, reason: `Describe the problem in at least ${MIN_PROBLEM_LENGTH} characters` });

  add("owner", "Owner named", "overview", filled(opp.owner) ? { met: true } : { met: false, reason: NOT_FILLED_IN });

  // Either the words or the figure will do, as long as one of them has been reviewed.
  const words = reviewedText(opp.potentialValue, "potentialValue", drafts);
  const figure =
    typeof opp.estimatedAnnualValue === "number"
      ? drafts.includes("estimatedAnnualValue")
        ? { met: false, reason: AI_DRAFT }
        : { met: true }
      : { met: false, reason: NOT_FILLED_IN };
  add("value", "Value estimated", "overview",
    words.met || figure.met
      ? { met: true }
      : { met: false, reason: words.reason === AI_DRAFT || figure.reason === AI_DRAFT ? AI_DRAFT : NOT_FILLED_IN });

  const hypothesis = reviewedText(opp.hypothesis, "hypothesis", drafts);
  add("hypothesis", "Testable hypothesis with a metric", "reasoning",
    hypothesis.met && !METRIC_PHRASE.test(opp.hypothesis!)
      ? { met: false, reason: 'Say how success is measured, for example "measured by days to settle"' }
      : hypothesis);

  add("data", "Data needed named", "overview", reviewedText(opp.dependencies, "dependencies", drafts));
  add("suitability", "AI suitability assessed", "overview", reviewedText(opp.aiSuitability, "aiSuitability", drafts));

  const backedFact = evidence.some((e) => e.type === "FACT" && e.documentId !== null);
  add("evidence", "At least one fact backed by an uploaded document", "evidence",
    backedFact ? { met: true } : { met: false, reason: "No fact is backed by an uploaded document yet" });

  add("risks", "Risks recorded", "overview", reviewedText(opp.risks, "risks", drafts));

  return { to: "HYPOTHESIS", met: criteria.every((c) => c.met), criteria };
}
