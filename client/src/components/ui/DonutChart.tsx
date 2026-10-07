import type { ReactNode } from "react";
import "./ui.css";

export interface DonutChartBreakdownItem {
  label: string;
  percent: number;
  /** A decorative glyph for the row; the label and number carry the meaning. */
  icon?: ReactNode;
}

export interface DonutChartProps {
  /** Overall percentage, or null when no scoring backend exists for this data yet. */
  score: number | null;
  breakdown: DonutChartBreakdownItem[];
  emptyMessage?: string;
  /** Small caption under the number inside the ring, e.g. "Overall Readiness". */
  centerLabel?: string;
}

const RADIUS = 58;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Colour only reinforces the number beside it: 75+ good, 50-74 fair, below that weak. */
function band(percent: number): "good" | "fair" | "weak" {
  if (percent >= 75) return "good";
  return percent >= 50 ? "fair" : "weak";
}

/**
 * Renders a ring plus a real <table> of the same data — an SVG ring with a
 * number in the middle is not itself accessible (DESIGN.md's Components
 * section / the general no-color-only-meaning rule). When `score` is null
 * (no scoring backend exists — see SCREENS.md APP-DASH), this renders a
 * plain "not available" state instead of fabricating a percentage.
 */
export function DonutChart({ score, breakdown, emptyMessage, centerLabel }: DonutChartProps) {
  if (score === null) {
    return (
      <div className="donut-row donut-row--empty">
        <p className="donut-empty-message">{emptyMessage ?? "Not available yet."}</p>
      </div>
    );
  }

  const filled = (Math.min(100, Math.max(0, score)) / 100) * CIRCUMFERENCE;
  const ringBand = score >= 70 ? "good" : band(score);

  return (
    <div className="donut-row">
      <svg className="donut-ring" width="148" height="148" viewBox="0 0 148 148" role="img" aria-label={`${score}%`}>
        <circle cx="74" cy="74" r={RADIUS} fill="none" className="donut-ring__track" strokeWidth="14" />
        <circle
          cx="74"
          cy="74"
          r={RADIUS}
          fill="none"
          className={`donut-ring__value donut-ring__value--${ringBand}`}
          strokeWidth="14"
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
          strokeLinecap="round"
          transform="rotate(-90 74 74)"
        />
        <text x="74" y={centerLabel ? 74 : 82} textAnchor="middle" className="donut-ring__number" fontSize="30" fontWeight="700">
          {score}%
        </text>
        {centerLabel && (
          <text textAnchor="middle" className="donut-ring__caption" fontSize="11">
            {/* Two short lines fit inside the ring: split the caption at its first space. */}
            <tspan x="74" y="92">
              {centerLabel.split(" ")[0]}
            </tspan>
            <tspan x="74" y="105">
              {centerLabel.split(" ").slice(1).join(" ")}
            </tspan>
          </text>
        )}
      </svg>
      {breakdown.length > 0 && (
        <table className="donut-table">
          <caption className="sr-only">Score breakdown</caption>
          <tbody>
            {breakdown.map((item) => (
              <tr key={item.label}>
                <td>
                  <span className={`donut-table__icon donut-table__icon--${band(item.percent)}`} aria-hidden="true">
                    {item.icon ?? <span className="donut-table__dot" />}
                  </span>
                  {item.label}
                </td>
                <td className={`donut-table__pct donut-table__pct--${band(item.percent)}`}>{item.percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
