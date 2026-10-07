import { StatusBadge } from "./StatusBadge";

export type PriorityValue = "HIGH" | "MEDIUM" | "LOW";

export interface PriorityBadgeProps {
  /** null/undefined means nobody (user or AI) has set one; the badge says so instead of guessing. */
  priority: PriorityValue | null | undefined;
}

const LABEL: Record<PriorityValue, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
// High green, Medium blue, Low red - the mockup's pills. The word is always shown, so colour only reinforces it.
const TONE = { HIGH: "success", MEDIUM: "accent", LOW: "danger" } as const;

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  if (!priority) return <span className="priority-unset">Not set</span>;
  return <StatusBadge label={LABEL[priority]} tone={TONE[priority]} />;
}
