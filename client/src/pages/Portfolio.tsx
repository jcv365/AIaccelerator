import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { useCompanyPath } from "../company/CompanyContext";
import { DataTable, InlineAlert, PageHeader, Pagination, PriorityBadge, ProgressIndicator, Select, StatusBadge, TextField } from "../components/ui";
import {
  effectiveCategory,
  effectivePriority,
  effectiveValue,
  formatRand,
  valueSource,
  type OpportunityRow,
} from "../lib/opportunity";
import "./Portfolio.css";

const STATUS_ORDER = [
  "DISCOVERED",
  "QUALIFIED",
  "HYPOTHESIS",
  "EXPERIMENT",
  "PROVING",
  "PROVEN",
  "REJECTED",
  "DEFERRED",
  "NO_AI",
] as const;

const PAGE_SIZE = 10;

function statusTone(status: string) {
  if (status === "PROVEN") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "NO_AI" || status === "DEFERRED") return "caution";
  return "accent";
}

/** "NO_AI" -> "No-AI", "PROVING" -> "Proving". */
function statusLabel(status: string): string {
  if (status === "NO_AI") return "No-AI";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default function Portfolio() {
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const path = useCompanyPath("/opportunities");
  useEffect(() => {
    if (path === undefined) return; // companies still loading
    if (path === null) {
      setOpportunities([]); // no company yet: show the empty state
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch(path)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => setOpportunities(Array.isArray(data) ? data : []))
      .catch(() => setError("Could not load opportunities."))
      .finally(() => setLoading(false));
  }, [path]);

  const categories = useMemo(
    () => [...new Set(opportunities.map(effectiveCategory).filter((c): c is string => !!c))].sort(),
    [opportunities],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return opportunities.filter(
      (o) =>
        (!needle || o.title.toLowerCase().includes(needle)) &&
        (!category || effectiveCategory(o) === category) &&
        (!priority || effectivePriority(o) === priority) &&
        (!status || o.status === status),
    );
  }, [opportunities, search, category, priority, status]);

  // A filter change can leave the current page past the end: go back to the first page.
  const lastPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, lastPage);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const onFilter = (set: (v: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value);
    setPage(1);
  };

  return (
    <main>
      <PageHeader
        title="Opportunity Portfolio"
        description="All identified AI opportunities, scored and prioritised using evidence."
      />
      {loading && <ProgressIndicator label="Loading opportunities…" />}
      {!loading && error && <InlineAlert variant="error">{error}</InlineAlert>}
      {!loading && !error && opportunities.length === 0 && (
        <>
          <InlineAlert variant="info">No opportunities yet. Start a new analysis or add one manually.</InlineAlert>
          <Link className="btn btn--primary" to="/app/opportunities/new">
            <span aria-hidden="true">+</span> Add opportunity
          </Link>
        </>
      )}

      {!loading && !error && opportunities.length > 0 && (
        <>
          <div className="portfolio__filters">
            <TextField label="Search" type="search" value={search} onChange={onFilter(setSearch)} placeholder="Search opportunities" />
            <Select label="Category" value={category} onChange={onFilter(setCategory)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select label="Priority" value={priority} onChange={onFilter(setPriority)}>
              <option value="">All priorities</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </Select>
            <Select label="Status" value={status} onChange={onFilter(setStatus)}>
              <option value="">All statuses</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </Select>
            <Link className="btn btn--primary portfolio__add" to="/app/opportunities/new">
              <span aria-hidden="true">+</span> Add opportunity
            </Link>
          </div>

          <DataTable
            rows={visible}
            getRowKey={(row) => row.id}
            emptyMessage="No opportunities match these filters."
            columns={[
              { key: "n", header: "#", render: (row) => pageStart + visible.indexOf(row) + 1 },
              { key: "title", header: "Opportunity", render: (row) => <Link to={`/app/opportunities/${row.id}`}>{row.title}</Link> },
              { key: "category", header: "Category", render: (row) => effectiveCategory(row) ?? "—" },
              {
                key: "value",
                header: "Business value",
                render: (row) => (
                  <>
                    {formatRand(effectiveValue(row))}
                    {valueSource(row) === "ai" && <span className="portfolio__ai-tag"> AI estimate</span>}
                  </>
                ),
              },
              { key: "evidence", header: "Evidence score", render: (row) => (row.evidenceScore === null ? "Not scored" : `${row.evidenceScore}/100`) },
              { key: "priority", header: "Priority", render: (row) => <PriorityBadge priority={effectivePriority(row)} /> },
              { key: "status", header: "Status", render: (row) => <StatusBadge label={statusLabel(row.status)} tone={statusTone(row.status)} /> },
            ]}
          />
          <Pagination page={currentPage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
        </>
      )}
    </main>
  );
}
