import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { useCompanyPath } from "../../company/CompanyContext";
import { DataTable, EvidenceTag, InlineAlert, PageHeader, ProgressIndicator, Select, TextField } from "../../components/ui";
import "./lists.css";

interface EvidenceRow {
  id: string;
  claim: string;
  type: string;
  source?: string | null;
  capturedAt: string;
  opportunity: { id: string; title: string };
}

const TYPES = ["ALL", "FACT", "INFERENCE", "ASSUMPTION", "AI_HYPOTHESIS"];
const PAGE_SIZE = 15;

export default function EvidenceExplorer() {
  const [rows, setRows] = useState<EvidenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("ALL");
  const [shown, setShown] = useState(PAGE_SIZE);

  const path = useCompanyPath("/evidence");
  useEffect(() => {
    if (path === undefined) return; // companies still loading
    if (path === null) {
      setRows([]); // no company yet: show the empty state
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch(path)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => setRows(data))
      .catch(() => setError("Could not load evidence."))
      .finally(() => setLoading(false));
  }, [path]);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (type === "ALL" || r.type === type) &&
      (q === "" || r.claim.toLowerCase().includes(q) || r.opportunity.title.toLowerCase().includes(q)),
  );
  const visible = filtered.slice(0, shown);

  return (
    <main>
      <PageHeader
        title="Evidence Explorer"
        description="Every claim recorded against your opportunities, with its type and where it came from."
      />
      {/* No quality-scoring concept (credibility/recency/applicability/depth) exists in the backend — shown as unavailable, not scored. */}
      <InlineAlert variant="info">
        Evidence quality scoring (source credibility, recency, applicability, data depth) is not available yet — no backend
        concept exists for it.
      </InlineAlert>
      <div className="toolbar">
        <TextField
          label="Search claims or opportunities"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE_SIZE);
          }}
        />
        <Select
          className="toolbar__select"
          label="Type"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setShown(PAGE_SIZE);
          }}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>
      {loading && <ProgressIndicator label="Loading evidence…" />}
      {!loading && error && <InlineAlert variant="error">{error}</InlineAlert>}
      {!loading && !error && (
        <>
          <DataTable
            columns={[
              { key: "type", header: "Type", render: (r: EvidenceRow) => <EvidenceTag type={r.type} /> },
              { key: "claim", header: "Claim", render: (r: EvidenceRow) => r.claim },
              {
                key: "opp",
                header: "Opportunity",
                render: (r: EvidenceRow) => <Link to={`/app/opportunities/${r.opportunity.id}`}>{r.opportunity.title}</Link>,
              },
              { key: "source", header: "Source", render: (r: EvidenceRow) => <span className="cell-clamp">{r.source || "—"}</span> },
              { key: "captured", header: "Captured", render: (r: EvidenceRow) => new Date(r.capturedAt).toLocaleDateString() },
            ]}
            rows={visible}
            getRowKey={(r) => r.id}
            emptyMessage={rows.length === 0 ? "No evidence recorded yet." : "No evidence matches these filters."}
          />
          {filtered.length > 0 && (
            <p className="list-footer">
              Showing {visible.length} of {filtered.length}
              {visible.length < filtered.length && (
                <>
                  {" "}
                  ·{" "}
                  <button type="button" className="link-button" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                    Show more
                  </button>
                </>
              )}
            </p>
          )}
        </>
      )}
    </main>
  );
}
