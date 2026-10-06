import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiFetch } from "../../api";
import { useCompany, useCompanyPath } from "../../company/CompanyContext";
import {
  AiAssessmentNote,
  BarList,
  Button,
  DataTable,
  DonutChart,
  InlineAlert,
  KpiTile,
  PageHeader,
  ProgressIndicator,
  StatusBadge,
} from "../../components/ui";
import { effectiveValue, formatRand, valueSource, type OpportunityRow } from "../../lib/opportunity";
import "./Dashboard.css";

interface ExperimentSummary {
  id: string;
  status: string;
}

interface Readiness {
  overall: number;
  dimensions: Record<string, { score: number; basis: string }>;
  rationale: string;
  model: string;
  createdAt: string;
}

// Same keys and labels as the server's READINESS_DIMENSIONS.
const READINESS_LABELS: Record<string, string> = {
  strategy_governance: "Strategy & Governance",
  data_infrastructure: "Data & Infrastructure",
  people_skills: "People & Skills",
  risk_compliance: "Risk & Compliance",
  change_adoption: "Change & Adoption",
};

// Lifecycle order, so the pipeline reads left to right from discovery to outcome.
const STATUS_ORDER = ["DISCOVERED", "QUALIFIED", "HYPOTHESIS", "EXPERIMENT", "PROVING", "PROVEN", "DEFERRED", "REJECTED", "NO_AI"];
const POV_ORDER: { status: string; label: string }[] = [
  { status: "PLANNED", label: "Planned" },
  { status: "RUNNING", label: "Running" },
  { status: "COMPLETE", label: "Complete" },
  { status: "ABANDONED", label: "Abandoned" },
];

const HIGH_VALUE = 1_000_000;
const MEDIUM_VALUE = 200_000;

function isReadiness(x: unknown): x is Readiness {
  return !!x && typeof x === "object" && typeof (x as Readiness).overall === "number" && !!(x as Readiness).dimensions;
}

