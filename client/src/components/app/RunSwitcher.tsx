import type { AnalysisRunInfo } from "../../company/CompanyContext";
import "./app.css";

export const ALL_RUNS_VALUE = "__all__";

export function formatRunDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export interface RunSwitcherProps {
  runs: AnalysisRunInfo[];
  runId: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * Top-bar picker for the analysis run: every screen then shows only what that run found, so it is a snapshot of the
 * company at that point in time. "All runs" shows everything together. Hidden when there is nothing to choose.
 */
export function RunSwitcher({ runs, runId, onSelect }: RunSwitcherProps) {
  if (runs.length === 0) return null;
  return (
    <label className="company-switcher">
      <span className="company-switcher__label">Analysis</span>
      <select
        value={runId ?? ALL_RUNS_VALUE}
        onChange={(e) => onSelect(e.target.value === ALL_RUNS_VALUE ? null : e.target.value)}
        aria-label="Switch analysis run"
      >
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {formatRunDate(r.createdAt)} · {r.opportunities} {r.opportunities === 1 ? "opportunity" : "opportunities"}
          </option>
        ))}
        <option value={ALL_RUNS_VALUE}>All runs together</option>
      </select>
    </label>
  );
}
