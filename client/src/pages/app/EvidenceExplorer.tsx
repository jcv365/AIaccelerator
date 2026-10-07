import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiFetch } from "../../api";
import { useCompanyPath } from "../../company/CompanyContext";
import {
  AiAssessmentNote,
  Button,
  EvidenceTag,
  InlineAlert,
  PageHeader,
  Pagination,
  ProgressIndicator,
  Select,
  StatusBadge,
  TextAreaField,
  TextField,
} from "../../components/ui";
import { LEVEL_LABEL, recencyLevel, type EvidenceRow } from "../../lib/evidence";
import type { Level } from "../../lib/opportunity";
import "./lists.css";
import "./evidence.css";

interface OpportunityOption {
  id: string;
  title: string;
}

const TYPES = ["ALL", "FACT", "INFERENCE", "ASSUMPTION", "AI_HYPOTHESIS"];
const ADD_TYPES = TYPES.slice(1);
const PAGE_SIZE = 8;
const LEVEL_TONE: Record<Level, "success" | "caution" | "default"> = { HIGH: "success", MEDIUM: "caution", LOW: "default" };

export default function EvidenceExplorer() {
  const [rows, setRows] = useState<EvidenceRow[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [addOpp, setAddOpp] = useState("");
  const [addClaim, setAddClaim] = useState("");
  const [addType, setAddType] = useState("FACT");
  const [addSource, setAddSource] = useState("");
  const [addExcerpt, setAddExcerpt] = useState("");

  const path = useCompanyPath("/evidence");
  const oppPath = useCompanyPath("/opportunities");
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
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setError("Could not load evidence."))
      .finally(() => setLoading(false));
  }, [path]);

  // Only needed to choose where new evidence goes: if it cannot load, adding is unavailable, the list still works.
  useEffect(() => {
    if (!oppPath) return;
    apiFetch(oppPath)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data) => setOpportunities(Array.isArray(data) ? data : []))
      .catch(() => setOpportunities([]));
  }, [oppPath]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (type === "ALL" || r.type === type) &&
          (q === "" || r.claim.toLowerCase().includes(q) || r.opportunity.title.toLowerCase().includes(q)),
      ),
    [rows, type, q],
  );
  const lastPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, lastPage);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = rows.find((r) => r.id === selectedId) ?? visible[0] ?? null;

  async function scoreQuality(opportunityId: string) {
    setScoring(true);
    setActionError(null);
    setActionNote(null);
    try {
      const result = await api.post<{ scored: number; evidence: Partial<EvidenceRow>[] }>(
        `/opportunities/${opportunityId}/evidence/quality`,
        {},
      );
      const updated = new Map((result.evidence ?? []).map((e) => [e.id, e]));
      // The scoring response carries the evidence rows only: keep each row's opportunity link.
      setRows((prev) => prev.map((r) => (updated.has(r.id) ? { ...r, ...updated.get(r.id), opportunity: r.opportunity } : r)));
      setActionNote(result.scored === 0 ? "Everything for this opportunity is already scored." : `Scored ${result.scored} source(s).`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Scoring failed.");
    } finally {
      setScoring(false);
    }
  }

  async function addEvidence(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActionNote(null);
    const opp = opportunities.find((o) => o.id === addOpp);
    if (!opp) return;
    try {
      const created = await api.post<Omit<EvidenceRow, "opportunity">>(`/opportunities/${opp.id}/evidence`, {
        claim: addClaim,
        type: addType,
        source: addSource || undefined,
        excerpt: addExcerpt || undefined,
      });
      setRows((prev) => [{ ...created, opportunity: { id: opp.id, title: opp.title } }, ...prev]);
      setSelectedId(created.id);
      setAddClaim("");
      setAddSource("");
      setAddExcerpt("");
      setAdding(false);
      setActionNote("Evidence added.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to add evidence.");
    }
  }

  return (
    <main>
      <PageHeader
        title="Evidence Explorer"
        description="Source-backed evidence to validate opportunities."
      />
      {actionError && <InlineAlert variant="error">{actionError}</InlineAlert>}
      {actionNote && <InlineAlert variant="info">{actionNote}</InlineAlert>}

      {adding && (
        <form className="form-stack evidence__add" onSubmit={addEvidence}>
          <Select label="Opportunity" value={addOpp} onChange={(e) => setAddOpp(e.target.value)} required>
            <option value="">Choose an opportunity…</option>
            {opportunities.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
          <TextField label="Claim" value={addClaim} onChange={(e) => setAddClaim(e.target.value)} required />
          <Select label="Evidence type" value={addType} onChange={(e) => setAddType(e.target.value)}>
            {ADD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <TextField label="Source" value={addSource} onChange={(e) => setAddSource(e.target.value)} />
          <TextAreaField label="Key findings" rows={3} value={addExcerpt} onChange={(e) => setAddExcerpt(e.target.value)} />
          <Button type="submit" variant="primary">
            Save evidence
          </Button>
        </form>
      )}

      <div className="evidence-filters">
        <TextField
          label="Search claims or opportunities"
          placeholder="Search evidence…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
        <Select
          className="toolbar__select"
          label="Type"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "ALL" ? "All types" : t}
            </option>
          ))}
        </Select>
        <Button variant="primary" className="evidence-filters__add" onClick={() => setAdding((v) => !v)} disabled={opportunities.length === 0}>
          {adding ? (
            "Cancel"
          ) : (
            <>
              <span aria-hidden="true">+</span> Add evidence
            </>
          )}
        </Button>
      </div>

      {loading && <ProgressIndicator label="Loading evidence…" />}
      {!loading && error && <InlineAlert variant="error">{error}</InlineAlert>}
      {!loading && !error && rows.length === 0 && <InlineAlert variant="info">No evidence recorded yet.</InlineAlert>}
      {!loading && !error && rows.length > 0 && filtered.length === 0 && (
        <InlineAlert variant="info">No evidence matches these filters.</InlineAlert>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="evidence-layout">
          <div>
            <ul className="evidence-list" aria-label="Evidence sources">
              {visible.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`source-card${selected?.id === r.id ? " source-card--selected" : ""}`}
                    aria-pressed={selected?.id === r.id}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <span className={`source-card__icon source-card__icon--${r.type.toLowerCase()}`} aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 3h7l4 4v14H7z" />
                        <path d="M14 3v4h4M10 12h5M10 16h5" />
                      </svg>
                    </span>
                    <span className="source-card__text">
                      <span className="source-card__claim">{r.claim}</span>
                      <span className="source-card__meta">
                        <EvidenceTag type={r.type} />
                        <span>{r.opportunity.title}</span>
                        <span>{new Date(r.capturedAt).toLocaleDateString()}</span>
                        {r.quality ? <StatusBadge label={`Relevance ${LEVEL_LABEL[r.quality.relevance]}`} tone={LEVEL_TONE[r.quality.relevance]} /> : <span>Not scored</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={currentPage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
          </div>

          {selected && (
            <section className="evidence-detail" aria-label="Evidence detail">
              <h2>{selected.claim}</h2>
              <p className="evidence-detail__meta">
                <EvidenceTag type={selected.type} /> ·{" "}
                <Link to={`/app/opportunities/${selected.opportunity.id}`}>{selected.opportunity.title}</Link>
              </p>
              <section className="evidence-block">
                <h3>Key findings</h3>
                <p className="evidence-detail__text">{selected.excerpt || "No excerpt recorded for this source."}</p>
              </section>
              <section className="evidence-block">
                <h3>Source</h3>
                <p className="evidence-detail__text">
                  {selected.source || "No source recorded."}
                  {selected.location ? ` · ${selected.location}` : ""}
                </p>
              </section>
              {selected.quality && (
                <section className="evidence-block">
                  <div className="evidence-block__head">
                    <h3>Relevance to our opportunity</h3>
                    <StatusBadge label={`${LEVEL_LABEL[selected.quality.relevance]} relevance`} tone={LEVEL_TONE[selected.quality.relevance]} />
                  </div>
                  <p className="evidence-detail__text">{selected.quality.rationale}</p>
                </section>
              )}
              <h3>Evidence quality</h3>
              <table className="evidence-quality">
                <tbody>
                  {(
                    [
                      ["Source credibility", selected.quality?.credibility],
                      ["Applicability", selected.quality?.applicability],
                      ["Data depth", selected.quality?.depth],
                      ["Relevance", selected.quality?.relevance],
                    ] as [string, Level | undefined][]
                  ).map(([label, level]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>{level ? <StatusBadge label={LEVEL_LABEL[level]} tone={LEVEL_TONE[level]} /> : <span className="hypothesis__muted">Not scored</span>}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">Recency</th>
                    <td>
                      <StatusBadge label={LEVEL_LABEL[recencyLevel(selected.capturedAt)]} tone={LEVEL_TONE[recencyLevel(selected.capturedAt)]} />
                    </td>
                  </tr>
                </tbody>
              </table>
              {selected.quality && selected.qualityModel && selected.qualityAt && (
                <AiAssessmentNote model={selected.qualityModel} createdAt={selected.qualityAt} rationale={selected.quality.rationale} />
              )}
              {!selected.quality && (
                <Button onClick={() => void scoreQuality(selected.opportunity.id)} disabled={scoring}>
                  {scoring ? "Scoring…" : "Score evidence quality"}
                </Button>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}
