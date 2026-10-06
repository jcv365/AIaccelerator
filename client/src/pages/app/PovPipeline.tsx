import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { useCompanyPath } from "../../company/CompanyContext";
import { DataTable, InlineAlert, PageHeader, ProgressIndicator, StatusBadge, TabPanel, Tabs } from "../../components/ui";
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
      .then((data) => setRows(data))
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

  return (
    <main>
      <PageHeader
        title="14-Day PoV Pipeline"
        description="Every proof-of-value experiment across your opportunities, grouped by where it stands."
      />
      {loading && <ProgressIndicator label="Loading experiments…" />}
      {!loading && error && <InlineAlert variant="error">{error}</InlineAlert>}
      {!loading && !error && (
        <>
          <Tabs items={tabs} activeId={active} onChange={setActive} aria-label="PoV status" />
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
                    <StatusBadge
                      label={STATUS_LABELS[r.status as ExperimentStatusValue] ?? r.status}
                      tone={r.status === "RUNNING" ? "accent" : r.status === "ABANDONED" ? "danger" : r.status === "COMPLETE" ? "success" : "default"}
                    />
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
              emptyMessage={
                rows.length === 0
                  ? "No experiments yet. Open an opportunity and create one from its Experiments tab."
                  : "No experiments in this status."
              }
            />
          </TabPanel>
        </>
      )}
    </main>
  );
}
