import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { DataTable, InlineAlert, ProgressIndicator } from "../components/ui";
import "./Portfolio.css";

const STATUS_ORDER = [
  "DISCOVERED",
  "QUALIFIED",
  "HYPOTHESIS",
  "EXPERIMENT",
  "PROVING",
  "PROVEN",
  "REJECTED",
  "DEFERRED",
  "NO_AI",
] as const;

interface OpportunitySummary {
  id: string;
  title: string;
  status: string;
  owner: string | null;
  _count?: { evidence: number; decisions: number };
}

export default function Portfolio() {
  const [opportunities, setOpportunities] = useState<OpportunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/opportunities")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => setOpportunities(data))
      .catch(() => setError("Could not load opportunities."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main>
      <div className="portfolio__header">
        <h1>AI Accelerator</h1>
        <Link className="btn btn--primary" to="/app/opportunities/new">
          + New
        </Link>
      </div>
      {loading && <ProgressIndicator label="Loading opportunities…" />}
      {!loading && error && <InlineAlert variant="error">{error}</InlineAlert>}
      {!loading && !error && opportunities.length === 0 && (
        <InlineAlert variant="info">No opportunities yet. Start a new analysis or add one manually.</InlineAlert>
      )}
      {!loading &&
        !error &&
        STATUS_ORDER.map((status) => {
          const group = opportunities.filter((o) => o.status === status);
          if (group.length === 0) return null;
          return (
            <section key={status} className="portfolio__section">
              <h2 className="portfolio__section-heading">{status}</h2>
              <DataTable
                rows={group}
                getRowKey={(row) => row.id}
                columns={[
                  { key: "title", header: "Opportunity", render: (row) => <Link to={`/app/opportunities/${row.id}`}>{row.title}</Link> },
                  { key: "owner", header: "Owner", render: (row) => row.owner ?? "—" },
                  { key: "evidence", header: "Evidence", render: (row) => row._count?.evidence ?? 0 },
                  { key: "decisions", header: "Decisions", render: (row) => row._count?.decisions ?? 0 },
                ]}
              />
            </section>
          );
        })}
    </main>
  );
}
