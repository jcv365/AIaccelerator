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

interface OpportunityDetailData {
  id: string;
  title: string;
  status: OpportunityStatus;
  evidence: Evidence[];
  decisions: Decision[];
}

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const [opportunity, setOpportunity] = useState<OpportunityDetailData | null>(null);
  const [claim, setClaim] = useState("");
  const [evidenceType, setEvidenceType] = useState("FACT");
  const [decisionText, setDecisionText] = useState("");

  function reload() {
    apiFetch(`/opportunities/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then(setOpportunity)
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

  const nextStatuses = TRANSITIONS[opportunity.status];

  return (
    <main>
      <h1>{opportunity.title}</h1>
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
    </main>
  );
}
