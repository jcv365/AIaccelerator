import { useState, useEffect } from "react";
import { Button, InlineAlert, TextField } from "../components/ui";
import { api } from "../api";
import { useCompany } from "../company/CompanyContext";
import "./StartAnalysis.css";

type Status = "empty" | "running" | "error" | "success";

type AnalysisJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  opportunitiesFound: number;
  error: { code: string; message: string | null } | null;
};

type StoredJob = { jobId: string; companyName: string; startedAtMs: number };

const STORAGE_KEY = "startAnalysis.job";
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

// No scoring backend exists yet, so every gauge honestly reads NO DATA.
const GAUGE_LABELS = ["Evidence Strength", "Source Coverage", "AI Confidence", "Risk", "Feasibility", "Value"];

function loadStoredJob(): StoredJob | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredJob>;
    if (typeof parsed.jobId === "string" && typeof parsed.companyName === "string" && typeof parsed.startedAtMs === "number") {
      return parsed as StoredJob;
    }
  } catch {
    // storage unavailable or corrupt: behave as if there is no stored job
  }
  return null;
}

function storeJob(job: StoredJob | null) {
  try {
    if (job) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(job));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // resume-after-navigation is a convenience only
  }
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function StartAnalysis({ pollIntervalMs = 5000 }: { pollIntervalMs?: number }) {
  const { refresh } = useCompany();
  const [stored] = useState<StoredJob | null>(loadStoredJob);
  const [companyName, setCompanyName] = useState(stored?.companyName ?? "");
  const [job, setJob] = useState<StoredJob | null>(stored);
  const [status, setStatus] = useState<Status>(stored ? "running" : "empty");
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [opportunitiesFound, setOpportunitiesFound] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const isRunning = status === "running";

  // Poll the background job until it finishes; the analysis itself runs server-side for minutes.
  useEffect(() => {
    if (!job) return;
    let cancelled = false;
    let consecutiveErrors = 0;

    function finish(next: Status, message: string) {
      storeJob(null);
      setJob(null);
      setStatus(next);
      setAnnouncement(message);
    }

    async function poll() {
      try {
        const result = await api.get<AnalysisJob>(`/opportunities/analyze/${job!.jobId}`);
        if (cancelled) return;
        consecutiveErrors = 0;
        if (result.status === "SUCCEEDED") {
          setOpportunitiesFound(result.opportunitiesFound);
          finish("success", "Analysis complete.");
        } else if (result.status === "FAILED") {
          setError(result.error?.message ?? "Analysis failed. Try again.");
          finish("error", "Analysis failed.");
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Could not check analysis status.";
        consecutiveErrors += 1;
        // A missing job never comes back; transient network errors get a few retries.
        if (/not found/i.test(message) || consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
          setError(message);
          finish("error", "Analysis failed.");
        }
      }
    }

    void poll();
    const pollTimer = setInterval(() => void poll(), pollIntervalMs);
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      clearInterval(clockTimer);
    };
  }, [job, pollIntervalMs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = companyName.trim();
    if (!name) {
      setError("Company name is required");
      setStatus("error");
      setAnnouncement("Company name is required");
      return;
    }
    setError(null);
    setOpportunitiesFound(null);
    setStatus("running");
    setAnnouncement("Starting analysis…");

    try {
      const { jobId, companyId } = await api.post<{ jobId: string; companyId?: string }>("/opportunities/analyze", {
        companyName: name,
      });
      // The server found or created the company for this name: reload the list and select it so the
      // top bar and every screen follow the company being analysed.
      if (companyId) void refresh(companyId).catch(() => {});
      const started: StoredJob = { jobId, companyName: name, startedAtMs: Date.now() };
      storeJob(started);
      setNow(started.startedAtMs);
      setJob(started);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Try again.");
      setStatus("error");
      setAnnouncement("Analysis failed.");
    }
  }

  return (
    <main>
      <h1>Start Analysis</h1>
      <p className="start-analysis__intro">
        Enter a company name to generate an AI opportunity report backed by live research.
      </p>

      <form className="start-analysis__form" onSubmit={handleSubmit} data-testid="start-analysis-form">
        <TextField
          label="Company name"
          placeholder="e.g. Acme Manufacturing"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          disabled={isRunning}
          required
        />
        <Button type="submit" variant="primary" disabled={isRunning}>
          {isRunning ? "Generating…" : "Generate Intelligence"}
        </Button>
      </form>

      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      {isRunning && job && (
        <InlineAlert variant="info">
          Researching {job.companyName}… {formatElapsed(now - job.startedAtMs)} elapsed. This usually takes several
          minutes — you can leave this page and come back.
        </InlineAlert>
      )}

      {status === "error" && error && <InlineAlert variant="error">{error}</InlineAlert>}

      {status === "success" && opportunitiesFound !== null && (
        <InlineAlert variant="info">
          Analysis complete — found {opportunitiesFound} opportunit{opportunitiesFound === 1 ? "y" : "ies"}.
          <br />
          <a href="/app/portfolio" style={{ color: "var(--color-accent)", textDecoration: "underline" }}>
            View in Opportunity Portfolio
          </a>
        </InlineAlert>
      )}

      <div className="gauge-grid">
        {GAUGE_LABELS.map((label) => (
          <div key={label} className="gauge gauge--nodata">
            <div className="gauge__reading">NO DATA</div>
            <div className="gauge__track">
              <span style={{ width: "0%" }} />
            </div>
            <div className="gauge__label">{label}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
