import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import Companies from "./Companies";
import { CompanyProvider } from "../../company/CompanyContext";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type Handler = (init?: RequestInit) => { ok: boolean; status?: number; body?: unknown };

function routeFetch(handlers: Record<string, Handler>) {
  const fn = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.replace(/^\/api/, "")}`;
    const h = handlers[key];
    if (!h) return Promise.reject(new Error(`unexpected ${key}`));
    const r = h(init);
    return Promise.resolve({ ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.body });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

let companies: Array<Record<string, unknown>>;
let runs: Array<Record<string, unknown>>;
const run = (id: string, createdAt: string, over: Record<string, unknown> = {}) => ({ id, status: "SUCCEEDED", createdAt, completedAt: createdAt, opportunities: 8, error: null, ...over });
const momentum = () => ({ id: "c1", name: "Momentum", website: "https://www.momentum.co.za", opportunityCount: 2 });
const maersk = () => ({ id: "c2", name: "Maersk", website: null, opportunityCount: 1 });
const opps = [
  { id: "o1", title: "Momentum.io: Wrong thing" },
  { id: "o2", title: "Claims intake" },
];

function mount(extra: Record<string, Handler> = {}) {
  companies = [momentum(), maersk()];
  runs = [run("j2", "2026-10-07T11:00:00Z"), run("j1", "2026-10-06T08:00:00Z", { status: "FAILED", opportunities: 0, error: { code: "AI_UNREACHABLE", message: "Could not reach the conclave" } })];
  const fetchMock = routeFetch({
    "GET /companies": () => ({ ok: true, body: companies }),
    // The newest finished run (j2) is shown by default; "all runs" shows every opportunity.
    "GET /opportunities?companyId=c1&analysisId=j2": () => ({ ok: true, body: [opps[1]] }),
    "GET /opportunities?companyId=c1": () => ({ ok: true, body: opps }),
    "GET /opportunities?companyId=c2": () => ({ ok: true, body: [] }),
    "GET /companies/c1/analyses": () => ({ ok: true, body: { analyses: runs } }),
    "GET /companies/c2/analyses": () => ({ ok: true, body: { analyses: [] } }),
    "GET /companies/c3/analyses": () => ({ ok: true, body: { analyses: [] } }),
    ...extra,
  });
  render(
    <CompanyProvider>
      <Companies pollIntervalMs={20} />
    </CompanyProvider>
  );
  return fetchMock;
}

describe("Companies page", () => {
  it("lists companies with their website and opportunity count", async () => {
    mount();
    expect(await screen.findByText(/https:\/\/www\.momentum\.co\.za · 2 opportunities/)).toBeInTheDocument();
    expect(screen.getByText(/No website · 1 opportunity/)).toBeInTheDocument();
  });

  it("adds a company", async () => {
    const fetchMock = mount({
      "POST /companies": () => {
        companies.push({ id: "c3", name: "Cassava", website: "https://cassava.co.za", opportunityCount: 0 });
        return { ok: true, status: 201, body: { created: true, company: { id: "c3", name: "Cassava", website: "https://cassava.co.za" } } };
      },
      "GET /opportunities?companyId=c3": () => ({ ok: true, body: [] }),
    });
    fireEvent.change(await screen.findByLabelText("Company name"), { target: { value: "Cassava" } });
    fireEvent.change(screen.getByLabelText(/Website \(optional\)/), { target: { value: "cassava.co.za" } });
    fireEvent.click(screen.getByRole("button", { name: "Add company" }));
    expect(await screen.findByText(/Cassava was added/)).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(post![1].body as string)).toEqual({ name: "Cassava", website: "cassava.co.za" });
  });

  it("requires a name to add a company", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Add company" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/name is required/i);
  });

  it("edits the name and web address", async () => {
    const fetchMock = mount({
      "PATCH /companies/c1": () => {
        companies[0] = { ...momentum(), name: "Momentum Group", website: "https://momentum.co.za" };
        return { ok: true, body: {} };
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Momentum" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Momentum Group" } });
    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "https://momentum.co.za" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(await screen.findByText(/https:\/\/momentum\.co\.za · 2 opportunities/)).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(patch![1].body as string)).toEqual({ name: "Momentum Group", website: "https://momentum.co.za" });
  });

  it("shows the server's reason when a rename is refused", async () => {
    mount({ "PATCH /companies/c1": () => ({ ok: false, status: 409, body: { error: { message: "Another company already has that name" } } }) });
    fireEvent.click(await screen.findByRole("button", { name: "Edit Momentum" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already has that name/);
  });

  it("deletes a company only after its name is typed", async () => {
    const fetchMock = mount({
      "DELETE /companies/c2?confirmName=Maersk": () => {
        companies = companies.filter((c) => c.id !== "c2");
        return { ok: true, body: { deleted: true, opportunities: 1 } };
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Delete Maersk" }));
    const go = screen.getByRole("button", { name: /Delete Maersk for good/ });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Company name to confirm"), { target: { value: "maersk" } });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Company name to confirm"), { target: { value: "Maersk" } });
    expect(go).toBeEnabled();
    fireEvent.click(go);
    expect(await screen.findByText(/Maersk was deleted with its 1 opportunities/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/companies/c2") && init?.method === "DELETE")).toBe(true);
    expect(screen.queryByRole("button", { name: "Delete Maersk" })).not.toBeInTheDocument();
  });

  it("removes a wrong opportunity after a second click", async () => {
    const fetchMock = mount({ "DELETE /opportunities/o1": () => ({ ok: true, status: 204, body: null }) });
    fireEvent.click(await screen.findByRole("button", { name: "Show all runs" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove Momentum.io: Wrong thing" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove Momentum.io: Wrong thing" }));
    await waitFor(() => expect(screen.queryByText("Momentum.io: Wrong thing")).not.toBeInTheDocument());
    expect(screen.getByText("Claims intake")).toBeInTheDocument();
    expect(screen.getByText(/Removed “Momentum.io: Wrong thing”/)).toBeInTheDocument();
  });

  it("shows every analysis run with its date and outcome", async () => {
    mount();
    expect(await screen.findByText("8 opportunities found")).toBeInTheDocument();
    expect(screen.getByText(/Failed: Could not reach the conclave/)).toBeInTheDocument();
    expect(screen.getAllByText(/2026/, { selector: "strong" })).toHaveLength(2);
  });

  it("shows only the newest run's opportunities by default, and every run's when asked", async () => {
    const fetchMock = mount();
    expect(await screen.findByText("Claims intake")).toBeInTheDocument();
    expect(screen.queryByText("Momentum.io: Wrong thing")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("analysisId=j2"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Show all runs" }));
    expect(await screen.findByText("Momentum.io: Wrong thing")).toBeInTheDocument();
  });

  it("reruns the analysis for the selected company and watches it until it finishes", async () => {
    let started = false;
    let polls = 0;
    const fetchMock = mount({
      "POST /opportunities/analyze": () => {
        started = true;
        return { ok: true, status: 202, body: { jobId: "j3", status: "QUEUED", companyId: "c1" } };
      },
      "GET /companies/c1/analyses": () => {
        if (!started) return { ok: true, body: { analyses: runs } };
        polls += 1;
        const status = polls < 3 ? "RUNNING" : "SUCCEEDED";
        return { ok: true, body: { analyses: [run("j3", "2026-10-07T13:00:00Z", { status, opportunities: status === "SUCCEEDED" ? 9 : 0 }), ...runs] } };
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Rerun analysis" }));
    expect(await screen.findByText(/Analysis started/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Analysis running…" })).toBeDisabled();
    expect(await screen.findByText("9 opportunities found", {}, { timeout: 3000 })).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([url, init]) => url === "/api/opportunities/analyze" && init?.method === "POST");
    expect(JSON.parse(post![1].body as string)).toEqual({ companyId: "c1" });
    expect(await screen.findByRole("button", { name: "Rerun analysis" })).toBeEnabled();
  });

  it("shows the reason when a rerun cannot start", async () => {
    mount({ "POST /opportunities/analyze": () => ({ ok: false, status: 409, body: { error: { message: "Another analysis is already running. Try again when it finishes." } } }) });
    fireEvent.click(await screen.findByRole("button", { name: "Rerun analysis" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already running/);
  });
});
