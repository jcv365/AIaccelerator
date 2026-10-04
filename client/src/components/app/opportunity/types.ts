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

export const TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
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

export interface Evidence {
  id: string;
  claim: string;
  type: string;
}

export interface Decision {
  id: string;
  decision: string;
}

export interface Learning {
  id: string;
  insight: string;
}

export interface Experiment {
  id: string;
  title: string;
  method: string;
  status: string;
  resultSummary: string | null;
  success: boolean | null;
  learnings: Learning[];
}

export interface OpportunityDetailData {
  id: string;
  title: string;
  status: OpportunityStatus;
  hypothesis: string | null;
  evidence: Evidence[];
  decisions: Decision[];
  experiments: Experiment[];
}
