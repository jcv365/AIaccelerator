import { useState } from "react";
import { Button, InlineAlert, ProgressIndicator, TextAreaField } from "../../ui";

export interface ReasoningTabProps {
  hypothesis: string | null;
  onSaveHypothesis: (hypothesis: string) => void;
  onGenerateReport: () => Promise<string>;
}

export function ReasoningTab({ hypothesis, onSaveHypothesis, onGenerateReport }: ReasoningTabProps) {
  const [draft, setDraft] = useState(hypothesis ?? "");
  const [report, setReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    onSaveHypothesis(draft);
  }

  async function handleGenerate() {
    setReportError(null);
    setReportLoading(true);
    try {
      const result = await onGenerateReport();
      setReport(result);
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
      {report && <pre>{report}</pre>}
    </section>
  );
}
