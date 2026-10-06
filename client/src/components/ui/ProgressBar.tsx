import "./ui.css";

export interface ProgressBarProps {
  /** 0-100. Values outside the range are clamped. */
  percent: number;
  /** Accessible name, e.g. "Days elapsed". */
  label: string;
  tone?: "accent" | "success" | "caution" | "danger" | "purple";
}

/** A horizontal bar for a known fraction. The label gives it a name and the value is exposed as text, never colour alone. */
export function ProgressBar({ percent, label, tone = "accent" }: ProgressBarProps) {
  const value = Math.round(Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0)));
  return (
    <div
      className="progress-bar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <div className={`progress-bar__fill progress-bar__fill--${tone}`} style={{ width: `${value}%` }} />
    </div>
  );
}
