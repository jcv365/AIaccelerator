import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiFetch } from "../../api";
import { useCompany } from "../../company/CompanyContext";
import { Button, DataTable, InlineAlert, PageHeader, ProgressIndicator, StatusBadge } from "../../components/ui";
import "./lists.css";
import "./reports.css";

type Status = "GENERATING" | "DRAFT" | "APPROVED" | "FAILED";
type Audience = "C_LEVEL" | "TECHNICAL";
type Format = "PPTX" | "DOCX";

interface ReportFile {
  audience: Audience;
  format: Format;
  filename: string;
  sizeBytes: number;
}

interface QualityCheck {
  id: string;
  name: string;
  passed: boolean;
  details: string[];
}

interface ReportView {
  id: string;
  version: number;
  status: Status;
  stage: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  summary: { headline: string; opportunities: number; sources: number } | null;
  quality: { passed: boolean; checks: QualityCheck[] } | null;
  files: ReportFile[];
}

const FILE_ORDER: Array<{ audience: Audience; format: Format; title: string }> = [
  { audience: "C_LEVEL", format: "PPTX", title: "Deck (.pptx)" },
  { audience: "C_LEVEL", format: "DOCX", title: "Proposal (.docx)" },
  { audience: "TECHNICAL", format: "PPTX", title: "Deck (.pptx)" },
  { audience: "TECHNICAL", format: "DOCX", title: "Proposal (.docx)" },
];

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function statusBadge(r: ReportView) {
  if (r.status === "GENERATING") return <StatusBadge label="Writing…" tone="accent" />;
  if (r.status === "DRAFT") return <StatusBadge label="Draft: AI-generated, verify before sharing" tone="caution" />;
  if (r.status === "APPROVED") return <StatusBadge label={`Approved${r.approvedBy ? ` by ${r.approvedBy}` : ""}`} tone="success" />;
  return <StatusBadge label={r.quality && !r.quality.passed ? "Did not pass quality checks" : "Could not be written"} tone="danger" />;
}

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

