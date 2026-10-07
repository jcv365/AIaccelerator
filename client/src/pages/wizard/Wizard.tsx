import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { useCompany } from "../../company/CompanyContext";
import { PageHeader, ProgressIndicator } from "../../components/ui";
import { AnalysisStep } from "./AnalysisStep";
import { CompanyStep } from "./CompanyStep";
import { OpportunitiesStep } from "./OpportunitiesStep";
import { ReportStep } from "./ReportStep";
import "./wizard.css";

const STEPS = ["Company", "Analysis", "Opportunities", "Report"] as const;
type StepNumber = 1 | 2 | 3 | 4;

/**
 * The guided path from a company to a finished report: Company, Analysis, Opportunities, Report. Everything is
 * rebuilt from the server (company, running analysis, runs, reports), so closing the page never loses progress.
 */
export default function Wizard({ pollIntervalMs = 5000 }: { pollIntervalMs?: number }) {
  const { ready, current, runs, refreshRuns } = useCompany();
  const [step, setStep] = useState<StepNumber>(1);
  const [checkedFor, setCheckedFor] = useState<string | null>(null);

  // Coming back to the wizard while an analysis is queued or running: go straight to it.
  useEffect(() => {
    if (!ready || !current || checkedFor === current.id) return;
    setCheckedFor(current.id);
    apiFetch(`/companies/${encodeURIComponent(current.id)}/analysis-jobs`)
      .then((res) => (res.ok ? res.json() : []))
      .then((jobs: Array<{ status: string }>) => {
        if (jobs.some((j) => j.status === "QUEUED" || j.status === "RUNNING")) setStep(2);
      })
      .catch(() => undefined);
  }, [ready, current, checkedFor]);

  const finished = useCallback(
    async (jobId: string) => {
      await refreshRuns(jobId); // the run that just finished becomes the one the rest of the app shows
      setStep(3);
    },
    [refreshRuns]
  );

  if (!ready) {
    return (
      <main>
        <PageHeader title="New analysis" />
        <ProgressIndicator label="Loading…" />
      </main>
    );
  }

  const reachable = (n: number) => n === 1 || (n === 2 && !!current) || (n >= 3 && !!current && runs.length > 0);

  return (
    <main>
      <PageHeader title="New analysis" description="Choose a company, run the analysis, review the opportunities and write the report." />
      <ol className="wizard-steps" aria-label="Steps">
        {STEPS.map((label, i) => {
          const n = (i + 1) as StepNumber;
          return (
            <li key={label} className={n === step ? "is-current" : n < step ? "is-done" : ""} aria-current={n === step ? "step" : undefined}>
              <button type="button" onClick={() => setStep(n)} disabled={!reachable(n)}>
                <span className="wizard-steps__num" aria-hidden="true">
                  {n < step ? "✓" : n}
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>

      {step === 1 && <CompanyStep onNext={() => setStep(2)} />}
      {step === 2 && current && <AnalysisStep companyId={current.id} companyName={current.name} pollIntervalMs={pollIntervalMs} onFinished={(id) => void finished(id)} />}
      {step === 3 && <OpportunitiesStep onBack={() => setStep(2)} onNext={() => setStep(4)} />}
      {step === 4 && <ReportStep onBack={() => setStep(3)} pollIntervalMs={pollIntervalMs} />}
    </main>
  );
}
