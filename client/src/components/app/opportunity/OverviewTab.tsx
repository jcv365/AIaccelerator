import { LifecycleStepper, StatusBadge } from "../../ui";
import { TRANSITIONS, type OpportunityDetailData } from "./types";

const LIFECYCLE_STEPS = [
  "DISCOVERED",
  "QUALIFIED",
  "HYPOTHESIS",
  "EXPERIMENT",
  "PROVING",
  "PROVEN",
];

export interface OverviewTabProps {
  opportunity: OpportunityDetailData;
  onStatusChange: (status: string) => void;
}

export function OverviewTab({ opportunity, onStatusChange }: OverviewTabProps) {
  const nextStatuses = TRANSITIONS[opportunity.status];
  const isTerminalOffPath = opportunity.status === "REJECTED" || opportunity.status === "NO_AI" || opportunity.status === "DEFERRED";

  return (
    <section>
      <StatusBadge label={opportunity.status} tone={opportunity.status === "PROVEN" ? "success" : "accent"} />
      {!isTerminalOffPath && <LifecycleStepper steps={LIFECYCLE_STEPS} currentStep={opportunity.status} />}

      <label>
        Status
        <select value={opportunity.status} onChange={(e) => onStatusChange(e.target.value)}>
          <option value={opportunity.status}>{opportunity.status}</option>
          {nextStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
