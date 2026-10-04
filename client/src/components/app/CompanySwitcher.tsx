import "./app.css";

export interface CompanySwitcherProps {
  companies: string[];
  current: string;
  onChange: (company: string) => void;
}

/**
 * No multi-tenant/company data model exists in the Prisma schema yet (the
 * Opportunity table has no company field) — this operates over a local list
 * passed in by the caller, not a real backend company-scoping endpoint.
 * See SCREENS.md §D, APP-00/APP-DASH.
 */
export function CompanySwitcher({ companies, current, onChange }: CompanySwitcherProps) {
  return (
    <label className="company-switcher">
      <span className="company-switcher__label">Company</span>
      <select value={current} onChange={(e) => onChange(e.target.value)} aria-label="Switch company">
        {companies.map((company) => (
          <option key={company} value={company}>
            {company}
          </option>
        ))}
      </select>
    </label>
  );
}
