import "./ui.css";

export interface ProgressIndicatorProps {
  label: string;
}

export function ProgressIndicator({ label }: ProgressIndicatorProps) {
  return (
    <span className="progress-indicator" role="status" aria-live="polite">
      <span className="progress-indicator__spinner" aria-hidden="true" />
      {label}
    </span>
  );
}
