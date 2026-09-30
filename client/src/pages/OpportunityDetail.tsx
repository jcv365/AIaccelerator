import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../api";

type OpportunityStatus =
  | "DISCOVERED"
  | "QUALIFIED"
  | "HYPOTHESIS"
  | "EXPERIMENT"
  | "PROVING"
  | "PROVEN"
  | "REJECTED"
  | "DEFERRED"
  | "NO_AI";

const TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
  DISCOVERED: ["QUALIFIED", "REJECTED"],
  QUALIFIED: ["HYPOTHESIS", "NO_AI", "REJECTED", "DEFERRED"],
  HYPOTHESIS: ["EXPERIMENT", "REJECTED", "DEFERRED"],
  EXPERIMENT: ["PROVING", "REJECTED", "DEFERRED"],
  PROVING: ["PROVEN", "REJECTED"],
  DEFERRED: ["QUALIFIED", "REJECTED"],
  PROVEN: [],
  REJECTED: [],
  NO_AI: [],
};

interface Evidence {
  id: string;
  claim: string;
  type: string;
}

interface Decision {
  id: string;
  decision: string;
}

interface Learning {
  id: string;
  insight: string;
}

interface Experiment {
  id: string;
  title: string;
  method: string;
  status: string;
  resultSummary: string | null;
  success: boolean | null;
  learnings: Learning[];
}

interface OpportunityDetailData {
  id: string;
  title: string;
  status: OpportunityStatus;
  hypothesis: string | null;
  evidence: Evidence[];
  decisions: Decision[];
  experiments: Experiment[];
}

type Tab = "overview" | "evidence" | "reasoning" | "decisions" | "experiments" | "learnings";

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const [opportunity, setOpportunity] = useState<OpportunityDetailData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [claim, setClaim] = useState("");
  const [evidenceType, setEvidenceType] = useState("FACT");
  const [decisionText, setDecisionText] = useState("");
  const [report, setReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [hypothesisDraft, setHypothesisDraft] = useState("");

  function reload() {
    apiFetch(`/opportunities/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: OpportunityDetailData) => {
        setOpportunity(data);
        setHypothesisDraft(data.hypothesis ?? "");
      })
      .catch(() => setOpportunity(null));
  }

  useEffect(() => {
    reload();
  }, [id]);

  if (!opportunity) return <main>Loading...</main>;

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const res = await apiFetch(`/opportunities/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: e.target.value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Failed to update status");
      return;
    }
    reload();
  }

  async function handleAddEvidence(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiFetch(`/opportunities/${id}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim, type: evidenceType }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Failed to add evidence");
      return;
    }
    setClaim("");
    reload();
  }

  async function handleAddDecision(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiFetch(`/opportunities/${id}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: decisionText }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Failed to add decision");
      return;
    }
    setDecisionText("");
    reload();
  }

  async function handleGenerateReport() {
    setReportLoading(true);
    const res = await apiFetch(`/opportunities/${id}/report`, { method: "POST" });
    setReportLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Failed to generate report");
      return;
    }
    const body = (await res.json()) as { report: string };
    setReport(body.report);
  }

  async function handleSaveHypothesis(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiFetch(`/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hypothesis: hypothesisDraft }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Failed to save hypothesis");
      return;
    }
    reload();
  }

  const nextStatuses = TRANSITIONS[opportunity.status];

  return (
    <main>
      <h1>{opportunity.title}</h1>
      <nav>
        <button onClick={() => setActiveTab("overview")}>Overview</button>
        <button onClick={() => setActiveTab("evidence")}>Evidence</button>
        <button onClick={() => setActiveTab("reasoning")}>Reasoning</button>
        <button onClick={() => setActiveTab("decisions")}>Decisions</button>
        <button onClick={() => setActiveTab("experiments")}>Experiments</button>
        <button onClick={() => setActiveTab("learnings")}>Learnings</button>
      </nav>

      {activeTab === "overview" && (
        <section>
          <label>
            Status
            <select value={opportunity.status} onChange={handleStatusChange}>
              <option value={opportunity.status}>{opportunity.status}</option>
              {nextStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {activeTab === "evidence" && (
        <section>
          <h2>Evidence</h2>
          <ul>
            {opportunity.evidence.map((ev) => (
              <li key={ev.id}>
                [{ev.type}] {ev.claim}
              </li>
            ))}
          </ul>
          <form onSubmit={handleAddEvidence}>
            <input value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="Claim" required />
            <select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)}>
              <option value="FACT">FACT</option>
              <option value="INFERENCE">INFERENCE</option>
              <option value="ASSUMPTION">ASSUMPTION</option>
              <option value="AI_HYPOTHESIS">AI_HYPOTHESIS</option>
            </select>
            <button type="submit">Add</button>
          </form>
        </section>
      )}

      {activeTab === "reasoning" && (
        <section>
          <h2>Reasoning</h2>
          <form onSubmit={handleSaveHypothesis}>
            <label>
              Hypothesis
              <textarea value={hypothesisDraft} onChange={(e) => setHypothesisDraft(e.target.value)} />
            </label>
            <button type="submit">Save</button>
          </form>
          <h2>Report</h2>
          <button onClick={handleGenerateReport} disabled={reportLoading}>
            {reportLoading ? "Generating..." : "Generate Report"}
          </button>
          {report && <pre>{report}</pre>}
        </section>
      )}

      {activeTab === "decisions" && (
        <section>
          <h2>Decisions</h2>
          <ul>
            {opportunity.decisions.map((d) => (
              <li key={d.id}>{d.decision}</li>
            ))}
          </ul>
          <form onSubmit={handleAddDecision}>
            <input value={decisionText} onChange={(e) => setDecisionText(e.target.value)} placeholder="Decision" required />
            <button type="submit">Add</button>
          </form>
        </section>
      )}
    </main>
  );
}
