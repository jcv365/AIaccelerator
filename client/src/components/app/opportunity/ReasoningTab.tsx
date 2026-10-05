import { useEffect, useState } from "react";
import { Button, InlineAlert, ProgressIndicator, TextAreaField } from "../../ui";

/** A generated report; createdAt is null when the server could not save it. */
export interface ReportData {
  report: string;
  createdAt: string | null;
}

export interface ReasoningTabProps {
  hypothesis: string | null;
  onSaveHypothesis: (hypothesis: string) => void;
  onGenerateReport: () => Promise<ReportData>;
  /** The newest saved report, or null if there is none (never rejects). */
  onLoadSavedReport: () => Promise<ReportData | null>;
}

export function ReasoningTab({ hypothesis, onSaveHypothesis, onGenerateReport, onLoadSavedReport }: ReasoningTabProps) {
  const [draft, setDraft] = useState(hypothesis ?? "");
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Show the most recent saved report straight away, so a refresh doesn't lose it.
  useEffect(() => {
    let cancelled = false;
    onLoadSavedReport().then((saved) => {
      // A report generated while this was loading is newer; never overwrite it.
      if (!cancelled && saved) setReport((current) => current ?? saved);
    });
    return () => {
      cancelled = true;
    };
    // Load once per mount; the handler identity changes every render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    onSaveHypothesis(draft);
  }

  async function handleGenerate() {
    setReportError(null);
    setReportLoading(true);
    try {
      setReport(await onGenerateReport());
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Failed to generate report.");
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <section>
      <h2>Reasoning</h2>
      <form onSubmit={handleSave}>
        <TextAreaField label="Hypothesis" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Button type="submit" variant="primary">
          Save
        </Button>
      </form>
      <h2>Report</h2>
      <Button onClick={handleGenerate} disabled={reportLoading}>
        {reportLoading ? "Generating..." : "Generate Report"}
      </Button>
      {reportLoading && <ProgressIndicator label="Generating report…" />}
      {reportError && <InlineAlert variant="error">{reportError}</InlineAlert>}
      {report && (
        <>
          <p>
            {report.createdAt
              ? `Generated ${new Date(report.createdAt).toLocaleString()}`
              : "This report could not be saved and will be lost when you leave this page."}
          </p>
          <pre className="report-output">{report.report}</pre>
        </>
      )}
    </section>
  );
}
