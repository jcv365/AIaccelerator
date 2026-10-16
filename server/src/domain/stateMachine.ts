export type OpportunityStatus =
  | "DISCOVERED"
  | "QUALIFIED"
  | "HYPOTHESIS"
  | "EXPERIMENT"
  | "PROVING"
  | "PROVEN"
  | "REJECTED"
  | "DEFERRED"
  | "NO_AI";

const TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
  DISCOVERED: ["QUALIFIED", "REJECTED"],
  QUALIFIED: ["HYPOTHESIS", "NO_AI", "REJECTED", "DEFERRED"],
  HYPOTHESIS: ["EXPERIMENT", "REJECTED", "DEFERRED"],
  EXPERIMENT: ["PROVING", "REJECTED", "DEFERRED"],
  PROVING: ["PROVEN", "REJECTED"],
  DEFERRED: ["QUALIFIED", "REJECTED"],
  PROVEN: [],
  REJECTED: [],
  NO_AI: [],
};

export function isValidTransition(from: OpportunityStatus, to: OpportunityStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function validTransitionsFrom(status: OpportunityStatus): OpportunityStatus[] {
  return TRANSITIONS[status];
}

/** Stages in the order people read them, with the label the app shows. */
const STAGE_ORDER: OpportunityStatus[] = [
  "DISCOVERED", "QUALIFIED", "HYPOTHESIS", "EXPERIMENT", "PROVING", "PROVEN", "REJECTED", "DEFERRED", "NO_AI",
];

export const STAGE_LABELS: Record<OpportunityStatus, string> = {
  DISCOVERED: "Discovered",
  QUALIFIED: "Qualified",
  HYPOTHESIS: "Hypothesis",
  EXPERIMENT: "Experiment",
  PROVING: "Proving",
  PROVEN: "Proven",
  REJECTED: "Rejected",
  DEFERRED: "Deferred",
  NO_AI: "No AI needed",
};

/** Moves that end an opportunity's journey say why, and the reason is kept as a decision. */
export const REASON_REQUIRED_STATUSES: OpportunityStatus[] = ["REJECTED", "NO_AI", "PROVEN"];

/** Moves that must pass a checklist first (see gates.ts). */
export const GATED_MOVES: ReadonlyArray<{ from: OpportunityStatus; to: OpportunityStatus }> = [
  { from: "QUALIFIED", to: "HYPOTHESIS" },
];

export const requiresReason = (to: OpportunityStatus): boolean => REASON_REQUIRED_STATUSES.includes(to);

export const isGatedMove = (from: OpportunityStatus, to: OpportunityStatus): boolean =>
  GATED_MOVES.some((m) => m.from === from && m.to === to);

export interface StageInfo {
  status: OpportunityStatus;
  label: string;
  /** True when nothing can follow, so the opportunity's journey has ended. */
  terminal: boolean;
  next: Array<{ status: OpportunityStatus; label: string; requiresReason: boolean; gated: boolean }>;
}

/** Everything the client needs to draw stage menus, so it does not keep its own copy of the rules. */
export function stageCatalog(): StageInfo[] {
  return STAGE_ORDER.map((status) => ({
    status,
    label: STAGE_LABELS[status],
    terminal: TRANSITIONS[status].length === 0,
    next: TRANSITIONS[status].map((to) => ({
      status: to,
      label: STAGE_LABELS[to],
      requiresReason: requiresReason(to),
      gated: isGatedMove(status, to),
    })),
  }));
}
