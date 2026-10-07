import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { useCompanyPath } from "../../company/CompanyContext";
import { Avatars, InlineAlert, PageHeader, ProgressBar, ProgressIndicator, StatusBadge, TabPanel, Tabs } from "../../components/ui";
import type { ExperimentStatusValue } from "../../domain/experimentStatus";
import "./pov.css";

interface ExperimentRow {
  id: string;
  title: string;
  status: string;
  success?: boolean | null;
  startedAt?: string | null;
  completedAt?: string | null;
  plannedDays?: number;
  team?: string[];
  opportunity: { id: string; title: string; category?: string | null };
  _count?: { learnings: number };
}

// Keyed by the shared status type, so adding a status in domain/experimentStatus.ts is a compile error here
// until it has a tab label. Key order is the tab order.
const STATUS_LABELS: Record<ExperimentStatusValue, string> = {
  RUNNING: "In progress",
  PLANNED: "Planned",
  COMPLETE: "Completed",
  ABANDONED: "Stopped",
};

const DAY_MS = 86_400_000;
const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Schedule for one row, derived from the start date and planned length. Nothing is stored for it. */
function schedule(r: ExperimentRow, now: number): { percent: number; text: string; date: string | null } {
  const planned = r.plannedDays ?? 14;
  if (r.status === "COMPLETE") {
    return { percent: 100, text: "Completed", date: r.completedAt ? shortDate(new Date(r.completedAt).getTime()) : null };
  }
  if (r.status === "ABANDONED") return { percent: 0, text: "Stopped", date: null };
  if (!r.startedAt) return { percent: 0, text: `Not started · ${planned}-day plan`, date: null };

  const start = new Date(r.startedAt).getTime();
  const end = start + planned * DAY_MS;
  const elapsed = Math.min(planned, Math.max(0, Math.floor((now - start) / DAY_MS)));
  const left = Math.ceil((end - now) / DAY_MS);
  const text = left > 0 ? `${left} day${left === 1 ? "" : "s"} left` : `Overdue by ${-left} day${left === -1 ? "" : "s"}`;
  return { percent: (elapsed / planned) * 100, text, date: shortDate(end) };
}

export default function PovPipeline() {
  const [rows, setRows] = useState<ExperimentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState("ALL");

  const path = useCompanyPath("/experiments");
  useEffect(() => {
    if (path === undefined) return; // companies still loading
    if (path === null) {
      setRows([]); // no company yet: show the empty state
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch(path)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setError("Could not load experiments."))
      .finally(() => setLoading(false));
  }, [path]);

  const tabs = [
    { id: "ALL", label: "All", count: rows.length },
    ...Object.entries(STATUS_LABELS).map(([id, label]) => ({
      id,
      label,
      count: rows.filter((r) => r.status === id).length,
    })),
  ];
  const visible = active === "ALL" ? rows : rows.filter((r) => r.status === active);
  const now = Date.now();

  return (
    <main>
      <PageHeader
        title="14-Day PoV Pipeline"
        description="Run fast, focused experiments to prove value."
      />
      {loading && <ProgressIndicator label="Loading experiments…" />}
      {!loading && error && <InlineAlert variant="error">{error}</InlineAlert>}
      {!loading && !error && (
        <>
          <Tabs items={tabs} activeId={active} onChange={setActive} aria-label="PoV status" variant="pill" />
          <TabPanel id={active} activeId={active}>
            {visible.length === 0 ? (
              <p className="pov__empty">
                {rows.length === 0
                  ? "No experiments yet. Open an opportunity and create one from its Experiments tab."
                  : "No experiments in this status."}
              </p>
            ) : (
              <ul className="pov-list">
                {visible.map((r) => {
                  const { percent, text, date } = schedule(r, now);
                  const learnings = r._count?.learnings ?? 0;
                  return (
                    <li key={r.id} className="pov-row">
                      <div className="pov-row__main">
                        <Link to={`/app/opportunities/${r.opportunity.id}/experiments/${r.id}`}>{r.title}</Link>
                        <span className="pov-row__category">
                          {r.opportunity.title}
                          {r.opportunity.category ? ` · ${r.opportunity.category}` : ""}
                        </span>
                      </div>
                      <div className="pov-row__progress">
                        <ProgressBar percent={percent} label={`${r.title} schedule`} />
                        <span className="pov-row__meta">{text}</span>
                      </div>
                      <span className="pov-row__date">{date ?? "—"}</span>
                      <Avatars names={r.team ?? []} />
                      <div className="pov-row__status">
                        <StatusBadge
                          label={STATUS_LABELS[r.status as ExperimentStatusValue] ?? r.status}
                          tone={r.status === "RUNNING" ? "success" : r.status === "ABANDONED" ? "danger" : r.status === "COMPLETE" ? "accent" : "default"}
                        />
                        <span className="pov-row__meta">
                          {r.success == null ? "" : r.success ? "Success · " : "Not successful · "}
                          {learnings} learning{learnings === 1 ? "" : "s"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabPanel>
        </>
      )}
    </main>
  );
}
