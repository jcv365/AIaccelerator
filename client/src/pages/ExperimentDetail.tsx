import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api";
import { EXPERIMENT_STATUSES } from "../domain/experimentStatus";
import { Button, InlineAlert, ProgressIndicator, StatusBadge, TextField } from "../components/ui";
import type { Experiment, OpportunityDetailData } from "../components/app/opportunity/types";

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

export default function ExperimentDetail() {
  const { id, experimentId } = useParams<{ id: string; experimentId: string }>();
  const navigate = useNavigate();
  const [editingLearningId, setEditingLearningId] = useState<string | null>(null);
  const [editInsight, setEditInsight] = useState("");
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

  // Runs a mutation, surfacing the server's message on failure; returns whether it succeeded.
  async function mutate(path: string, init: RequestInit, failureMessage: string): Promise<boolean> {
    setActionError(null);
    const res = await apiFetch(path, init);
    if (!res.ok) {
      setActionError(await readErrorMessage(res, failureMessage));
      return false;
    }
    return true;
  }

  async function handleDeleteExperiment() {
    if (!window.confirm("Delete this experiment and all of its learnings? This cannot be undone.")) return;
    if (await mutate(`/opportunities/${id}/experiments/${experimentId}`, { method: "DELETE" }, "Failed to delete experiment")) {
      navigate(`/app/opportunities/${id}`);
    }
  }

  async function handleSaveLearning(learningId: string) {
    const ok = await mutate(
      `/opportunities/${id}/experiments/${experimentId}/learnings/${learningId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ insight: editInsight }) },
      "Failed to save learning"
    );
    if (ok) {
      setEditingLearningId(null);
      reload();
    }
  }

  async function handleDeleteLearning(learningId: string) {
    if (!window.confirm("Delete this learning? This cannot be undone.")) return;
    if (await mutate(`/opportunities/${id}/experiments/${experimentId}/learnings/${learningId}`, { method: "DELETE" }, "Failed to delete learning")) {
      reload();
    }
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
          {EXPERIMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <TextField
        label="Result summary"
        defaultValue={experiment.resultSummary ?? ""}
        placeholder="Result summary"
        onBlur={(e) => {
          if (e.target.value !== (experiment.resultSummary ?? "")) {
            // An emptied field clears the summary back to null instead of storing "".
            patchExperiment({ resultSummary: e.target.value === "" ? null : e.target.value });
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

      {(experiment.resultSummary !== null || experiment.success !== null) && (
        <Button type="button" onClick={() => patchExperiment({ resultSummary: null, success: null })}>
          Clear result
        </Button>
      )}

      <h2>Learnings</h2>
      {experiment.learnings.length === 0 ? (
        <p>No learnings recorded yet.</p>
      ) : (
        <ul>
          {experiment.learnings.map((l) => (
            <li key={l.id}>
              {editingLearningId === l.id ? (
                <>
                  <input aria-label="Edit insight" value={editInsight} onChange={(e) => setEditInsight(e.target.value)} />
                  <Button type="button" variant="primary" onClick={() => handleSaveLearning(l.id)}>
                    Save
                  </Button>
                  <Button type="button" onClick={() => setEditingLearningId(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  {l.insight}{" "}
                  <Button
                    type="button"
                    onClick={() => {
                      setEditingLearningId(l.id);
                      setEditInsight(l.insight);
                    }}
                  >
                    Edit learning
                  </Button>
                  <Button type="button" onClick={() => handleDeleteLearning(l.id)}>
                    Delete learning
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAddLearning}>
        <input value={insight} onChange={(e) => setInsight(e.target.value)} placeholder="Insight" required />
        <Button type="submit" variant="primary">
          Add Learning
        </Button>
      </form>

      <h2>Danger zone</h2>
      <Button type="button" onClick={handleDeleteExperiment}>
        Delete experiment
      </Button>
    </main>
  );
}
