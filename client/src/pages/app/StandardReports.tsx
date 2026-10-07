import { useState, type ReactNode } from "react";
import { api, apiFetch } from "../../api";
import { Button, InlineAlert, ReportPanel } from "../../components/ui";

interface StandardReport {
  type: string;
  report: string;
  model: string;
  createdAt: string | null;
}

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const DOC = svg(
  <>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4M10 12h5M10 16h5" />
  </>,
);

const REPORTS: { type: string; name: string; text: string; tone: string }[] = [
  { type: "executive-summary", name: "Executive Summary", text: "High-level progress and outcomes for stakeholders", tone: "blue" },
  { type: "portfolio", name: "Opportunity Portfolio Report", text: "Detailed analysis of all opportunities", tone: "purple" },
  { type: "evidence", name: "Evidence Report", text: "All sources and validation details", tone: "green" },
  { type: "pov-results", name: "PoV Results Report", text: "Outcomes from 14-day experiments", tone: "orange" },
  { type: "roi", name: "ROI & Business Case", text: "Financial impact and value realisation", tone: "purple" },
];

async function saveCsv(companyId: string | null, analysisId: string | null): Promise<void> {
  const parts = [companyId ? `companyId=${encodeURIComponent(companyId)}` : "", analysisId ? `analysisId=${encodeURIComponent(analysisId)}` : ""].filter(Boolean);
  const query = parts.length ? `?${parts.join("&")}` : "";
  const res = await apiFetch(`/exports/opportunities.csv${query}`);
  if (!res.ok) throw new Error("The export could not be downloaded.");
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "opportunities.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * The five standard AI-written reports plus a CSV export, for the selected company. Each report is generated on request
 * from the recorded data, shown with the model that wrote it, and never saved or sent anywhere without a click.
 */
export function StandardReports({ companyId, analysisId = null }: { companyId: string | null; analysisId?: string | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; report: StandardReport } | null>(null);

  async function generate(type: string, name: string) {
    setBusy(type);
    setError(null);
    try {
      const report = await api.post<StandardReport>(`/reports/standard/${type}`, { ...(companyId ? { companyId } : {}), ...(analysisId ? { analysisId } : {}) });
      setResult({ name, report });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The report could not be generated.");
    } finally {
      setBusy(null);
    }
  }

  async function exportData() {
    setBusy("export");
    setError(null);
    try {
      await saveCsv(companyId, analysisId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The export could not be downloaded.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      <ul className="report-list">
        {REPORTS.map((r) => (
          <li key={r.type} className="report-item">
            <span className={`report-item__icon report-item__icon--${r.tone}`} aria-hidden="true">
              {DOC}
            </span>
            <span className="report-item__text">
              <strong>{r.name}</strong>
              <span>{r.text}</span>
            </span>
            <Button onClick={() => void generate(r.type, r.name)} disabled={busy !== null} aria-label={`Generate ${r.name}`}>
              {busy === r.type ? "Generating…" : "Generate"}
            </Button>
          </li>
        ))}
        <li className="report-item">
          <span className="report-item__icon report-item__icon--purple" aria-hidden="true">
            {svg(<path d="M12 3v12M7 10l5 5 5-5M5 20h14" />)}
          </span>
          <span className="report-item__text">
            <strong>Export Data</strong>
            <span>Opportunities, value, evidence score and priority as a spreadsheet (CSV)</span>
          </span>
          <Button onClick={() => void exportData()} disabled={busy !== null} aria-label="Download Export Data">
            {busy === "export" ? "Preparing…" : "Download"}
          </Button>
        </li>
      </ul>

      {result && (
        <>
          <p className="report-note">
            Written by AI from the recorded data ({result.report.model}
            {result.report.createdAt ? `, ${new Date(result.report.createdAt).toLocaleDateString()}` : ""}). Read it before it is shared.
          </p>
          <ReportPanel title={result.name} text={result.report.report} meta="AI-generated report" />
        </>
      )}
    </>
  );
}
