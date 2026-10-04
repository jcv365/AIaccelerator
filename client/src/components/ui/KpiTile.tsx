import "./ui.css";

export interface KpiTileProps {
  value: string;
  label: string;
  /** Omit when there's nothing meaningful to compare against yet. */
  delta?: string;
}

/**
 * A single metric + label + optional delta. Per DESIGN.md: this is the
 * Dashboard's one approved use of a tile pattern (the project-wide KPI-row
 * waiver, 2026-10-01) — not a general-purpose card. Don't reuse it as a
 * substitute for a real table elsewhere.
 */
export function KpiTile({ value, label, delta }: KpiTileProps) {
  return (
    <div className="kpi-tile">
      <div className="kpi-tile__value">{value}</div>
      <div className="kpi-tile__label">{label}</div>
      {delta && <div className="kpi-tile__delta">{delta}</div>}
    </div>
  );
}
