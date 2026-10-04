import "./ui.css";

export interface StatusBadgeProps {
  label: string;
  tone?: "default" | "accent" | "caution" | "danger" | "success";
}

export function StatusBadge({ label, tone = "default" }: StatusBadgeProps) {
  const toneClass = tone === "default" ? "" : ` status-badge--${tone}`;
  return <span className={`status-badge${toneClass}`}>{label}</span>;
}
