import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "../api";

export interface Company {
  id: string;
  name: string;
  website: string | null;
  opportunityCount?: number;
}

export interface CreateCompanyInput {
  name: string;
  website?: string;
}

export interface CreateCompanyResult {
  company: Company;
  /** false when a company with that name (any capitalisation) already existed; it is selected instead. */
  created: boolean;
}

interface CompanyContextValue {
  /** False until the company list has loaded, so pages wait instead of flashing "nothing here". */
  ready: boolean;
  /** True inside the provider: lists are filtered to the selected company. Without one nothing is filtered. */
  scoped: boolean;
  companies: Company[];
  currentId: string | null;
  current: Company | null;
  loadError: string | null;
  select: (id: string) => void;
  /** Reloads the list; keeps the selection, or selects `preferId` if given. */
  refresh: (preferId?: string) => Promise<Company[]>;
  createCompany: (input: CreateCompanyInput) => Promise<CreateCompanyResult>;
}

const STORAGE_KEY = "aiaccelerator_company";

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // private mode / blocked storage: just don't remember
  }
}

function writeStored(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // the selection still works for this session
  }
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.error?.message ?? fallback;
}

// Used when there is no provider (an isolated page in a test): behave exactly like the app did before
// companies existed - no filtering.
const UNSCOPED: CompanyContextValue = {
  ready: true,
  scoped: false,
  companies: [],
  currentId: null,
  current: null,
  loadError: null,
  select: () => {},
  refresh: async () => [],
  createCompany: async () => {
    throw new Error("Company support is not available here.");
  },
};

const CompanyContext = createContext<CompanyContextValue>(UNSCOPED);

export const useCompany = () => useContext(CompanyContext);

/**
 * The path to request for a list screen, scoped to the selected company:
 *   undefined = companies still loading (wait),  null = scoped but no company yet (show the empty state),
 *   string = fetch this. Without a provider the base path is returned unchanged.
 */
export function useCompanyPath(base: string): string | null | undefined {
  const { ready, scoped, currentId } = useCompany();
  if (!ready) return undefined;
  if (!scoped) return base;
  if (!currentId) return null;
  return `${base}?companyId=${encodeURIComponent(currentId)}`;
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(readStored);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async (preferId?: string): Promise<Company[]> => {
    const res = await apiFetch("/companies");
    if (!res.ok) throw new Error(await readError(res, "Could not load companies."));
    const list = (await res.json()) as Company[];
    setCompanies(list);
    setCurrentId((previous) => {
      const wanted = preferId ?? previous;
      return wanted && list.some((c) => c.id === wanted) ? wanted : (list[0]?.id ?? null);
    });
    return list;
  }, []);

  useEffect(() => {
    refresh()
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Could not load companies."))
      .finally(() => setReady(true));
  }, [refresh]);

  useEffect(() => {
    if (currentId) writeStored(currentId);
  }, [currentId]);

  const createCompany = useCallback(
    async (input: CreateCompanyInput): Promise<CreateCompanyResult> => {
      const res = await apiFetch("/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not add the company."));
      const body = (await res.json()) as CreateCompanyResult;
      await refresh(body.company.id); // reload, then select it
      return body;
    },
    [refresh]
  );

  const value = useMemo<CompanyContextValue>(
    () => ({
      ready,
      scoped: true,
      companies,
      currentId,
      current: companies.find((c) => c.id === currentId) ?? null,
      loadError,
      select: setCurrentId,
      refresh,
      createCompany,
    }),
    [ready, companies, currentId, loadError, refresh, createCompany]
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}
