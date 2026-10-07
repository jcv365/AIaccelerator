import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, apiFetch } from "../../api";
import { useCompanyPath } from "../../company/CompanyContext";
import {
  AiAssessmentNote,
  Button,
  DataTable,
  EvidenceTag,
  InlineAlert,
  PageHeader,
  ProgressIndicator,
  Select,
  StatusBadge,
  TabPanel,
  Tabs,
  TextAreaField,
  TextField,
} from "../../components/ui";
import { formatRand, type LatestAssessment } from "../../lib/opportunity";
import "./lists.css";
import "./hypothesis.css";

interface OpportunitySummary {
  id: string;
  title: string;
}

interface Decision {
  id: string;
  decision: string;
  rationale?: string | null;
  assumptions?: string | null;
  risks?: string | null;
  decidedAt: string;
}

interface EvidenceItem {
  id: string;
  claim: string;
  type: string;
  source?: string | null;
}

interface OpportunityDetail extends OpportunitySummary {
  hypothesis: string | null;
  risks?: string | null;
  evidence?: EvidenceItem[];
  decisions: Decision[];
}

const TABS = [
  { id: "hypothesis", label: "Hypothesis" },
  { id: "evidence", label: "Evidence" },
  { id: "assumptions", label: "Assumptions" },
  { id: "risks", label: "Risks" },
  { id: "decision", label: "Decision" },
];

const RECOMMENDATION_LABEL: Record<LatestAssessment["recommendation"], string> = {
  PROCEED_TO_POV: "Proceed to a 14-day PoV",
  INVESTIGATE: "Investigate further",
  STOP: "Stop",
  NO_AI: "Not an AI opportunity",
};
const RECOMMENDATION_TONE = { PROCEED_TO_POV: "success", INVESTIGATE: "accent", STOP: "danger", NO_AI: "caution" } as const;
const LEVEL_LABEL = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" } as const;

