import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "../api";

export interface Company {
  id: string;
  name: string;
  website: string | null;
  opportunityCount?: number;
}

/** A finished analysis run of the selected company: a dated snapshot of the opportunities it found. */
export interface AnalysisRunInfo {
  id: string;
  createdAt: string;
  opportunities: number;
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
  /** False until the selected company's runs have loaded (and a run chosen). */
  runsReady: boolean;
  /** True inside the provider: lists are filtered to the selected company. Without one nothing is filtered. */
  scoped: boolean;
  companies: Company[];
  currentId: string | null;
  current: Company | null;
  loadError: string | null;
  /** Finished runs of the selected company that found something, newest first. */
  runs: AnalysisRunInfo[];
  /** The selected run (screens show only what it found), or null for every run together. */
  runId: string | null;
  run: AnalysisRunInfo | null;
  selectRun: (id: string | null) => void;
  /** Reloads the runs; selects `preferId` (a new run) if given. */
  refreshRuns: (preferId?: string) => Promise<void>;
  select: (id: string) => void;
  /** Reloads the list; keeps the selection, or selects `preferId` if given. */
  refresh: (preferId?: string) => Promise<Company[]>;
  createCompany: (input: CreateCompanyInput) => Promise<CreateCompanyResult>;
}

const STORAGE_KEY = "aiaccelerator_company";
const runKey = (companyId: string) => `aiaccelerator_run_${companyId}`;
const ALL_RUNS = "all";

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
  runsReady: true,
  scoped: false,
  companies: [],
  currentId: null,
  current: null,
  loadError: null,
  runs: [],
  runId: null,
  run: null,
  selectRun: () => {},
  refreshRuns: async () => {},
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
  const { ready, scoped, currentId, runsReady, runId } = useScopeState();
  if (!ready) return undefined;
  if (!scoped) return base;
  if (!currentId) return null;
  if (!runsReady) return undefined; // the run is still being chosen: don't fetch twice
  return `${base}?companyId=${encodeURIComponent(currentId)}${runId ? `&analysisId=${encodeURIComponent(runId)}` : ""}`;
}

function useScopeState() {
  const c = useCompany();
  return { ready: c.ready, scoped: c.scoped, currentId: c.currentId, runsReady: c.runsReady, runId: c.runId };
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(readStored);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runs, setRuns] = useState<AnalysisRunInfo[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [runsFor, setRunsFor] = useState<string | null>(null); // which company `runs` belongs to

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

  // The selected company's finished runs, and which one is shown: what the user chose last time, else the newest.
  const loadRuns = useCallback(async (companyId: string, preferId?: string) => {
    let list: AnalysisRunInfo[] = [];
    try {
      const res = await apiFetch(`/companies/${encodeURIComponent(companyId)}/analyses`);
      if (res.ok) {
        const body = (await res.json()) as { analyses?: Array<AnalysisRunInfo & { status?: string }> };
        list = (body.analyses ?? []).filter((a) => a.status === "SUCCEEDED" && a.opportunities > 0).map(({ id, createdAt, opportunities }) => ({ id, createdAt, opportunities }));
      }
    } catch {
      // no history available: show every opportunity
    }
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(runKey(companyId));
    } catch {
      stored = null;
    }
    const chosen =
      preferId && list.some((r) => r.id === preferId)
        ? preferId
        : stored === ALL_RUNS
          ? null
          : stored && list.some((r) => r.id === stored)
            ? stored
            : (list[0]?.id ?? null);
    setRuns(list);
    setRunId(chosen);
    setRunsFor(companyId);
  }, []);

  useEffect(() => {
    if (currentId) void loadRuns(currentId);
  }, [currentId, loadRuns]);

  const selectRun = useCallback(
    (id: string | null) => {
      setRunId(id);
      if (!currentId) return;
      try {
        localStorage.setItem(runKey(currentId), id ?? ALL_RUNS);
      } catch {
        // the choice still applies for this session
      }
    },
    [currentId]
  );

  const refreshRuns = useCallback(
    async (preferId?: string) => {
      if (!currentId) return;
      await loadRuns(currentId, preferId);
      if (preferId) {
        try {
          localStorage.setItem(runKey(currentId), preferId);
        } catch {
          // ignore
        }
      }
    },
    [currentId, loadRuns]
  );

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
      runsReady: !currentId || runsFor === currentId,
      scoped: true,
      companies,
      currentId,
      current: companies.find((c) => c.id === currentId) ?? null,
      loadError,
      runs,
      runId,
      run: runs.find((r) => r.id === runId) ?? null,
      selectRun,
      refreshRuns,
      select: setCurrentId,
      refresh,
      createCompany,
    }),
    [ready, companies, currentId, loadError, refresh, createCompany, runs, runId, runsFor, selectRun, refreshRuns]
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}
