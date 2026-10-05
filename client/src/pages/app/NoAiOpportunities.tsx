import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { DataTable, InlineAlert, ProgressIndicator, StatusBadge } from "../../components/ui";

interface Opportunity {
  id: string;
  title: string;
  status: string;
  businessProblem?: string | null;
  aiSuitability?: string | null;
}

export default function NoAiOpportunities() {
  const [rows, setRows] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/opportunities")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: Opportunity[]) => setRows(data.filter((o) => o.status === "NO_AI")))
      .catch(() => setError("Could not load opportunities."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main>
      <h1>No-AI Opportunities</h1>
      <p>Opportunities decided as not suited to AI, with the reasoning kept so the decision can be revisited.</p>
      {loading && <ProgressIndicator label="Loading opportunities…" />}
      {!loading && error && <InlineAlert variant="error">{error}</InlineAlert>}
      {!loading && !error && (
        <DataTable
          columns={[
            {
              key: "title",
              header: "Opportunity",
              render: (o: Opportunity) => <Link to={`/app/opportunities/${o.id}`}>{o.title}</Link>,
            },
            { key: "status", header: "Status", render: () => <StatusBadge label="NO_AI" tone="caution" /> },
            { key: "reason", header: "Reasoning", render: (o: Opportunity) => o.aiSuitability || o.businessProblem || "—" },
          ]}
          rows={rows}
          getRowKey={(o) => o.id}
          emptyMessage="No opportunities have been decided as not-AI yet."
        />
      )}
    </main>
  );
}
