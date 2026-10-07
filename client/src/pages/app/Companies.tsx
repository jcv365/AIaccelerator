import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../api";
import { useCompany, type Company } from "../../company/CompanyContext";
import { Button, InlineAlert, PageHeader, ProgressIndicator, StatusBadge, TextField } from "../../components/ui";
import "./lists.css";
import "./companies.css";

interface OpportunityRow {
  id: string;
  title: string;
}

interface AnalysisRun {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  createdAt: string;
  completedAt: string | null;
  opportunities: number;
  error: { code: string; message: string | null } | null;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const isActive = (r: AnalysisRun) => r.status === "QUEUED" || r.status === "RUNNING";

async function errorOf(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

/** One place to add, rename, change the web address of, and delete companies, and to remove wrong opportunities. */
export default function Companies({ pollIntervalMs = 10_000 }: { pollIntervalMs?: number }) {
  const { ready, companies, currentId, select, refresh, createCompany, runId, runsReady, selectRun, refreshRuns } = useCompany();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newSite, setNewSite] = useState("");
  const [adding, setAdding] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSite, setEditSite] = useState("");

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const [opps, setOpps] = useState<OpportunityRow[] | null>(null);
  const [removeOppId, setRemoveOppId] = useState<string | null>(null);

  const [runs, setRuns] = useState<AnalysisRun[] | null>(null);
  const [rerunning, setRerunning] = useState(false);

  const current = companies.find((c) => c.id === currentId) ?? null;

  const loadOpps = useCallback(async () => {
    if (!currentId || !runsReady) {
      if (!currentId) setOpps([]);
      return;
    }
    setOpps(null);
    const run = runId ? `&analysisId=${encodeURIComponent(runId)}` : "";
    const res = await apiFetch(`/opportunities?companyId=${encodeURIComponent(currentId)}${run}`);
    setOpps(res.ok ? ((await res.json()) as OpportunityRow[]) : []);
  }, [currentId, runId, runsReady]);

  const loadRuns = useCallback(async () => {
    if (!currentId) {
      setRuns([]);
      return;
    }
    const res = await apiFetch(`/companies/${encodeURIComponent(currentId)}/analyses`);
    setRuns(res.ok ? ((await res.json()) as { analyses: AnalysisRun[] }).analyses : []);
  }, [currentId]);

  // A different company starts again from its own history, showing every run.
  useEffect(() => {
    setRuns(null);
    void loadRuns();
  }, [loadRuns]);

