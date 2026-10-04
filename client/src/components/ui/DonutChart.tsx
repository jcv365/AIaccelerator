import "./ui.css";

export interface DonutChartBreakdownItem {
  label: string;
  percent: number;
}

export interface DonutChartProps {
  /** Overall percentage, or null when no scoring backend exists for this data yet. */
  score: number | null;
  breakdown: DonutChartBreakdownItem[];
  emptyMessage?: string;
}

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Renders a ring plus a real <table> of the same data — an SVG ring with a
 * number in the middle is not itself accessible (DESIGN.md's Components
 * section / the general no-color-only-meaning rule). When `score` is null
 * (no scoring backend exists — see SCREENS.md APP-DASH), this renders a
 * plain "not available" state instead of fabricating a percentage.
 */
export function DonutChart({ score, breakdown, emptyMessage }: DonutChartProps) {
  if (score === null) {
    return (
      <div className="donut-row donut-row--empty">
        <p className="donut-empty-message">{emptyMessage ?? "Not available yet."}</p>
      </div>
    );
  }

  const filled = (score / 100) * CIRCUMFERENCE;

  return (
    <div className="donut-row">
      <svg className="donut-ring" width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`${score}%`}>
        <circle cx="56" cy="56" r={RADIUS} fill="none" stroke="var(--color-border)" strokeWidth="12" />
        <circle
          cx="56"
          cy="56"
          r={RADIUS}
          fill="none"
          stroke="var(--color-accent-blue)"
          strokeWidth="12"
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
          strokeLinecap="round"
          transform="rotate(-90 56 56)"
        />
        <text x="56" y="61" textAnchor="middle" fill="var(--color-text)" fontSize="20" fontWeight="600">
          {score}%
        </text>
      </svg>
      <table className="donut-table">
        <caption className="sr-only">Score breakdown</caption>
        <tbody>
          {breakdown.map((item) => (
            <tr key={item.label}>
              <td>{item.label}</td>
              <td>{item.percent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
