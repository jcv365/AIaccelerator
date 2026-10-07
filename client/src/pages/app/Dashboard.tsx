import { useCallback, useEffect, useState, type ReactNode } from "react";
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

const POV_TILES: { status: string; label: string; tone: string }[] = [
  { status: "RUNNING", label: "In Progress", tone: "blue" },
  { status: "PLANNED", label: "Pending Start", tone: "orange" },
  { status: "COMPLETE", label: "Completed", tone: "green" },
  { status: "ABANDONED", label: "Stopped", tone: "red" },
];

const HIGH_VALUE = 1_000_000;
const MEDIUM_VALUE = 200_000;
const RECENT_DAYS = 30;

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const ICONS = {
  opportunities: svg(
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
    </>,
  ),
  evidence: svg(
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </>,
  ),
  povs: svg(
    <>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
      <path d="M8 15h8" />
    </>,
  ),
  value: svg(
    <>
      <path d="M4 20h16" />
      <path d="M6 20v-6M11 20V9M16 20v-9M21 20V5" />
    </>,
  ),
};

const SHIELD = "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z";
const DIMENSION_ICONS: Record<string, ReactNode> = {
  strategy_governance: svg(<path d={SHIELD} />),
  data_infrastructure: svg(
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </>,
  ),
  people_skills: svg(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.5c3 0 5 1.7 5 4.5" />
    </>,
  ),
  risk_compliance: svg(
    <>
      <path d={SHIELD} />
      <path d="M9 12l2 2 4-4" />
    </>,
  ),
  change_adoption: svg(<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />),
};

function isReadiness(x: unknown): x is Readiness {
  return !!x && typeof x === "object" && typeof (x as Readiness).overall === "number" && !!(x as Readiness).dimensions;
}

function decisionTone(decision: string): "success" | "danger" | "caution" {
  if (/proceed|approve|go\b|scale/i.test(decision)) return "success";
  if (/stop|reject|no[- ]?ai|kill/i.test(decision)) return "danger";
  return "caution";
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
  const recentCutoff = Date.now() - RECENT_DAYS * 86_400_000;
  const addedRecently = opportunities.filter((o) => o.createdAt && new Date(o.createdAt).getTime() >= recentCutoff).length;

  const bucket = (test: (v: number | null) => boolean) => opportunities.filter((o) => test(effectiveValue(o))).length;
  const valueBuckets = [
    { label: "High value (over R1M)", value: bucket((v) => v != null && v >= HIGH_VALUE), tone: "green" as const },
    { label: "Medium (R200k–R1M)", value: bucket((v) => v != null && v >= MEDIUM_VALUE && v < HIGH_VALUE), tone: "blue" as const },
    { label: "Quick wins (under R200k)", value: bucket((v) => v != null && v < MEDIUM_VALUE), tone: "purple" as const },
    { label: "Further analysis (no value set)", value: bucket((v) => v == null), tone: "grey" as const },
  ];

  const recentDecisions = opportunities
    .filter((o) => o.latestDecision)
    .sort((a, b) => new Date(b.latestDecision!.decidedAt).getTime() - new Date(a.latestDecision!.decidedAt).getTime())
    .slice(0, 5);

  return (
    <main>
      <PageHeader title="Dashboard" description="Turn AI potential into measurable business value — using evidence, not hype." />

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
            <KpiTile
              tone="blue"
              icon={ICONS.opportunities}
              value={String(opportunities.length)}
              label="Opportunities"
              delta={addedRecently > 0 ? `+${addedRecently} in the last ${RECENT_DAYS} days` : undefined}
            />
            <KpiTile tone="purple" icon={ICONS.evidence} value={String(totalEvidence)} label="Evidence Sources" />
            <KpiTile
              tone="orange"
              icon={ICONS.povs}
              value={activePovs === null ? "—" : String(activePovs)}
              label="Active 14-Day PoVs"
              delta={activePovs === null ? "Not available" : undefined}
            />
            <KpiTile
              tone="green"
              icon={ICONS.value}
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
            <section className="panel dashboard__readiness" aria-labelledby="readiness-heading">
              <div className="panel__head">
                <h2 id="readiness-heading">AI Readiness</h2>
              </div>
              {readinessError && <InlineAlert variant="error">{readinessError}</InlineAlert>}
              {readiness ? (
                <>
                  <DonutChart
                    score={readiness.overall}
                    centerLabel="Overall Readiness"
                    breakdown={Object.entries(READINESS_LABELS)
                      .filter(([key]) => readiness.dimensions[key])
                      .map(([key, label]) => ({ label, percent: readiness.dimensions[key].score, icon: DIMENSION_ICONS[key] }))}
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

            <section className="panel" aria-labelledby="portfolio-heading">
              <div className="panel__head">
                <h2 id="portfolio-heading">Opportunity Portfolio</h2>
                <Link to="/app/portfolio">View all →</Link>
              </div>
              <BarList caption="Opportunities by estimated annual value" items={valueBuckets} />
            </section>
          </div>

          <div className="dashboard__grid">
            <section className="panel" aria-labelledby="pov-heading">
              <div className="panel__head">
                <h2 id="pov-heading">14-Day PoV Pipeline</h2>
                <Link to="/app/pov">View pipeline →</Link>
              </div>
              {experiments === null ? (
                <p>PoV counts are not available right now.</p>
              ) : (
                <ul className="pov-tiles">
                  {POV_TILES.map(({ status, label, tone }) => (
                    <li key={status} className={`pov-tile pov-tile--${tone}`}>
                      <span className="pov-tile__count">{experiments.filter((e) => e.status === status).length}</span>
                      <span className="pov-tile__label">{label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel" aria-labelledby="decisions-heading">
              <div className="panel__head">
                <h2 id="decisions-heading">Recent Decisions</h2>
              </div>
              <DataTable
                columns={[
                  { key: "opportunity", header: "Use case", render: (o: OpportunityRow) => <Link to={`/app/opportunities/${o.id}`}>{o.title}</Link> },
                  { key: "decision", header: "Decision", render: (o: OpportunityRow) => <StatusBadge label={o.latestDecision!.decision} tone={decisionTone(o.latestDecision!.decision)} /> },
                  { key: "date", header: "Date", render: (o: OpportunityRow) => new Date(o.latestDecision!.decidedAt).toLocaleDateString() },
                ]}
                rows={recentDecisions}
                getRowKey={(o) => o.id}
                emptyMessage="No decisions have been recorded yet."
              />
            </section>
          </div>
        </>
      )}
    </main>
  );
}
