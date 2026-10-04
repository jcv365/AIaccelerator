import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api";
import { Button, InlineAlert, ProgressIndicator, StatusBadge, TextField } from "../components/ui";
import type { Experiment, OpportunityDetailData } from "../components/app/opportunity/types";

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

export default function ExperimentDetail() {
  const { id, experimentId } = useParams<{ id: string; experimentId: string }>();
  const [opportunity, setOpportunity] = useState<OpportunityDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [insight, setInsight] = useState("");

  function reload() {
    setLoading(true);
    apiFetch(`/opportunities/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: OpportunityDetailData) => {
        setOpportunity(data);
        setLoadError(null);
      })
      .catch(() => setLoadError("Could not load this experiment."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, [id]);

  async function patchExperiment(fields: Record<string, unknown>) {
    setActionError(null);
    const res = await apiFetch(`/opportunities/${id}/experiments/${experimentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      setActionError(await readErrorMessage(res, "Failed to update experiment"));
      return;
    }
    reload();
  }

  async function handleAddLearning(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    const res = await apiFetch(`/opportunities/${id}/experiments/${experimentId}/learnings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insight }),
    });
    if (!res.ok) {
      setActionError(await readErrorMessage(res, "Failed to add learning"));
      return;
    }
    setInsight("");
    reload();
  }

  if (loading) {
    return (
      <main>
        <ProgressIndicator label="Loading experiment…" />
      </main>
    );
  }

  const experiment: Experiment | undefined = opportunity?.experiments.find((exp) => exp.id === experimentId);

  if (loadError || !opportunity || !experiment) {
    return (
      <main>
        <InlineAlert variant="error">{loadError ?? "Experiment not found."}</InlineAlert>
      </main>
    );
  }

  return (
    <main>
      <p>
        <Link to={`/app/opportunities/${id}`}>← Back to {opportunity.title}</Link>
      </p>
      <h1>{experiment.title}</h1>
      <p>{experiment.method}</p>
      {actionError && <InlineAlert variant="error">{actionError}</InlineAlert>}

      <StatusBadge label={experiment.status} tone="accent" />

      <label>
        Experiment status
        <select value={experiment.status} onChange={(e) => patchExperiment({ status: e.target.value })}>
          <option value="PLANNED">PLANNED</option>
          <option value="RUNNING">RUNNING</option>
          <option value="COMPLETE">COMPLETE</option>
          <option value="ABANDONED">ABANDONED</option>
        </select>
      </label>

      <TextField
        label="Result summary"
        defaultValue={experiment.resultSummary ?? ""}
        placeholder="Result summary"
        onBlur={(e) => {
          if (e.target.value !== (experiment.resultSummary ?? "")) {
            patchExperiment({ resultSummary: e.target.value });
          }
        }}
      />

      <label>
        Success
        <input
          type="checkbox"
          checked={experiment.success === true}
          onChange={(e) => patchExperiment({ success: e.target.checked })}
        />
      </label>

      <h2>Learnings</h2>
      {experiment.learnings.length === 0 ? (
        <p>No learnings recorded yet.</p>
      ) : (
        <ul>
          {experiment.learnings.map((l) => (
            <li key={l.id}>{l.insight}</li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAddLearning}>
        <input value={insight} onChange={(e) => setInsight(e.target.value)} placeholder="Insight" required />
        <Button type="submit" variant="primary">
          Add Learning
        </Button>
      </form>
    </main>
  );
}
