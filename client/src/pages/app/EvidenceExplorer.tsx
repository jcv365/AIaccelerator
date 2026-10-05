import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { DataTable, InlineAlert, ProgressIndicator, TextField } from "../../components/ui";
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

export default function EvidenceExplorer() {
  const [rows, setRows] = useState<EvidenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("ALL");

  useEffect(() => {
    apiFetch("/evidence")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => setRows(data))
      .catch(() => setError("Could not load evidence."))
      .finally(() => setLoading(false));
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (type === "ALL" || r.type === type) &&
      (q === "" || r.claim.toLowerCase().includes(q) || r.opportunity.title.toLowerCase().includes(q)),
  );

  return (
    <main>
      <h1>Evidence Explorer</h1>
      {/* No quality-scoring concept (credibility/recency/applicability/depth) exists in the backend — shown as unavailable, not scored. */}
      <InlineAlert variant="info">
        Evidence quality scoring (source credibility, recency, applicability, data depth) is not available yet — no backend
        concept exists for it.
      </InlineAlert>
      <div className="list-toolbar">
        <TextField label="Search claims or opportunities" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="text-field">
          <label className="text-field__label" htmlFor="evidence-type">
            Type
          </label>
          <select id="evidence-type" className="text-field__input" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      {loading && <ProgressIndicator label="Loading evidence…" />}
      {!loading && error && <InlineAlert variant="error">{error}</InlineAlert>}
      {!loading && !error && (
        <DataTable
          columns={[
            { key: "type", header: "Type", render: (r: EvidenceRow) => <span className="evidence-tag">[{r.type}]</span> },
            { key: "claim", header: "Claim", render: (r: EvidenceRow) => r.claim },
            {
              key: "opp",
              header: "Opportunity",
              render: (r: EvidenceRow) => <Link to={`/app/opportunities/${r.opportunity.id}`}>{r.opportunity.title}</Link>,
            },
            { key: "source", header: "Source", render: (r: EvidenceRow) => r.source || "—" },
            { key: "captured", header: "Captured", render: (r: EvidenceRow) => new Date(r.capturedAt).toLocaleDateString() },
          ]}
          rows={filtered}
          getRowKey={(r) => r.id}
          emptyMessage={rows.length === 0 ? "No evidence recorded yet." : "No evidence matches these filters."}
        />
      )}
    </main>
  );
}
