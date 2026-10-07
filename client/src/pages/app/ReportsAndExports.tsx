import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiFetch } from "../../api";
import { useCompany } from "../../company/CompanyContext";
import { Button, DataTable, InlineAlert, PageHeader, ProgressIndicator, StatusBadge, TabPanel, Tabs } from "../../components/ui";
import { StandardReports } from "./StandardReports";
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

function CompanyReports({ pollIntervalMs = 5000 }: { pollIntervalMs?: number }) {
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


  if (!ready) {
    return (
      <>
        <ProgressIndicator label="Loading…" />
      </>
    );
  }
  if (!current) {
    return (
      <>
        <InlineAlert variant="info">Add or select a company (top right) to see its reports.</InlineAlert>
      </>
    );
  }
  if (loadError && !reports) {
    return (
      <>
        <InlineAlert variant="error">{loadError}</InlineAlert>
      </>
    );
  }
  if (!reports) {
    return (
      <>
        <ProgressIndicator label="Loading reports…" />
      </>
    );
  }

  const noOpportunities = current.opportunityCount === 0;
  if (reports.length === 0 && noOpportunities) {
    return (
      <>
        <div className="reports-empty">
          <h2>No opportunities for {current.name} yet</h2>
          <p>Run an analysis first. A report brings together all of a company's opportunities, evidence, decisions and experiments.</p>
          <Link className="btn btn--primary" to="/app/analyze">
            Start an analysis
          </Link>
        </div>
      </>
    );
  }

  const shown = reports.find((r) => r.id === shownId) ?? reports[0];
  const startLabel = reports.length === 0 ? "Write the first report" : "Write a new version";

  return (
    <>
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
                <span aria-hidden="true" className="report-check__mark">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {c.passed ? <path d="M3 8.5l3.2 3L13 4.5" /> : <path d="M4 4l8 8M12 4l-8 8" />}
                  </svg>
                </span>{" "}
                <span className="sr-only">{c.passed ? "Passed: " : "Failed: "}</span>
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
    </>
  );
}

type TabId = "standard" | "custom" | "scheduled" | "company";

const TABS: { id: TabId; label: string }[] = [
  { id: "standard", label: "Standard Reports" },
  { id: "custom", label: "Custom Reports" },
  { id: "scheduled", label: "Scheduled Reports" },
  { id: "company", label: "Company Briefings" },
];

export default function ReportsAndExports({ pollIntervalMs, initialTab = "standard" }: { pollIntervalMs?: number; initialTab?: TabId }) {
  const { current } = useCompany();
  const [tab, setTab] = useState<TabId>(initialTab);

  return (
    <main>
      <PageHeader title="Reports & Exports" description="Generate reports for stakeholders and track progress." />
      <Tabs items={TABS} activeId={tab} onChange={(id) => setTab(id as TabId)} aria-label="Report types" />

      <TabPanel id="standard" activeId={tab}>
        <StandardReports companyId={current?.id ?? null} />
      </TabPanel>

      <TabPanel id="custom" activeId={tab}>
        <InlineAlert variant="info">Custom reports are not available yet. The five standard reports and the data export cover what can be generated today.</InlineAlert>
      </TabPanel>

      <TabPanel id="scheduled" activeId={tab}>
        <InlineAlert variant="info">Scheduled reports are not available yet. They need a background scheduler that does not exist, so nothing is sent automatically.</InlineAlert>
      </TabPanel>

      <TabPanel id="company" activeId={tab}>
        <p className="report-note">
          {current
            ? `${current.name} · one report set for the whole company: an executive briefing and a technical briefing, each as a deck and a proposal.`
            : "One report set for a whole company: an executive briefing and a technical briefing, each as a deck and a proposal."}
        </p>
        <CompanyReports pollIntervalMs={pollIntervalMs} />
      </TabPanel>
    </main>
  );
}
