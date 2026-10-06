import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { DonutChart, InlineAlert, KpiTile, PageHeader, ProgressIndicator, StatusBadge } from "../../components/ui";
import "./Dashboard.css";

interface OpportunitySummary {
  id: string;
  status: string;
  _count?: { evidence: number; decisions: number };
}

// Lifecycle order, so the pipeline reads left to right from discovery to outcome.
const STATUS_ORDER = ["DISCOVERED", "QUALIFIED", "HYPOTHESIS", "EXPERIMENT", "PROVING", "PROVEN", "DEFERRED", "REJECTED", "NO_AI"];

export default function Dashboard() {
  const [opportunities, setOpportunities] = useState<OpportunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/opportunities")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => setOpportunities(data))
      .catch(() => setError("Could not load dashboard data."))
      .finally(() => setLoading(false));
  }, []);

  const totalEvidence = opportunities.reduce((sum, o) => sum + (o._count?.evidence ?? 0), 0);

  return (
    <main>
      <PageHeader title="Dashboard" description="How your AI opportunities are progressing, at a glance." />

      {loading && <ProgressIndicator label="Loading dashboard…" />}
      {!loading && error && <InlineAlert variant="error">{error}</InlineAlert>}
      {!loading && !error && opportunities.length === 0 && (
        <InlineAlert variant="info">
          No opportunities yet. <Link to="/app/analyze">Start an analysis</Link> or{" "}
          <Link to="/app/opportunities/new">add one manually</Link>.
        </InlineAlert>
      )}

      {!loading && !error && opportunities.length > 0 && (
        <>
          <div className="kpi-row">
            <KpiTile value={String(opportunities.length)} label="Opportunities" />
            <KpiTile value={String(totalEvidence)} label="Evidence Sources" />
            {/* No experiments-count field exists on the opportunities list endpoint —
                a real cross-opportunity count would need a new list endpoint
                (see SCREENS.md §D, APP-POV). Shown as unavailable, not estimated. */}
            <KpiTile value="—" label="Active 14-Day PoVs" delta="Not yet available" />
            {/* potentialValue is a free-text field on Opportunity, not a currency
                amount — there is nothing numeric to sum here. Not fabricated. */}
            <KpiTile value="—" label="Estimated Annual Value" delta="Not yet available" />
          </div>

          <section className="dashboard__pipeline">
            <h2>Pipeline by status</h2>
            <ul className="pipeline">
              {STATUS_ORDER.map((status) => ({ status, count: opportunities.filter((o) => o.status === status).length }))
                .filter(({ count }) => count > 0)
                .map(({ status, count }) => (
                  <li key={status} className="pipeline__item">
                    <StatusBadge label={status} tone={status === "PROVEN" ? "success" : status === "REJECTED" ? "danger" : status === "NO_AI" || status === "DEFERRED" ? "caution" : "accent"} />
                    <span className="pipeline__count">{count}</span>
                  </li>
                ))}
            </ul>
          </section>

          <section className="dashboard__readiness">
            <h2>AI Readiness</h2>
            <DonutChart
              score={null}
              breakdown={[]}
              emptyMessage="No AI-readiness scoring exists yet. It needs a scoring model that has not been built, so no score is shown rather than an invented one."
            />
          </section>

          <p className="dashboard__link">
            <Link to="/app/portfolio">Open the Opportunity Portfolio →</Link>
          </p>
        </>
      )}
    </main>
  );
}
