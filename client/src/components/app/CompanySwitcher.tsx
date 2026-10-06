import { useState } from "react";
import { Button, InlineAlert, TextField } from "../ui";
import "./app.css";
import "./CompanySwitcher.css";

export interface CompanyOption {
  id: string;
  name: string;
}

export interface CompanySwitcherProps {
  companies: CompanyOption[];
  currentId: string | null;
  onSelect: (id: string) => void;
  /** Creates the company (or returns the existing one with created:false) and selects it. */
  onCreate: (name: string, website?: string) => Promise<{ created: boolean; name: string }>;
}

const ADD_VALUE = "__add__";

/** Top-bar company picker with "+ Add company…". See docs/mockups/08-company-switcher.html. */
export function CompanySwitcher({ companies, currentId, onSelect, onCreate }: CompanySwitcherProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingName, setExistingName] = useState<string | null>(null);

  function openForm() {
    setName("");
    setWebsite("");
    setError(null);
    setExistingName(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Company name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await onCreate(trimmed, website.trim() || undefined);
      if (result.created) setOpen(false);
      else setExistingName(result.name); // keep the form open so the note can be read
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the company.");
    } finally {
      setBusy(false);
    }
  }

  const form = open && (
    <div
      className="company-add"
      role="dialog"
      aria-label="Add a company"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <h2>Add a company</h2>
      <form onSubmit={handleSubmit} noValidate className="company-add__form">
        <TextField
          label="Company name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          autoFocus
          autoComplete="off"
        />
        <TextField
          label="Website (optional)"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="e.g. maersk.com"
          maxLength={200}
          autoComplete="off"
        />
        <p className="company-add__hint">The website helps the research find the right company.</p>
        {error && <InlineAlert variant="error">{error}</InlineAlert>}
        {existingName && (
          <InlineAlert variant="info">{`“${existingName}” already exists, so we selected it for you instead of adding a second one.`}</InlineAlert>
        )}
        <div className="company-add__actions">
          {existingName ? (
            <Button type="button" variant="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Adding…" : "Add company"}
              </Button>
            </>
          )}
        </div>
      </form>
    </div>
  );

  if (companies.length === 0) {
    return (
      <div className="company-switcher-wrap">
        <span className="company-switcher__label">Company</span>
        <Button variant="primary" onClick={openForm}>
          + Add your first company
        </Button>
        {form}
      </div>
    );
  }

  return (
    <div className="company-switcher-wrap">
      <label className="company-switcher">
        <span className="company-switcher__label">Company</span>
        <select
          value={currentId ?? ""}
          onChange={(e) => (e.target.value === ADD_VALUE ? openForm() : onSelect(e.target.value))}
          aria-label="Switch company"
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
          <option value={ADD_VALUE}>+ Add company…</option>
        </select>
      </label>
      {form}
    </div>
  );
}
