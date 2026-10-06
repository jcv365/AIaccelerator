import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, apiFetch } from "../../api";
import { useCompanyPath } from "../../company/CompanyContext";
import {
  Button,
  DataTable,
  InlineAlert,
  PageHeader,
  ProgressIndicator,
  Select,
  TextAreaField,
  TextField,
} from "../../components/ui";
import "./lists.css";

interface OpportunitySummary {
  id: string;
  title: string;
}

interface Decision {
  id: string;
  decision: string;
  rationale?: string | null;
  decidedAt: string;
}

interface OpportunityDetail extends OpportunitySummary {
  hypothesis: string | null;
  decisions: Decision[];
}

export default function HypothesisEngine() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("opportunity") ?? "";

  const [options, setOptions] = useState<OpportunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<OpportunityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hypothesis, setHypothesis] = useState("");
  const [decision, setDecision] = useState("");
  const [rationale, setRationale] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);

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

  return (
    <main>
      <PageHeader
        title="Hypothesis Engine & Decision Centre"
        description="Sharpen the hypothesis for one opportunity, then record the decision and why."
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

              <div className="two-col">
              <section>
                <h2>Hypothesis</h2>
                <form className="form-stack" onSubmit={saveHypothesis}>
                  <TextAreaField label="Hypothesis" rows={3} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} />
                  <Button type="submit" variant="primary">
                    Save hypothesis
                  </Button>
                </form>
              </section>

              <section>
                <h2>Decision</h2>
                {/* No structured recommendation (confidence/effort/risk scoring) exists in the backend — /report is a narrative, not a score. */}
                <InlineAlert variant="info">
                  AI decision recommendations (confidence, effort, risk scoring) are not available yet — no backend concept
                  exists. Record your decision manually below.
                </InlineAlert>
                <form className="form-stack" onSubmit={recordDecision}>
                  <TextField label="Decision" value={decision} onChange={(e) => setDecision(e.target.value)} required />
                  <TextAreaField label="Rationale" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
                  <Button type="submit" variant="primary">
                    Record decision
                  </Button>
                </form>
              </section>
              </div>

              <section>
                <h2>Decision history</h2>
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
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
