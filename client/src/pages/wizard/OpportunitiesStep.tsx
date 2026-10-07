import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api";
import { useCompany, useCompanyPath } from "../../company/CompanyContext";
import { Button, InlineAlert, ProgressIndicator } from "../../components/ui";

interface OpportunityRow {
  id: string;
  title: string;
  description: string | null;
  _count?: { evidence: number };
}

/** What the chosen analysis run found. The list is scoped by the company context to that run. */
export function OpportunitiesStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { current, run } = useCompany();
  const path = useCompanyPath("/opportunities");
  const [rows, setRows] = useState<OpportunityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    setRows(null);
    setError(null);
    apiFetch(path)
      .then((res) => (res.ok ? (res.json() as Promise<OpportunityRow[]>) : Promise.reject(new Error("failed"))))
      .then(setRows)
      .catch(() => setError("Could not load the opportunities."));
  }, [path]);

  const scope = run ? `the analysis of ${new Date(run.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : "all analyses together";

  return (
    <section className="wizard-panel" aria-label="Opportunities">
      <h2>{current ? `AI opportunities for ${current.name}` : "AI opportunities"}</h2>
      <p className="wizard-hint">Showing {scope}. Each opportunity is backed by evidence you can inspect.</p>
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      {!rows && !error && <ProgressIndicator label="Loading opportunities…" />}
      {rows && rows.length === 0 && <InlineAlert variant="info">This analysis did not find any opportunities.</InlineAlert>}
      <ul className="wizard-list">
        {(rows ?? []).map((o) => (
          <li key={o.id}>
            <div>
              <Link to={`/app/opportunities/${o.id}`}>{o.title}</Link>
              {o.description && <p className="wizard-hint">{o.description.length > 160 ? `${o.description.slice(0, 157)}…` : o.description}</p>}
            </div>
            <span className="wizard-hint">{o._count?.evidence ?? 0} evidence items</span>
          </li>
        ))}
      </ul>
      <div className="wizard-actions">
        <Button onClick={onBack}>Back</Button>
        <Button variant="primary" onClick={onNext} disabled={!rows || rows.length === 0}>
          Continue to the report
        </Button>
      </div>
    </section>
  );
}
