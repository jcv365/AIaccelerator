import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiFetch } from "../../api";
import { useCompany } from "../../company/CompanyContext";
import { Button, InlineAlert, ProgressIndicator, StatusBadge } from "../../components/ui";

interface ReportFile {
  audience: "C_LEVEL" | "TECHNICAL";
  format: "PPTX" | "DOCX";
  filename: string;
  sizeBytes: number;
}

interface ReportView {
  id: string;
  version: number;
  status: "GENERATING" | "DRAFT" | "APPROVED" | "FAILED";
  stage: string | null;
  error: string | null;
  analysis: { id: string; ranAt: string } | null;
  files: ReportFile[];
}

const SLOTS: Array<{ audience: ReportFile["audience"]; format: ReportFile["format"]; label: string }> = [
  { audience: "C_LEVEL", format: "PPTX", label: "C-level deck" },
  { audience: "C_LEVEL", format: "DOCX", label: "C-level proposal" },
  { audience: "TECHNICAL", format: "PPTX", label: "Technical deck" },
  { audience: "TECHNICAL", format: "DOCX", label: "Technical proposal" },
];

async function saveFile(reportId: string, file: ReportFile): Promise<void> {
  const res = await apiFetch(`/reports/${reportId}/files/${file.audience}/${file.format}`);
  if (!res.ok) throw new Error("The file could not be downloaded.");
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Writes the company report (two decks and two proposals) for the chosen analysis run and offers the downloads. */
export function ReportStep({ onBack, pollIntervalMs = 5000 }: { onBack: () => void; pollIntervalMs?: number }) {
  const { current, runId, runsReady } = useCompany();
  const companyId = current?.id ?? null;
  const [reports, setReports] = useState<ReportView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await api.get<{ reports: ReportView[] }>(`/reports?companyId=${encodeURIComponent(companyId)}`);
      setReports(data.reports);
    } catch {
      setError("Could not load the reports.");
    }
  }, [companyId]);

  useEffect(() => {
    setReports(null);
    void load();
  }, [load]);

  // The newest report written for this analysis run (or for all runs together when none is chosen).
  const report = reports?.find((r) => (r.analysis?.id ?? null) === runId) ?? null;
  const writing = reports?.some((r) => r.status === "GENERATING") ?? false;

  useEffect(() => {
    if (!writing) return;
    const timer = setInterval(() => void load(), pollIntervalMs);
    return () => clearInterval(timer);
  }, [writing, load, pollIntervalMs]);

  async function start() {
    if (!companyId) return;
    setStarting(true);
    setError(null);
    try {
      await api.post("/reports", { companyId, ...(runId ? { analysisId: runId } : {}) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the report.");
    } finally {
      setStarting(false);
    }
  }

  async function download(file: ReportFile) {
    if (!report) return;
    try {
      await saveFile(report.id, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file could not be downloaded.");
    }
  }

  return (
    <section className="wizard-panel" aria-label="Report">
      <h2>Your report</h2>
      <p>
        A report set has two decks and two proposals: one for executives and one for the technical team. It takes about 5 to 20 minutes to write and keeps going if you leave this page. Every report starts as a draft that you
        review before it goes to a client.
      </p>
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      {!reports && !error && <ProgressIndicator label="Loading…" />}

      {reports && !report && (
        <div className="wizard-actions">
          <Button onClick={onBack}>Back</Button>
          <Button variant="primary" onClick={() => void start()} disabled={starting || writing || !runsReady}>
            {starting ? "Starting…" : writing ? "Another report is being written…" : "Write the report"}
          </Button>
        </div>
      )}

      {report?.status === "GENERATING" && <ProgressIndicator label={report.stage ?? "Starting"} />}

      {report?.status === "FAILED" && (
        <>
          <InlineAlert variant="error">The report could not be written: {report.error ?? "unknown reason"}. Nothing was offered for download.</InlineAlert>
          <div className="wizard-actions">
            <Button onClick={onBack}>Back</Button>
            <Button variant="primary" onClick={() => void start()} disabled={starting || writing}>
              Try again
            </Button>
          </div>
        </>
      )}

      {report && (report.status === "DRAFT" || report.status === "APPROVED") && (
        <>
          <div className="wizard-status">
            <StatusBadge label={report.status === "DRAFT" ? "Draft: AI-generated, verify before sharing" : "Approved"} tone={report.status === "DRAFT" ? "caution" : "success"} />
            <span>Version {report.version}</span>
          </div>
          <div className="wizard-downloads">
            {SLOTS.map((slot) => {
              const file = report.files.find((f) => f.audience === slot.audience && f.format === slot.format);
              return (
                <Button key={slot.label} disabled={!file} onClick={() => file && void download(file)} aria-label={`Download ${slot.label}`}>
                  {slot.label}
                </Button>
              );
            })}
          </div>
          <p className="wizard-hint">
            Read the files before sharing them. <Link to="/app/reports">Review the quality checks and approve the report</Link> on the Reports page.
          </p>
          <div className="wizard-actions">
            <Button onClick={onBack}>Back</Button>
          </div>
        </>
      )}
    </section>
  );
}