  // While a run is going, watch it; when it finishes, bring in its opportunities and the new counts.
  const active = runs?.some(isActive) ?? false;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void loadRuns(), pollIntervalMs);
    return () => clearInterval(timer);
  }, [active, loadRuns, pollIntervalMs]);
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !active) {
      void refresh();
      // The run that just finished becomes the one shown: it is the newest snapshot of the company.
      void apiFetch(`/companies/${encodeURIComponent(currentId ?? "")}/analyses`)
        .then((res) => (res.ok ? res.json() : null))
        .then((body: { analyses?: AnalysisRun[] } | null) => {
          const newest = body?.analyses?.find((a) => a.status === "SUCCEEDED" && a.opportunities > 0);
          return refreshRuns(newest?.id);
        })
        .catch(() => undefined);
    }
    wasActive.current = active;
  }, [active, currentId, refresh, refreshRuns]);

  async function rerun() {
    if (!currentId) return;
    setError(null);
    setNotice(null);
    setRerunning(true);
    try {
      const res = await apiFetch("/opportunities/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: currentId }),
      });
      if (!res.ok) {
        setError(await errorOf(res, "Could not start the analysis."));
        return;
      }
      setNotice("Analysis started. It takes 20 to 40 minutes and keeps running if you leave this page.");
      await loadRuns();
    } finally {
      setRerunning(false);
    }
  }

  useEffect(() => {
    void loadOpps();
  }, [loadOpps]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!newName.trim()) {
      setError("Company name is required.");
      return;
    }
    setAdding(true);
    try {
      const result = await createCompany({ name: newName.trim(), website: newSite.trim() || undefined });
      setNotice(result.created ? `${result.company.name} was added.` : `${result.company.name} already exists, so it was selected instead.`);
      setNewName("");
      setNewSite("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the company.");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(c: Company) {
    setEditId(c.id);
    setEditName(c.name);
    setEditSite(c.website ?? "");
    setDeleteId(null);
    setError(null);
    setNotice(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setError(null);
    const res = await apiFetch(`/companies/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, website: editSite }),
    });
    if (!res.ok) {
      setError(await errorOf(res, "Could not save the changes."));
      return;
    }
    setEditId(null);
    setNotice("Saved.");
    await refresh();
  }

  async function deleteCompany(c: Company) {
    setError(null);
    const res = await apiFetch(`/companies/${c.id}?confirmName=${encodeURIComponent(c.name)}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await errorOf(res, "Could not delete the company."));
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { opportunities?: number };
    setDeleteId(null);
    setConfirmText("");
    setNotice(`${c.name} was deleted${body.opportunities ? ` with its ${body.opportunities} opportunities` : ""}.`);
    await refresh();
  }

  async function removeOpportunity(o: OpportunityRow) {
    setError(null);
    const res = await apiFetch(`/opportunities/${o.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await errorOf(res, "Could not remove the opportunity."));
      return;
    }
    setRemoveOppId(null);
    setOpps((rows) => (rows ?? []).filter((r) => r.id !== o.id));
    setNotice(`Removed “${o.title}”.`);
    await refresh();
  }

  if (!ready) {
    return (
      <main>
        <PageHeader title="Companies" />
        <ProgressIndicator label="Loading companies…" />
      </main>
    );
  }

  return (
    <main>
      <PageHeader title="Companies" description="Add companies, correct their name or web address, delete the ones you no longer need, and remove opportunities that do not belong." />
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      {notice && <InlineAlert variant="success">{notice}</InlineAlert>}

      <section className="company-card" aria-label="Add a company">
        <h2>Add a company</h2>
        <form className="company-form" onSubmit={add}>
          <TextField label="Company name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} />
          <TextField label="Website (optional)" placeholder="e.g. momentum.co.za" value={newSite} onChange={(e) => setNewSite(e.target.value)} />
          <Button variant="primary" type="submit" disabled={adding}>
            {adding ? "Adding…" : "Add company"}
          </Button>
        </form>
        <p className="company-hint">The website tells the research which business you mean when several share a name.</p>
      </section>

      <section className="company-card" aria-label="Your companies">
        <h2>Your companies</h2>
        {companies.length === 0 && <p className="company-hint">No companies yet. Add one above.</p>}
        <ul className="company-list">
          {companies.map((c) => (
            <li key={c.id} className={`company-row${c.id === currentId ? " is-current" : ""}`}>
              {editId === c.id ? (
                <form className="company-form" onSubmit={saveEdit} aria-label={`Edit ${c.name}`}>
                  <TextField label="Name" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={120} />
                  <TextField label="Website" value={editSite} onChange={(e) => setEditSite(e.target.value)} placeholder="Leave empty to remove" />
                  <Button variant="primary" type="submit">
                    Save
                  </Button>
                  <Button type="button" onClick={() => setEditId(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <div className="company-row__text">
                    <strong>{c.name}</strong>
                    <span>
                      {c.website ?? "No website"} · {c.opportunityCount ?? 0} {c.opportunityCount === 1 ? "opportunity" : "opportunities"}
                      {c.id === currentId ? " · selected" : ""}
                    </span>
                  </div>
                  <div className="company-row__actions">
                    {c.id !== currentId && (
                      <Button onClick={() => select(c.id)} aria-label={`Select ${c.name}`}>
                        Select
                      </Button>
                    )}
                    <Button onClick={() => startEdit(c)} aria-label={`Edit ${c.name}`}>
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        setDeleteId(c.id);
                        setConfirmText("");
                        setEditId(null);
                      }}
                      aria-label={`Delete ${c.name}`}
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}
              {deleteId === c.id && (
                <div className="company-confirm">
                  <p>
                    This permanently deletes <strong>{c.name}</strong> with all of its opportunities, evidence, decisions, experiments and reports. Type the company name to confirm.
                  </p>
                  <TextField label="Company name to confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
                  <Button variant="danger" disabled={confirmText !== c.name} onClick={() => void deleteCompany(c)}>
                    Delete {c.name} for good
                  </Button>
                  <Button onClick={() => setDeleteId(null)}>Keep it</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {current && (
        <section className="company-card" aria-label={`Analysis history for ${current.name}`}>
          <div className="company-card__head">
            <h2>Analysis history for {current.name}</h2>
            <Button variant="primary" onClick={() => void rerun()} disabled={rerunning || active}>
              {active ? "Analysis running…" : rerunning ? "Starting…" : runs && runs.length > 0 ? "Rerun analysis" : "Run analysis"}
            </Button>
          </div>
          <p className="company-hint">Every run is kept with the date it ran. A rerun adds a new dated set of opportunities and never replaces or changes earlier ones.</p>
          {runs === null && <ProgressIndicator label="Loading history…" />}
          {runs && runs.length === 0 && <p className="company-hint">No analysis has been run for this company yet.</p>}
          <ul className="company-list">
            {(runs ?? []).map((r) => (
              <li key={r.id} className={`company-row${r.id === runId ? " is-current" : ""}`}>
                <div className="company-row__text">
                  <strong>{when(r.createdAt)}</strong>
                  <span>
                    {r.status === "SUCCEEDED" && `${r.opportunities} ${r.opportunities === 1 ? "opportunity" : "opportunities"} found`}
                    {isActive(r) && "Running"}
                    {r.status === "FAILED" && `Failed: ${r.error?.message ?? r.error?.code ?? "unknown reason"}`}
                  </span>
                </div>
                <div className="company-row__actions">
                  <StatusBadge label={r.status === "SUCCEEDED" ? "Finished" : r.status === "FAILED" ? "Failed" : "Running"} tone={r.status === "SUCCEEDED" ? "success" : r.status === "FAILED" ? "danger" : "accent"} />
                  {r.status === "SUCCEEDED" && (
                    <Button onClick={() => selectRun(r.id === runId ? null : r.id)} aria-label={`${r.id === runId ? "Stop showing" : "Show"} run of ${when(r.createdAt)}`}>
                      {r.id === runId ? "Showing" : "Show"}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {current && (
        <section className="company-card" aria-label={`Opportunities for ${current.name}`}>
          <div className="company-card__head">
            <h2>
              Opportunities for {current.name}
              {runId && runs?.find((r) => r.id === runId) ? `, run of ${when(runs.find((r) => r.id === runId)!.createdAt)}` : ", all runs"}
            </h2>
            {runId && <Button onClick={() => selectRun(null)}>Show all runs</Button>}
          </div>
          <p className="company-hint">Remove any result that is about the wrong company or does not belong. This cannot be undone.</p>
          {opps === null && <ProgressIndicator label="Loading opportunities…" />}
          {opps && opps.length === 0 && <p className="company-hint">No opportunities.</p>}
          <ul className="company-list">
            {(opps ?? []).map((o) => (
              <li key={o.id} className="company-row">
                <div className="company-row__text">
                  <strong>{o.title}</strong>
                </div>
                <div className="company-row__actions">
                  {removeOppId === o.id ? (
                    <>
                      <Button variant="danger" onClick={() => void removeOpportunity(o)} aria-label={`Confirm remove ${o.title}`}>
                        Yes, remove
                      </Button>
                      <Button onClick={() => setRemoveOppId(null)}>Keep</Button>
                    </>
                  ) : (
                    <Button onClick={() => setRemoveOppId(o.id)} aria-label={`Remove ${o.title}`}>
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
