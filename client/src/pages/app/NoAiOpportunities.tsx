import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { useCompanyPath } from "../../company/CompanyContext";
import { DataTable, InlineAlert, PageHeader, ProgressIndicator, StatusBadge } from "../../components/ui";
import type { OpportunityRow } from "../../lib/opportunity";

type NoAiRow = OpportunityRow & { businessProblem?: string | null; aiSuitability?: string | null };

export default function NoAiOpportunities() {
  const [rows, setRows] = useState<NoAiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const path = useCompanyPath("/opportunities");
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
      .then((data: NoAiRow[]) => setRows(data.filter((o) => o.status === "NO_AI")))
      .catch(() => setError("Could not load opportunities."))
      .finally(() => setLoading(false));
  }, [path]);

  return (
    <main>
      <PageHeader
        title="No-AI Opportunities"
        description="Opportunities decided as not suited to AI, with the reasoning kept so the decision can be revisited."
      />
      {loading && <ProgressIndicator label="Loading opportunities…" />}
      {!loading && error && <InlineAlert variant="error">{error}</InlineAlert>}
      {!loading && !error && (
        <DataTable
          columns={[
            {
              key: "title",
              header: "Opportunity",
              render: (o: NoAiRow) => <Link to={`/app/opportunities/${o.id}`}>{o.title}</Link>,
            },
            {
              key: "reason",
              header: "Reason",
              render: (o: NoAiRow) => o.latestDecision?.rationale || o.aiSuitability || o.businessProblem || "—",
            },
            {
              key: "decision",
              header: "Decision",
              render: (o: NoAiRow) => <StatusBadge label={o.latestDecision?.decision ?? "NO_AI"} tone="caution" />,
            },
            {
              key: "date",
              header: "Date",
              render: (o: NoAiRow) => (o.latestDecision ? new Date(o.latestDecision.decidedAt).toLocaleDateString() : "—"),
            },
          ]}
          rows={rows}
          getRowKey={(o) => o.id}
          emptyMessage="No opportunities have been decided as not-AI yet."
        />
      )}
    </main>
  );
}