function Bullets({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="hypothesis__muted">{empty}</p>;
  return (
    <ul className="hypothesis__bullets">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

export default function HypothesisEngine() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("opportunity") ?? "";

  const [options, setOptions] = useState<OpportunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<OpportunityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assessment, setAssessment] = useState<LatestAssessment | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [tab, setTab] = useState("hypothesis");
  const [hypothesis, setHypothesis] = useState("");
  const [decision, setDecision] = useState("");
  const [rationale, setRationale] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [createdPov, setCreatedPov] = useState<{ id: string } | null>(null);

  const path = useCompanyPath("/opportunities");
  useEffect(() => {
    if (path === undefined) return; // companies still loading
    if (path === null) {
      setOptions([]); // no company yet: show the empty state
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch(path)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: OpportunitySummary[]) => {
        setOptions(data);
        // A selection from another company is not valid here: clear it.
        if (selectedId && !data.some((o) => o.id === selectedId)) setParams({}, { replace: true });
      })
      .catch(() => setError("Could not load opportunities."))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    setAssessment(null);
    setCreatedPov(null);
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setSaveError(null);
    setSaveNote(null);
    apiFetch(`/opportunities/${selectedId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: OpportunityDetail) => {
        setDetail(data);
        setHypothesis(data.hypothesis ?? "");
      })
      .catch(() => setError("Could not load that opportunity."))
      .finally(() => setDetailLoading(false));
    // No assessment yet is the normal case (404): the card then offers to run one.
    apiFetch(`/opportunities/${selectedId}/assessment`)
      .then(async (res) => {
        if (res.ok) setAssessment((await res.json()) as LatestAssessment);
      })
      .catch(() => {});
  }, [selectedId]);

  async function saveHypothesis(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveNote(null);
    try {
      await api.patch(`/opportunities/${selectedId}`, { hypothesis });
      setSaveNote("Hypothesis saved.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save the hypothesis.");
    }
  }

  async function recordDecision(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveNote(null);
    try {
      const created = await api.post<Decision>(`/opportunities/${selectedId}/decisions`, {
        decision,
        rationale: rationale || undefined,
      });
      setDetail((d) => (d ? { ...d, decisions: [...d.decisions, created] } : d));
      setDecision("");
      setRationale("");
      setSaveNote("Decision recorded.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to record the decision.");
    }
  }

  async function runAssessment() {
    setAssessing(true);
    setSaveError(null);
    setSaveNote(null);
    try {
      setAssessment(await api.post<LatestAssessment>(`/opportunities/${selectedId}/assessment`, {}));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "The assessment failed.");
    } finally {
      setAssessing(false);
    }
  }

  async function createPov() {
    if (!detail) return;
    setSaveError(null);
    setSaveNote(null);
    try {
      const created = await api.post<{ id: string }>(`/opportunities/${selectedId}/experiments`, {
        title: `14-day PoV: ${detail.title}`,
        method: "Time-boxed proof of value to test the hypothesis against real data.",
        plannedDays: 14,
      });
      setCreatedPov(created);
      setSaveNote("14-day PoV created.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to create the PoV.");
    }
  }

  const evidence = detail?.evidence ?? [];
  const assumptionEvidence = evidence.filter((e) => e.type === "ASSUMPTION");
  const decisionAssumptions = (detail?.decisions ?? []).filter((d) => d.assumptions);
  const decisionRisks = (detail?.decisions ?? []).filter((d) => d.risks);

  return (
    <main>
      <PageHeader
        title="Hypothesis Engine & Decision Centre"
        description="Sharpen the hypothesis for one opportunity, weigh the evidence, then record the decision and why."
      />
      {loading && <ProgressIndicator label="Loading opportunities…" />}
      {!loading && error && <InlineAlert variant="error">{error}</InlineAlert>}

      {!loading && !error && options.length === 0 && (
        <InlineAlert variant="info">No opportunities yet. Create one first, then return here.</InlineAlert>
      )}

      {!loading && !error && options.length > 0 && (
        <>
          <Select
            label="Opportunity"
            value={selectedId}
            onChange={(e) => setParams(e.target.value ? { opportunity: e.target.value } : {})}
          >
            <option value="">Select an opportunity…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>

          {!selectedId && <p>Choose an opportunity to edit its hypothesis and record a decision.</p>}
          {selectedId && detailLoading && <ProgressIndicator label="Loading opportunity…" />}

          {detail && !detailLoading && (
            <>
              {saveError && <InlineAlert variant="error">{saveError}</InlineAlert>}
              {saveNote && <InlineAlert variant="info">{saveNote}</InlineAlert>}
              {createdPov && (
                <p>
                  <Link to={`/app/opportunities/${detail.id}/experiments/${createdPov.id}`}>Open the new PoV →</Link>
                </p>
              )}

              <div className="hypothesis-layout">
                <div className="panel hypothesis__main">
                  <div className="hypothesis__head">
                    <h2>{detail.title}</h2>
                    {assessment?.recommendation === "PROCEED_TO_POV" && <StatusBadge label="Ready for PoV" tone="success" />}
                  </div>
                  <Tabs items={TABS} activeId={tab} onChange={setTab} aria-label="Hypothesis sections" />

                  <TabPanel id="hypothesis" activeId={tab}>
                    <form className="form-stack" onSubmit={saveHypothesis}>
                      <TextAreaField label="Hypothesis" rows={3} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} />
                      <Button type="submit" variant="primary">
                        Save hypothesis
                      </Button>
                    </form>
                    <h3>Why we believe this</h3>
                    <Bullets items={assessment?.whyBelieve ?? []} empty="Run an AI assessment to see the reasons it finds in the evidence." />
                    <h3>What could disprove this</h3>
                    <Bullets items={assessment?.couldDisprove ?? []} empty="Run an AI assessment to see what would prove this wrong." />
                    {assessment && <AiAssessmentNote model={assessment.model} createdAt={assessment.createdAt} rationale={assessment.rationale} />}
                  </TabPanel>

                  <TabPanel id="evidence" activeId={tab}>
                    <DataTable
                      columns={[
                        { key: "type", header: "Type", render: (e: EvidenceItem) => <EvidenceTag type={e.type} /> },
                        { key: "claim", header: "Claim", render: (e: EvidenceItem) => e.claim },
                        { key: "source", header: "Source", render: (e: EvidenceItem) => e.source || "—" },
                      ]}
                      rows={evidence}
                      getRowKey={(e) => e.id}
                      emptyMessage="No evidence recorded for this opportunity yet."
                    />
                    <p>
                      <Link to="/app/evidence">Open the Evidence Explorer →</Link>
                    </p>
                  </TabPanel>

                  <TabPanel id="assumptions" activeId={tab}>
                    <Bullets
                      items={[...assumptionEvidence.map((e) => e.claim), ...decisionAssumptions.map((d) => d.assumptions as string)]}
                      empty="No assumptions have been recorded for this opportunity."
                    />
                  </TabPanel>

                  <TabPanel id="risks" activeId={tab}>
                    <Bullets
                      items={[...(detail.risks ? [detail.risks] : []), ...decisionRisks.map((d) => d.risks as string)]}
                      empty="No risks have been recorded for this opportunity."
                    />
                    {assessment && <p className="hypothesis__muted">AI-assessed overall risk: {LEVEL_LABEL[assessment.risk]}.</p>}
                  </TabPanel>

                  <TabPanel id="decision" activeId={tab}>
                    <form className="form-stack" onSubmit={recordDecision}>
                      <TextField label="Decision" value={decision} onChange={(e) => setDecision(e.target.value)} required />
                      <TextAreaField label="Rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
                      <Button type="submit" variant="primary">
                        Record decision
                      </Button>
                    </form>
                    <h3>Decision history</h3>
                    <DataTable
                      columns={[
                        { key: "decision", header: "Decision", render: (d: Decision) => d.decision },
                        { key: "rationale", header: "Rationale", render: (d: Decision) => d.rationale || "—" },
                        { key: "date", header: "Decided", render: (d: Decision) => new Date(d.decidedAt).toLocaleDateString() },
                      ]}
                      rows={detail.decisions}
                      getRowKey={(d) => d.id}
                      emptyMessage="No decisions recorded for this opportunity yet."
                    />
                  </TabPanel>
                </div>

                <aside className="recommendation" aria-label="Decision recommendation">
                  <h2>Decision recommendation</h2>
                  {assessment ? (
                    <>
                      <StatusBadge label={RECOMMENDATION_LABEL[assessment.recommendation]} tone={RECOMMENDATION_TONE[assessment.recommendation]} />
                      <dl className="recommendation__facts">
                        <dt>Confidence</dt>
                        <dd>{Math.round(assessment.confidence * 100)}%</dd>
                        <dt>Estimated annual value</dt>
                        <dd>{formatRand(assessment.estimatedAnnualValue)}</dd>
                        <dt>Effort</dt>
                        <dd>{LEVEL_LABEL[assessment.effort]}</dd>
                        <dt>Risk</dt>
                        <dd>{LEVEL_LABEL[assessment.risk]}</dd>
                      </dl>
                    </>
                  ) : (
                    <p className="hypothesis__muted">No AI assessment has been run for this opportunity yet. Nothing is estimated until one is.</p>
                  )}
                  <Button variant="primary" className="recommendation__cta" onClick={() => void createPov()} disabled={!!createdPov}>
                    Create 14-day PoV
                  </Button>
                  <Button onClick={() => void runAssessment()} disabled={assessing}>
                    {assessing ? "Assessing…" : assessment ? "Re-run assessment" : "Run assessment"}
                  </Button>
                </aside>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