export default function ReportsAndExports({ pollIntervalMs = 5000 }: { pollIntervalMs?: number }) {
  const { ready, current } = useCompany();
  const companyId = current?.id ?? null;
  const [reports, setReports] = useState<ReportView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"start" | "approve" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await api.get<{ reports: ReportView[] }>(`/reports?companyId=${encodeURIComponent(companyId)}`);
      setReports(data.reports);
      setLoadError(null);
    } catch {
      setLoadError("Could not load the reports.");
    }
  }, [companyId]);

  // A different company must never show the previous company's reports.
  useEffect(() => {
    setReports(null);
    setShownId(null);
    setActionError(null);
    setLoadError(null);
    void load();
  }, [load]);

  const writing = reports?.some((r) => r.status === "GENERATING") ?? false;
  useEffect(() => {
    if (!writing) return;
    const timer = setInterval(() => void load(), pollIntervalMs);
    return () => clearInterval(timer);
  }, [writing, load, pollIntervalMs]);

  async function start() {
    if (!companyId) return;
    setBusy("start");
    setActionError(null);
    try {
      await api.post("/reports", { companyId });
      setShownId(null); // show the new version as soon as it exists
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not start the report.");
    } finally {
      setBusy(null);
    }
  }

  async function approve(id: string) {
    setBusy("approve");
    setActionError(null);
    try {
      await api.post(`/reports/${id}/approve`, {});
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not approve the report.");
    } finally {
      setBusy(null);
    }
  }

  async function download(report: ReportView, file: ReportFile) {
    setActionError(null);
    try {
      await saveFile(report.id, file);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The file could not be downloaded.");
    }
  }

  const header = (
    <PageHeader
      title="Reports & Exports"
      description={
        current
          ? `${current.name} · one report set for the whole company: an executive briefing and a technical briefing, each as a deck and a proposal.`
          : "One report set for a whole company: an executive briefing and a technical briefing, each as a deck and a proposal."
      }
    />
  );

  if (!ready) {
    return (
      <main>
        {header}
        <ProgressIndicator label="Loading…" />
      </main>
    );
  }
  if (!current) {
    return (
      <main>
        {header}
        <InlineAlert variant="info">Add or select a company (top right) to see its reports.</InlineAlert>
      </main>
    );
  }
  if (loadError && !reports) {
    return (
      <main>
        {header}
        <InlineAlert variant="error">{loadError}</InlineAlert>
      </main>
    );
  }
  if (!reports) {
    return (
      <main>
        {header}
        <ProgressIndicator label="Loading reports…" />
      </main>
    );
  }

  const noOpportunities = current.opportunityCount === 0;
  if (reports.length === 0 && noOpportunities) {
    return (
      <main>
        {header}
        <div className="reports-empty">
          <h2>No opportunities for {current.name} yet</h2>
          <p>Run an analysis first. A report brings together all of a company's opportunities, evidence, decisions and experiments.</p>
          <Link className="btn btn--primary" to="/app/analyze">
            Start an analysis
          </Link>
        </div>
      </main>
    );
  }

  const shown = reports.find((r) => r.id === shownId) ?? reports[0];
  const startLabel = reports.length === 0 ? "Write the first report" : "Write a new version";

  return (
    <main>
      {header}
      <div className="reports-toolbar">
        <Button variant="primary" onClick={start} disabled={busy !== null || writing || noOpportunities}>
          {busy === "start" ? "Starting…" : startLabel}
        </Button>
        {writing && <span className="reports-toolbar__hint">Only one report is written at a time.</span>}
      </div>
      {actionError && <InlineAlert variant="error">{actionError}</InlineAlert>}
      {loadError && <InlineAlert variant="error">{loadError}</InlineAlert>}

      {reports.length === 0 && (
        <InlineAlert variant="info">
          No report has been written for {current.name} yet. It takes about 10 to 20 minutes and runs in the background, so you can leave this page.
        </InlineAlert>
      )}

      {shown && (
        <section className="report-card" aria-label={`Version ${shown.version}`}>
          <div className="report-card__head">
            <h2>Version {shown.version}</h2>
            {statusBadge(shown)}
            {shown.summary && (
              <span className="report-card__meta">
                Written {date(shown.completedAt ?? shown.createdAt)} · {shown.summary.opportunities} {shown.summary.opportunities === 1 ? "opportunity" : "opportunities"} · {shown.summary.sources} public{" "}
                {shown.summary.sources === 1 ? "source" : "sources"}
              </span>
            )}
          </div>

          {shown.status === "GENERATING" && (
            <>
              <ProgressIndicator label={shown.stage ?? "Starting"} />
              <p className="report-card__hint">Each section is written, checked and repaired separately. Nothing is offered for download until every quality check passes.</p>
            </>
          )}

          {shown.status === "FAILED" && (
            <InlineAlert variant="error">{shown.error ?? "The report could not be written."} Nothing was offered for download. You can write a new version.</InlineAlert>
          )}

          {(shown.status === "DRAFT" || shown.status === "APPROVED") && (
            <>
              {shown.status === "DRAFT" && (
                <InlineAlert variant="caution">Read the files before they go to a client. Approving locks this version and removes the draft mark from all four files.</InlineAlert>
              )}
              {shown.status === "APPROVED" && <p className="report-card__hint">Approved {date(shown.approvedAt)}. This version is locked; write a new version to change anything.</p>}
              <div className="report-files">
                {FILE_ORDER.map((slot) => {
                  const file = shown.files.find((f) => f.audience === slot.audience && f.format === slot.format);
                  const who = slot.audience === "C_LEVEL" ? "C-level" : "Technical";
                  return (
                    <div className="report-file" key={`${slot.audience}-${slot.format}`}>
                      <div className="report-file__kind">{who}</div>
                      <div className="report-file__name">{slot.title}</div>
                      <div className="report-file__meta">{file ? size(file.sizeBytes) : "Not available"}</div>
                      <Button disabled={!file} onClick={() => file && void download(shown, file)} aria-label={`Download ${who} ${slot.title}`}>
                        Download
                      </Button>
                    </div>
                  );
                })}
              </div>
              {shown.status === "DRAFT" && (
                <div>
                  <Button variant="primary" onClick={() => void approve(shown.id)} disabled={busy !== null}>
                    {busy === "approve" ? "Approving…" : "Approve this version"}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {shown?.quality && (
        <section className="report-card" aria-label="Quality checks">
          <h2>{shown.quality.passed ? "Quality checks (all passed)" : "Quality checks"}</h2>
          <ul className="report-checks">
            {shown.quality.checks.map((c) => (
              <li key={c.id} className={c.passed ? "is-pass" : "is-fail"}>
                <span aria-hidden="true">{c.passed ? "✓" : "✕"}</span> <span className="sr-only">{c.passed ? "Passed: " : "Failed: "}</span>
                {c.name}
                {!c.passed && c.details.length > 0 && (
                  <ul className="report-checks__details">
                    {c.details.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {reports.length > 0 && (
        <section className="report-card" aria-label="Versions">
          <h2>Versions</h2>
          <DataTable
            columns={[
              { key: "version", header: "Version", render: (r: ReportView) => r.version },
              { key: "status", header: "Status", render: (r: ReportView) => statusBadge(r) },
              { key: "written", header: "Written", render: (r: ReportView) => date(r.completedAt ?? r.createdAt) },
              {
                key: "show",
                header: "",
                render: (r: ReportView) =>
                  r.id === shown?.id ? (
                    "Shown above"
                  ) : (
                    <Button onClick={() => setShownId(r.id)} aria-label={`Show version ${r.version}`}>
                      Show
                    </Button>
                  ),
              },
            ]}
            rows={reports}
            getRowKey={(r) => r.id}
          />
        </section>
      )}
    </main>
  );
}
