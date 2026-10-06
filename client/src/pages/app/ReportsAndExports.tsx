import { useEffect, useState } from "react";
import { api, apiFetch } from "../../api";
import { useCompanyPath } from "../../company/CompanyContext";
import { Button, DataTable, InlineAlert, PageHeader, ProgressIndicator, ReportPanel, Select } from "../../components/ui";
import "./lists.css";

interface OpportunitySummary {
  id: string;
  title: string;
}

// Only the single-opportunity narrative report has a backend (POST /opportunities/:id/report).
// Every other type below is a placeholder contract — no portfolio/ROI/scheduled/export backend exists.
const UNAVAILABLE_REPORTS = [
  "Executive summary",
  "Portfolio report",
  "Evidence report",
  "PoV results report",
  "ROI report",
  "Export data (CSV)",
];

export default function ReportsAndExports() {
  const [options, setOptions] = useState<OpportunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const path = useCompanyPath("/opportunities");
  useEffect(() => {
    if (path === undefined) return; // companies still loading
    if (path === null) {
      setOptions([]); // no company yet: show the empty state
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch(path)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: OpportunitySummary[]) => {
        setOptions(data);
        // Another company's selection (and any report shown for it) must not linger.
        setSelectedId((current) => (data.some((o) => o.id === current) ? current : ""));
        setReport(null);
      })
      .catch(() => setError("Could not load opportunities."))
      .finally(() => setLoading(false));
  }, [path]);

  async function generate() {
    setReport(null);
    setReportError(null);
    setGenerating(true);
    try {
      const result = await api.post<{ report: string }>(`/opportunities/${selectedId}/report`, {});
      setReport(result.report);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Failed to generate the report.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main>
      <PageHeader title="Reports & Exports" description="Generate a written report for an opportunity, or export your data." />
      {loading && <ProgressIndicator label="Loading opportunities…" />}
      {!loading && error && <InlineAlert variant="error">{error}</InlineAlert>}

      {!loading && !error && (
        <>
          <section>
            <h2>Opportunity report</h2>
            {options.length === 0 ? (
              <InlineAlert variant="info">No opportunities yet, so there is nothing to report on.</InlineAlert>
            ) : (
              <>
                <Select label="Opportunity" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                  <option value="">Select an opportunity…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </Select>
                <Button variant="primary" onClick={generate} disabled={!selectedId || generating}>
                  {generating ? "Generating…" : "Generate report"}
                </Button>
                {generating && <ProgressIndicator label="Generating report…" />}
                {reportError && <InlineAlert variant="error">{reportError}</InlineAlert>}
                {report && (
                  <ReportPanel
                    title={options.find((o) => o.id === selectedId)?.title ?? "Opportunity report"}
                    text={report}
                    meta="Generated report"
                  />
                )}
              </>
            )}
          </section>

          <section>
            <h2>Other reports</h2>
            <DataTable
              columns={[
                { key: "name", header: "Report", render: (name: string) => name },
                {
                  key: "action",
                  header: "Action",
                  render: (name: string) => (
                    <Button disabled aria-label={`${name} — not yet available`}>
                      Not yet available
                    </Button>
                  ),
                },
              ]}
              rows={UNAVAILABLE_REPORTS}
              getRowKey={(name) => name}
            />
          </section>
        </>
      )}
    </main>
  );
}
