import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { DataTable, InlineAlert, ProgressIndicator, StatusBadge, TabPanel, Tabs } from "../../components/ui";
import type { ExperimentStatusValue } from "../../domain/experimentStatus";

interface ExperimentRow {
  id: string;
  title: string;
  status: string;
  success?: boolean | null;
  startedAt?: string | null;
  opportunity: { id: string; title: string };
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

const TABS = [
  { id: "ALL", label: "All" },
  ...Object.entries(STATUS_LABELS).map(([id, label]) => ({ id, label })),
];

export default function PovPipeline() {
  const [rows, setRows] = useState<ExperimentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState("ALL");

  useEffect(() => {
    apiFetch("/experiments")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => setRows(data))
      .catch(() => setError("Could not load experiments."))
      .finally(() => setLoading(false));
  }, []);

  const visible = active === "ALL" ? rows : rows.filter((r) => r.status === active);

  return (
    <main>
      <h1>14-Day PoV Pipeline</h1>
      {loading && <ProgressIndicator label="Loading experiments…" />}
      {!loading && error && <InlineAlert variant="error">{error}</InlineAlert>}
      {!loading && !error && (
        <>
          <Tabs items={TABS} activeId={active} onChange={setActive} aria-label="PoV status" />
          <TabPanel id={active} activeId={active}>
            <DataTable
              columns={[
                {
                  key: "title",
                  header: "Experiment",
                  render: (r: ExperimentRow) => (
                    <Link to={`/app/opportunities/${r.opportunity.id}/experiments/${r.id}`}>{r.title}</Link>
                  ),
                },
                { key: "opp", header: "Opportunity", render: (r: ExperimentRow) => r.opportunity.title },
                {
                  key: "status",
                  header: "Status",
                  render: (r: ExperimentRow) => (
                    <StatusBadge label={r.status} tone={r.status === "RUNNING" ? "accent" : r.status === "ABANDONED" ? "danger" : "default"} />
                  ),
                },
                {
                  key: "outcome",
                  header: "Outcome",
                  render: (r: ExperimentRow) => (r.success == null ? "—" : r.success ? "Success" : "Not successful"),
                },
                { key: "learnings", header: "Learnings", render: (r: ExperimentRow) => String(r._count?.learnings ?? 0) },
              ]}
              rows={visible}
              getRowKey={(r) => r.id}
              emptyMessage={rows.length === 0 ? "No experiments yet. Create one from an opportunity's Experiments tab." : "No experiments in this status."}
            />
          </TabPanel>
        </>
      )}
    </main>
  );
}
