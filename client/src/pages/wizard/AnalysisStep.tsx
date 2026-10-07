import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiFetch } from "../../api";
import { Button, InlineAlert, ProgressIndicator, StatusBadge } from "../../components/ui";

type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

interface JobDetail {
  id: string;
  status: JobStatus;
  stage: string | null;
  progress: { expected?: string[]; responded?: string[]; missing?: string[]; elapsedSeconds?: number | null } | null;
  queuePosition: number | null;
  elapsedSeconds: number | null;
  opportunitiesFound: number;
  error: { code: string; message: string | null } | null;
}

interface JobListItem {
  id: string;
  status: JobStatus;
  opportunitiesFound: number;
  completedAt: string | null;
}

/** The Conclave's phases, in order. A round that finds no disagreement skips critiques and revisions. */
export const STAGES = [
  { key: "proposals", label: "The experts research and propose" },
  { key: "critiques", label: "The experts critique each other" },
  { key: "revisions", label: "The proposals are revised" },
  { key: "synthesis", label: "The chairman writes the synthesis" },
  { key: "voting", label: "The experts vote on the result" },
] as const;

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

function clock(seconds: number | null): string {
  if (seconds === null) return "";
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Index of the stage in progress (-1 before the first, STAGES.length once done). */
function stageIndex(stage: string | null, status: JobStatus): number {
  if (status === "SUCCEEDED" || stage === "done") return STAGES.length;
  const i = STAGES.findIndex((s) => s.key === stage);
  return i;
}

export interface AnalysisStepProps {
  companyId: string;
  companyName: string;
  pollIntervalMs?: number;
  /** Called with the finished analysis run's id: after a run completes, or when the user reuses the latest one. */
  onFinished: (jobId: string) => void;
}

/** Starts (or follows) the company's analysis. All state is read from the server, so leaving the page loses nothing. */
export function AnalysisStep({ companyId, companyName, pollIntervalMs = 5000, onFinished }: AnalysisStepProps) {
  const [loaded, setLoaded] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [latestDone, setLatestDone] = useState<JobListItem | null>(null);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const finishedFor = useRef<string | null>(null);

  // Find a job that is already queued or running for this company (e.g. after the page was closed).
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setJobId(null);
    setJob(null);
    setError(null);
    finishedFor.current = null;
    apiFetch(`/companies/${encodeURIComponent(companyId)}/analysis-jobs`)
      .then((res) => (res.ok ? (res.json() as Promise<JobListItem[]>) : []))
      .catch(() => [] as JobListItem[])
      .then((jobs) => {
        if (cancelled) return;
        const active = jobs.find((j) => j.status === "QUEUED" || j.status === "RUNNING");
        setJobId(active?.id ?? null);
        setLatestDone(jobs.find((j) => j.status === "SUCCEEDED" && j.opportunitiesFound > 0) ?? null);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const poll = useCallback(async () => {
    if (!jobId) return;
    try {
      const detail = await api.get<JobDetail>(`/opportunities/analyze/${encodeURIComponent(jobId)}`);
      setJob(detail);
      setError(null);
    } catch {
      setError("Could not check on the analysis. Retrying…"); // the analysis itself keeps running
    }
  }, [jobId]);

  const settled = job?.status === "SUCCEEDED" || job?.status === "FAILED";
  useEffect(() => {
    if (!jobId || settled) return;
    void poll();
    const timer = setInterval(() => void poll(), pollIntervalMs);
    return () => clearInterval(timer);
  }, [jobId, settled, poll, pollIntervalMs]);

  useEffect(() => {
    if (job?.status === "SUCCEEDED" && finishedFor.current !== job.id) {
      finishedFor.current = job.id;
      onFinished(job.id);
    }
  }, [job, onFinished]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await apiFetch("/opportunities/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setJob(null);
        setJobId(body.jobId);
      } else if (res.status === 409 && body?.error?.jobId) {
        setJob(null);
        setJobId(body.error.jobId); // this company is already being analysed: follow that run
      } else {
        setError(body?.error?.message ?? "Could not start the analysis.");
      }
    } finally {
      setStarting(false);
    }
  }

  if (!loaded) return <ProgressIndicator label="Checking for an analysis in progress…" />;

  const failed = job?.status === "FAILED";
  const index = job ? stageIndex(job.stage, job.status) : -1;

  return (
    <section className="wizard-panel" aria-label="Analysis">
      <h2>Analyse {companyName}</h2>
      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      {!jobId && (
        <>
          <p>
            We research what is publicly known about {companyName} and a panel of five AI experts debates and ranks the opportunities. It takes about 20 to 40 minutes. You can close this page: the analysis keeps running and
            the results will be here when you come back.
          </p>
          {latestDone && (
            <InlineAlert variant="info">
              An analysis finished on {when(latestDone.completedAt)} with {latestDone.opportunitiesFound} opportunities. You can carry on with it, or run a new one; earlier analyses are always kept.
            </InlineAlert>
          )}
          <div className="wizard-actions">
            {latestDone && (
              <Button onClick={() => onFinished(latestDone.id)}>Use the latest analysis</Button>
            )}
            <Button variant="primary" onClick={() => void start()} disabled={starting}>
              {starting ? "Starting…" : latestDone ? "Run a new analysis" : "Start analysis"}
            </Button>
          </div>
        </>
      )}

      {jobId && !job && <ProgressIndicator label="Loading the analysis…" />}

      {job?.status === "QUEUED" && (
        <>
          <StatusBadge label="Waiting for the Council" tone="accent" />
          <p>
            The expert panel handles one analysis at a time.
            {job.queuePosition && job.queuePosition > 1 ? ` There ${job.queuePosition - 1 === 1 ? "is 1 analysis" : `are ${job.queuePosition - 1} analyses`} ahead of this one.` : " This one starts next."} It will start by itself.
          </p>
        </>
      )}

      {job && (job.status === "RUNNING" || job.status === "SUCCEEDED") && (
        <>
          <div className="wizard-status">
            <StatusBadge label={job.status === "SUCCEEDED" ? "Finished" : "Running"} tone={job.status === "SUCCEEDED" ? "success" : "accent"} />
            {job.elapsedSeconds !== null && <span>{clock(job.elapsedSeconds)} elapsed · usually 20 to 40 minutes</span>}
          </div>
          <ol className="wizard-stages" aria-label="Analysis progress">
            {STAGES.map((s, i) => (
              <li key={s.key} className={i < index ? "is-done" : i === index ? "is-current" : ""} aria-current={i === index ? "step" : undefined}>
                <span aria-hidden="true">{i < index ? "✓" : i === index ? "●" : "○"}</span> {s.label}
              </li>
            ))}
          </ol>
          {job.progress?.expected && job.progress.expected.length > 0 && job.status === "RUNNING" && (
            <p className="wizard-experts">
              Experts that have answered this stage:{" "}
              {(job.progress.responded ?? []).length > 0 ? (job.progress.responded ?? []).join(", ") : "none yet"}
              {(job.progress.missing ?? []).length > 0 ? ` · still working: ${(job.progress.missing ?? []).join(", ")}` : ""}
            </p>
          )}
          {job.status === "RUNNING" && <p className="wizard-hint">You can close this page or sign out. Your analysis keeps running.</p>}
          {job.status === "SUCCEEDED" && (
            <p>
              {job.opportunitiesFound} {job.opportunitiesFound === 1 ? "opportunity was" : "opportunities were"} found.
            </p>
          )}
        </>
      )}

      {failed && job && (
        <>
          <InlineAlert variant="error">The analysis did not finish: {job.error?.message ?? job.error?.code ?? "unknown reason"}. Nothing was saved from it.</InlineAlert>
          <div className="wizard-actions">
            <Button variant="primary" onClick={() => void start()} disabled={starting}>
              {starting ? "Starting…" : "Try again"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
