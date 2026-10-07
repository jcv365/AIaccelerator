import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import Wizard from "./Wizard";
import { CompanyProvider } from "../../company/CompanyContext";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type Handler = (init?: RequestInit) => { ok: boolean; status?: number; body?: unknown; blob?: Blob };

function routeFetch(handlers: Record<string, Handler>) {
  const fn = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.replace(/^\/api/, "")}`;
    const h = handlers[key];
    if (!h) return Promise.reject(new Error(`unexpected ${key}`));
    const r = h(init);
    return Promise.resolve({ ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.body, blob: async () => r.blob ?? new Blob(["x"]) });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const momentum = { id: "c1", name: "Momentum", website: "https://www.momentum.co.za", description: null, industry: null, focusAreas: [], notes: null, opportunityCount: 0 };
const noRuns = { "GET /companies/c1/analyses": () => ({ ok: true, body: { analyses: [] } }) };

function job(over: Record<string, unknown> = {}) {
  return {
    id: "j1", status: "RUNNING", stage: "critiques", queuePosition: null, elapsedSeconds: 125, opportunitiesFound: 0, error: null,
    progress: { expected: ["Fusion", "Claude"], responded: ["Claude"], missing: ["Fusion"], elapsedSeconds: 125 },
    ...over,
  };
}

function mount(handlers: Record<string, Handler>) {
  const fetchMock = routeFetch({ "GET /companies": () => ({ ok: true, body: [momentum] }), "GET /companies/c1/analysis-jobs": () => ({ ok: true, body: [] }), ...handlers });
  render(
    <MemoryRouter>
      <CompanyProvider>
        <Wizard pollIntervalMs={20} />
      </CompanyProvider>
    </MemoryRouter>
  );
  return fetchMock;
}

const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, method: string, urlPart: string) => {
  const call = fetchMock.mock.calls.find(([url, init]) => String(url).includes(urlPart) && init?.method === method);
  return call ? JSON.parse(call[1].body as string) : undefined;
};

describe("Wizard: company step", () => {
  it("shows the four steps and starts on the company", async () => {
    mount({ ...noRuns });
    expect(await screen.findByRole("heading", { name: /which company should we analyse/i })).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Steps" });
    expect(steps).toHaveTextContent(/Company/);
    expect(steps).toHaveTextContent(/Analysis/);
    expect(steps).toHaveTextContent(/Opportunities/);
    expect(steps).toHaveTextContent(/Report/);
    expect(screen.getByRole("button", { name: /^Opportunities/ })).toBeDisabled(); // no analysis yet
  });

  it("continues with an existing company without saving anything when nothing changed", async () => {
    const fetchMock = mount({ ...noRuns });
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: /analyse momentum/i })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("saves the background details of an existing company, clearing the ones you emptied", async () => {
    const fetchMock = mount({ ...noRuns, "PATCH /companies/c1": () => ({ ok: true, body: {} }) });
    fireEvent.change(await screen.findByLabelText(/Industry/), { target: { value: "Financial services" } });
    fireEvent.change(screen.getByLabelText(/Areas to focus on/), { target: { value: "claims, customer service" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: /analyse momentum/i });
    expect(bodyOf(fetchMock, "PATCH", "/companies/c1")).toEqual({ industry: "Financial services", description: "", focusAreas: ["claims", "customer service"], notes: "" });
  });

  it("adds a new company with its details", async () => {
    const cassava = { id: "c2", name: "Cassava", website: "https://cassava.com", description: null, industry: null, focusAreas: [], notes: null, opportunityCount: 0 };
    let added = false;
    const fetchMock = mount({
      ...noRuns,
      "GET /companies": () => ({ ok: true, body: added ? [momentum, cassava] : [momentum] }),
      "POST /companies": () => {
        added = true;
        return { ok: true, status: 201, body: { created: true, company: cassava } };
      },
      "PATCH /companies/c2": () => ({ ok: true, body: {} }),
      "GET /companies/c2/analyses": () => ({ ok: true, body: { analyses: [] } }),
      "GET /companies/c2/analysis-jobs": () => ({ ok: true, body: [] }),
    });
    fireEvent.change(await screen.findByRole("combobox", { name: "Company" }), { target: { value: "__new__" } });
    fireEvent.change(screen.getByLabelText("Company name"), { target: { value: "Cassava" } });
    fireEvent.change(screen.getByLabelText(/Website/), { target: { value: "cassava.com" } });
    fireEvent.change(screen.getByLabelText(/Industry/), { target: { value: "Telecoms" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: /analyse cassava/i });
    expect(bodyOf(fetchMock, "POST", "/companies")).toEqual({ name: "Cassava", website: "cassava.com" });
    expect(bodyOf(fetchMock, "PATCH", "/companies/c2")).toEqual({ industry: "Telecoms" }); // only what was typed
  });

  it("requires a name for a new company", async () => {
    mount({ ...noRuns });
    fireEvent.change(await screen.findByRole("combobox", { name: "Company" }), { target: { value: "__new__" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/name is required/i);
  });
});

describe("Wizard: analysis step", () => {
  async function toAnalysis() {
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await screen.findByRole("heading", { name: /analyse momentum/i });
  }

  it("starts an analysis and shows its stages, the experts and the elapsed time", async () => {
    const fetchMock = mount({
      ...noRuns,
      "POST /opportunities/analyze": () => ({ ok: true, status: 202, body: { jobId: "j1", status: "QUEUED", companyId: "c1", queuePosition: 1 } }),
      "GET /opportunities/analyze/j1": () => ({ ok: true, body: job() }),
    });
    await toAnalysis();
    fireEvent.click(screen.getByRole("button", { name: "Start analysis" }));
    expect(await screen.findByText(/2:05 elapsed/)).toBeInTheDocument();
    const stages = screen.getByRole("list", { name: "Analysis progress" });
    expect(stages.querySelector("[aria-current='step']")).toHaveTextContent(/critique each other/i);
    expect(stages.querySelectorAll(".is-done")).toHaveLength(1); // proposals are done
    expect(screen.getByText(/Experts that have answered this stage: Claude · still working: Fusion/)).toBeInTheDocument();
    expect(screen.getByText(/keeps running/i)).toBeInTheDocument();
    expect(bodyOf(fetchMock, "POST", "/opportunities/analyze")).toEqual({ companyId: "c1" });
  });

  it("says when the analysis is waiting for the Council, and where it is in the queue", async () => {
    mount({
      ...noRuns,
      "POST /opportunities/analyze": () => ({ ok: true, status: 202, body: { jobId: "j2" } }),
      "GET /opportunities/analyze/j2": () => ({ ok: true, body: job({ id: "j2", status: "QUEUED", stage: "queued", queuePosition: 3, progress: null, elapsedSeconds: null }) }),
    });
    await toAnalysis();
    fireEvent.click(screen.getByRole("button", { name: "Start analysis" }));
    expect(await screen.findByText("Waiting for the Council")).toBeInTheDocument();
    expect(screen.getByText(/2 analyses ahead of this one/)).toBeInTheDocument();
  });

  it("follows the running analysis when this company is already being analysed (409)", async () => {
    mount({
      ...noRuns,
      "POST /opportunities/analyze": () => ({ ok: false, status: 409, body: { error: { code: "ANALYSIS_IN_PROGRESS", message: "This company is already being analysed.", jobId: "j9" } } }),
      "GET /opportunities/analyze/j9": () => ({ ok: true, body: job({ id: "j9" }) }),
    });
    await toAnalysis();
    fireEvent.click(screen.getByRole("button", { name: "Start analysis" }));
    expect(await screen.findByText(/elapsed/)).toBeInTheDocument();
  });

  it("shows why an analysis failed and offers to try again", async () => {
    mount({
      ...noRuns,
      "POST /opportunities/analyze": () => ({ ok: true, status: 202, body: { jobId: "j3" } }),
      "GET /opportunities/analyze/j3": () => ({ ok: true, body: job({ id: "j3", status: "FAILED", error: { code: "COUNCIL_SESSION_LOST", message: "The Conclave was restarted." } }) }),
    });
    await toAnalysis();
    fireEvent.click(screen.getByRole("button", { name: "Start analysis" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/did not finish: The Conclave was restarted/);
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("jumps straight to the running analysis when you come back to the wizard", async () => {
    mount({
      ...noRuns,
      "GET /companies/c1/analysis-jobs": () => ({ ok: true, body: [{ id: "j1", status: "RUNNING", stage: "voting", opportunitiesFound: 0, completedAt: null }] }),
      "GET /opportunities/analyze/j1": () => ({ ok: true, body: job({ stage: "voting" }) }),
    });
    expect(await screen.findByRole("heading", { name: /analyse momentum/i })).toBeInTheDocument();
    expect(await screen.findByText(/elapsed/)).toBeInTheDocument();
  });

  it("offers the latest finished analysis, so a rerun is a choice", async () => {
    mount({
      "GET /companies/c1/analyses": () => ({ ok: true, body: { analyses: [{ id: "j0", status: "SUCCEEDED", createdAt: "2026-10-06T10:00:00Z", opportunities: 8 }] } }),
      "GET /companies/c1/analysis-jobs": () => ({ ok: true, body: [{ id: "j0", status: "SUCCEEDED", stage: null, opportunitiesFound: 8, completedAt: "2026-10-06T10:30:00Z" }] }),
      "GET /opportunities?companyId=c1&analysisId=j0": () => ({ ok: true, body: [{ id: "o1", title: "Claims intake", description: "Automate it", _count: { evidence: 3 } }] }),
    });
    await toAnalysis();
    expect(screen.getByText(/finished on .* with 8 opportunities/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run a new analysis" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use the latest analysis" }));
    expect(await screen.findByRole("heading", { name: /ai opportunities for momentum/i })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Claims intake" })).toHaveAttribute("href", "/app/opportunities/o1");
  });
});

describe("Wizard: from a finished analysis to the report", () => {
  it("lists that run's opportunities, then writes the report for it and offers the downloads", async () => {
    let analysed = false;
    let reportState: "none" | "writing" | "done" = "none";
    const files = [
      { audience: "C_LEVEL", format: "PPTX", filename: "a.pptx", sizeBytes: 100 },
      { audience: "C_LEVEL", format: "DOCX", filename: "b.docx", sizeBytes: 100 },
      { audience: "TECHNICAL", format: "PPTX", filename: "c.pptx", sizeBytes: 100 },
      { audience: "TECHNICAL", format: "DOCX", filename: "d.docx", sizeBytes: 100 },
    ];
    const fetchMock = mount({
      "GET /companies/c1/analyses": () => ({
        ok: true,
        body: { analyses: analysed ? [{ id: "j1", status: "SUCCEEDED", createdAt: "2026-10-07T11:00:00Z", opportunities: 2 }] : [] },
      }),
      "POST /opportunities/analyze": () => {
        analysed = true;
        return { ok: true, status: 202, body: { jobId: "j1" } };
      },
      "GET /opportunities/analyze/j1": () => ({ ok: true, body: job({ status: "SUCCEEDED", stage: "done", opportunitiesFound: 2 }) }),
      "GET /opportunities?companyId=c1&analysisId=j1": () => ({
        ok: true,
        body: [
          { id: "o1", title: "Claims intake", description: null, _count: { evidence: 3 } },
          { id: "o2", title: "Churn prediction", description: null, _count: { evidence: 1 } },
        ],
      }),
      "GET /reports?companyId=c1": () => ({
        ok: true,
        body: {
          reports: reportState === "none" ? [] : [{ id: "r1", version: 1, status: reportState === "writing" ? "GENERATING" : "DRAFT", stage: "Writing the roadmap", error: null, analysis: { id: "j1", ranAt: "2026-10-07T11:00:00Z" }, files: reportState === "done" ? files : [] }],
        },
      }),
      "POST /reports": () => {
        reportState = "writing";
        setTimeout(() => (reportState = "done"), 60);
        return { ok: true, status: 202, body: { reportId: "r1", version: 1, status: "GENERATING" } };
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start analysis" }));

    // The finished run becomes the selected one and the wizard moves on to its opportunities.
    expect(await screen.findByRole("link", { name: "Claims intake" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Churn prediction" })).toBeInTheDocument();
    expect(screen.getByText(/Showing the analysis of/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue to the report" }));
    fireEvent.click(await screen.findByRole("button", { name: "Write the report" }));
    expect(bodyOf(fetchMock, "POST", "/reports")).toEqual({ companyId: "c1", analysisId: "j1" });
    expect(await screen.findByText(/Writing the roadmap/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Download Technical proposal" })).toBeEnabled(), { timeout: 3000 });
    expect(screen.getByText(/Draft: AI-generated, verify before sharing/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /approve the report/i })).toHaveAttribute("href", "/app/reports");
  });
});