export default function Dashboard() {
  const { currentId } = useCompany();
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [experiments, setExperiments] = useState<ExperimentSummary[] | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const path = useCompanyPath("/opportunities");
  const experimentsPath = useCompanyPath("/experiments");

  useEffect(() => {
    if (path === undefined) return; // companies still loading
    if (path === null) {
      setOpportunities([]); // no company yet: show the empty state
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch(path)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => setOpportunities(Array.isArray(data) ? data : []))
      .catch(() => setError("Could not load dashboard data."))
      .finally(() => setLoading(false));
  }, [path]);

  // The PoV count is a secondary figure: if it cannot load, say so on the card rather than failing the page.
  useEffect(() => {
    if (!experimentsPath) return;
    apiFetch(experimentsPath)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => setExperiments(Array.isArray(data) ? data : null))
      .catch(() => setExperiments(null));
  }, [experimentsPath]);

  useEffect(() => {
    setReadiness(null);
    setReadinessError(null);
    const query = currentId ? `?companyId=${encodeURIComponent(currentId)}` : "";
    apiFetch(`/readiness/latest${query}`)
      .then(async (res) => {
        if (res.status === 404) return; // none run yet: the empty state offers to run one
        if (!res.ok) throw new Error("failed");
        const data: unknown = await res.json();
        if (isReadiness(data)) setReadiness(data);
      })
      .catch(() => setReadinessError("Could not load the AI readiness assessment."));
  }, [currentId]);

  const runReadiness = useCallback(async () => {
    setAssessing(true);
    setReadinessError(null);
    try {
      const created = await api.post<Readiness>("/readiness", currentId ? { companyId: currentId } : {});
      setReadiness(created);
    } catch (err) {
      setReadinessError(err instanceof Error ? err.message : "The readiness assessment failed.");
    } finally {
      setAssessing(false);
    }
  }, [currentId]);

  const totalEvidence = opportunities.reduce((sum, o) => sum + (o._count?.evidence ?? 0), 0);
  const valued = opportunities.filter((o) => effectiveValue(o) != null);
  const totalValue = valued.reduce((sum, o) => sum + (effectiveValue(o) ?? 0), 0);
  const aiValued = valued.filter((o) => valueSource(o) === "ai").length;
  const activePovs = experiments ? experiments.filter((e) => e.status === "RUNNING").length : null;

  const bucket = (test: (v: number | null) => boolean) => opportunities.filter((o) => test(effectiveValue(o))).length;
  const valueBuckets = [
    { label: "High value (over R1M)", value: bucket((v) => v != null && v >= HIGH_VALUE) },
    { label: "Medium (R200k–R1M)", value: bucket((v) => v != null && v >= MEDIUM_VALUE && v < HIGH_VALUE) },
    { label: "Quick wins (under R200k)", value: bucket((v) => v != null && v < MEDIUM_VALUE) },
    { label: "Further analysis (no value set)", value: bucket((v) => v == null) },
  ];

  const recentDecisions = opportunities
    .filter((o) => o.latestDecision)
    .sort((a, b) => new Date(b.latestDecision!.decidedAt).getTime() - new Date(a.latestDecision!.decidedAt).getTime())
    .slice(0, 5);

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
            <KpiTile
              value={activePovs === null ? "—" : String(activePovs)}
              label="Active 14-Day PoVs"
              delta={activePovs === null ? "Not available" : undefined}
            />
            <KpiTile
              value={valued.length === 0 ? "—" : formatRand(totalValue)}
              label="Estimated Annual Value"
              delta={
                valued.length === 0
                  ? "No values set yet"
                  : aiValued > 0
                    ? `${aiValued} of ${valued.length} AI-estimated`
                    : `${valued.length} of ${opportunities.length} valued`
              }
            />
          </div>

          <div className="dashboard__grid">
            <section className="dashboard__panel dashboard__readiness">
              <h2>AI Readiness</h2>
              {readinessError && <InlineAlert variant="error">{readinessError}</InlineAlert>}
              {readiness ? (
                <>
                  <DonutChart score={readiness.overall} breakdown={[]} />
                  <BarList
                    caption="Readiness by dimension"
                    max={100}
                    items={Object.entries(READINESS_LABELS)
                      .filter(([key]) => readiness.dimensions[key])
                      .map(([key, label]) => ({
                        label,
                        value: readiness.dimensions[key].score,
                        display: `${readiness.dimensions[key].score}%`,
                      }))}
                  />
                  <AiAssessmentNote model={readiness.model} createdAt={readiness.createdAt} rationale={readiness.rationale} />
                </>
              ) : (
                <DonutChart
                  score={null}
                  breakdown={[]}
                  emptyMessage="No AI readiness assessment has been run for this company yet. Running one scores five dimensions from your opportunities, evidence and decisions."
                />
              )}
              <Button variant={readiness ? "default" : "primary"} onClick={() => void runReadiness()} disabled={assessing}>
                {assessing ? "Assessing…" : readiness ? "Re-run assessment" : "Run readiness assessment"}
              </Button>
            </section>

            <section className="dashboard__panel">
              <h2>Opportunity Portfolio</h2>
              <BarList caption="Opportunities by estimated annual value" items={valueBuckets} />
              <p className="dashboard__link">
                <Link to="/app/portfolio">Open the Opportunity Portfolio →</Link>
              </p>
            </section>
          </div>

          <section className="dashboard__pipeline">
            <h2>14-Day PoV Pipeline</h2>
            {experiments === null ? (
              <p>PoV counts are not available right now.</p>
            ) : (
              <ul className="pipeline">
                {POV_ORDER.map(({ status, label }) => (
                  <li key={status} className="pipeline__item">
                    <span>{label}</span>
                    <span className="pipeline__count">{experiments.filter((e) => e.status === status).length}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

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

          <section className="dashboard__pipeline">
            <h2>Recent Decisions</h2>
            <DataTable
              columns={[
                { key: "opportunity", header: "Opportunity", render: (o: OpportunityRow) => <Link to={`/app/opportunities/${o.id}`}>{o.title}</Link> },
                { key: "decision", header: "Decision", render: (o: OpportunityRow) => o.latestDecision!.decision },
                { key: "date", header: "Date", render: (o: OpportunityRow) => new Date(o.latestDecision!.decidedAt).toLocaleDateString() },
              ]}
              rows={recentDecisions}
              getRowKey={(o) => o.id}
              emptyMessage="No decisions have been recorded yet."
            />
          </section>
        </>
      )}
    </main>
  );
}
