import { useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { useCompany } from "../../company/CompanyContext";
import { Button, InlineAlert, TextAreaField, TextField } from "../../components/ui";

const NEW_COMPANY = "__new__";

const parseAreas = (text: string) =>
  text
    .split(/[,\n]/)
    .map((a) => a.trim())
    .filter(Boolean);

async function errorOf(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

/** Choose or add the company and give the research the background that helps it find the right business. */
export function CompanyStep({ onNext }: { onNext: () => void }) {
  const { companies, current, select, refresh, createCompany } = useCompany();
  const [choice, setChoice] = useState<string>(current?.id ?? (companies.length === 0 ? NEW_COMPANY : ""));
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [areas, setAreas] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const creating = choice === NEW_COMPANY;
  const chosen = companies.find((c) => c.id === choice) ?? null;

  // Picking an existing company fills the form with what is already known about it.
  useEffect(() => {
    if (creating) return;
    setWebsite(chosen?.website ?? "");
    setIndustry(chosen?.industry ?? "");
    setDescription(chosen?.description ?? "");
    setAreas((chosen?.focusAreas ?? []).join(", "));
    setNotes(chosen?.notes ?? "");
  }, [chosen, creating]);

  // The first company list may arrive after this step has rendered.
  useEffect(() => {
    if (choice === "" && current) setChoice(current.id);
    if (choice === "" && companies.length === 0) setChoice(NEW_COMPANY);
  }, [choice, current, companies.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (creating && !name.trim()) {
      setError("Company name is required.");
      return;
    }
    if (!creating && !chosen) {
      setError("Choose a company, or add a new one.");
      return;
    }
    setBusy(true);
    try {
      let id: string;
      const context: Record<string, unknown> = { industry, description, focusAreas: parseAreas(areas), notes };
      if (creating) {
        const result = await createCompany({ name: name.trim(), website: website.trim() || undefined });
        id = result.company.id;
        // A company that already existed keeps its stored context unless the user typed something new.
        for (const key of Object.keys(context)) {
          const v = context[key];
          if (v === "" || (Array.isArray(v) && v.length === 0)) delete context[key];
        }
      } else {
        id = chosen!.id;
        select(id);
        // Only save what the user actually changed; a changed form sends every field so emptied ones are cleared.
        const stored = [chosen!.industry ?? "", chosen!.description ?? "", (chosen!.focusAreas ?? []).join(", "), chosen!.notes ?? ""];
        const typed = [industry, description, areas, notes];
        const detailsChanged = stored.some((v, i) => v.trim() !== typed[i].trim());
        if (!detailsChanged) for (const key of Object.keys(context)) delete context[key];
        if (website.trim() !== (chosen!.website ?? "")) context.website = website.trim();
      }
      if (Object.keys(context).length > 0) {
        const res = await apiFetch(`/companies/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(context),
        });
        if (!res.ok) {
          setError(await errorOf(res, "Could not save the company details."));
          return;
        }
      }
      await refresh(id);
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the company.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wizard-panel" aria-label="Company">
      <h2>Which company should we analyse?</h2>
      <p>Choose a company or add a new one. The more you tell us, the better the research can focus. All of it is optional except the name.</p>
      {error && <InlineAlert variant="error">{error}</InlineAlert>}
      <form className="wizard-form" onSubmit={submit}>
        {companies.length > 0 && (
          <label className="wizard-field">
            <span className="text-field__label">Company</span>
            <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Company">
              <option value="" disabled>
                Choose a company…
              </option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_COMPANY}>+ Add a new company…</option>
            </select>
          </label>
        )}
        {creating && <TextField label="Company name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" />}
        <TextField
          label="Website (optional)"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="e.g. momentum.co.za"
          maxLength={200}
          autoComplete="off"
        />
        <p className="wizard-hint">A website works best for smaller companies and for names that several businesses share.</p>
        <TextField label="Industry (optional)" value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={100} />
        <TextAreaField label="What the company does (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
        <TextField label="Areas to focus on (optional, separated by commas)" value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="e.g. customer service, claims" />
        <TextAreaField label="Notes for the research (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} />
        <p className="wizard-hint">Public information only. We never sign in to any site, and every finding is linked to its source.</p>
        <div className="wizard-actions">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Continue"}
          </Button>
        </div>
      </form>
    </section>
  );
}
