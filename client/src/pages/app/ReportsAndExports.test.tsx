import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import ReportsAndExports from "./ReportsAndExports";
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

const maersk = { id: "c1", name: "Maersk", website: null, opportunityCount: 3 };
const files = [
  { audience: "C_LEVEL", format: "PPTX", filename: "maersk-v2-c-level-deck.pptx", sizeBytes: 400_000 },
  { audience: "C_LEVEL", format: "DOCX", filename: "maersk-v2-c-level-proposal.docx", sizeBytes: 90_000 },
  { audience: "TECHNICAL", format: "PPTX", filename: "maersk-v2-technical-deck.pptx", sizeBytes: 420_000 },
  { audience: "TECHNICAL", format: "DOCX", filename: "maersk-v2-technical-proposal.docx", sizeBytes: 95_000 },
];
const passed = { passed: true, checks: [{ id: "schema", name: "Report has every required section in the right shape", passed: true, details: [] }] };
const report = (over: Record<string, unknown> = {}) => ({
  id: "r2",
  version: 2,
  status: "DRAFT",
  stage: null,
  error: null,
  createdAt: "2026-10-06T10:00:00Z",
  completedAt: "2026-10-06T10:20:00Z",
  approvedAt: null,
  approvedBy: null,
  summary: { headline: "Three AI opportunities", opportunities: 3, sources: 11 },
  quality: passed,
  files,
  ...over,
});

function mount(handlers: Record<string, Handler>, props: { pollIntervalMs?: number } = {}) {
  const fetchMock = routeFetch({ "GET /companies": () => ({ ok: true, body: [maersk] }), ...handlers });
  render(
    <MemoryRouter>
      <CompanyProvider>
        <ReportsAndExports initialTab="company" {...props} />
      </CompanyProvider>
    </MemoryRouter>
  );
  return fetchMock;
}

describe("ReportsAndExports (company level)", () => {
  it("asks for a company when none is selected", async () => {
    routeFetch({ "GET /companies": () => ({ ok: true, body: [] }) });
    render(
      <MemoryRouter>
        <CompanyProvider>
          <ReportsAndExports initialTab="company" />
        </CompanyProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText(/add or select a company/i)).toBeInTheDocument();
  });

  it("shows an empty state with a way forward when the company has no opportunities", async () => {
    routeFetch({
      "GET /companies": () => ({ ok: true, body: [{ ...maersk, opportunityCount: 0 }] }),
      "GET /reports?companyId=c1": () => ({ ok: true, body: { reports: [] } }),
    });
    render(
      <MemoryRouter>
        <CompanyProvider>
          <ReportsAndExports initialTab="company" />
        </CompanyProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText(/no opportunities for maersk yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start an analysis/i })).toHaveAttribute("href", "/app/analyze");
  });

  it("starts the first report for the selected company", async () => {
    let started = false;
    const fetchMock = mount({
      "GET /reports?companyId=c1": () => ({ ok: true, body: { reports: started ? [report({ status: "GENERATING", stage: "Writing opportunity 1 of 3: Predictive maintenance", files: [], summary: null, quality: null })] : [] } }),
      "POST /reports": () => {
        started = true;
        return { ok: true, status: 202, body: { reportId: "r2", version: 1, status: "GENERATING" } };
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: /write the first report/i }));
    expect(await screen.findByText(/writing opportunity 1 of 3/i)).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(post![1].body as string)).toEqual({ companyId: "c1" });
    expect(screen.getByRole("button", { name: /write a new version/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
  });

  it("polls while a report is being written and then offers the four files", async () => {
    let calls = 0;
    mount(
      {
        "GET /reports?companyId=c1": () => {
          calls += 1;
          return { ok: true, body: { reports: [calls < 3 ? report({ status: "GENERATING", stage: "Writing the roadmap", files: [], summary: null, quality: null }) : report()] } };
        },
      },
      { pollIntervalMs: 20 }
    );
    expect(await screen.findByText(/writing the roadmap/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^download/i })).toHaveLength(4), { timeout: 3000 });
    expect(screen.getAllByText(/draft: ai-generated, verify before sharing/i, { selector: ".status-badge" }).length).toBeGreaterThan(0);
    expect(screen.getByText("391 KB")).toBeInTheDocument();
    expect(screen.getByText(/3 opportunities · 11 public sources/)).toBeInTheDocument();
  });

  it("approves a draft and then shows it as locked", async () => {
    let approved = false;
    const fetchMock = mount({
      "GET /reports?companyId=c1": () => ({ ok: true, body: { reports: [approved ? report({ status: "APPROVED", approvedBy: "admin", approvedAt: "2026-10-07T09:00:00Z" }) : report()] } }),
      "POST /reports/r2/approve": () => {
        approved = true;
        return { ok: true, body: {} };
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: /approve this version/i }));
    expect((await screen.findAllByText(/approved by admin/i, { selector: ".status-badge" })).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /approve this version/i })).not.toBeInTheDocument();
    expect(screen.getByText(/this version is locked/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/reports/r2/approve" && init?.method === "POST")).toBe(true);
  });

  it("shows why a failed report failed and offers no files", async () => {
    mount({
      "GET /reports?companyId=c1": () => ({
        ok: true,
        body: {
          reports: [
            report({
              status: "FAILED",
              error: "The report did not pass its quality checks: Every figure comes from the saved facts",
              files: [],
              quality: { passed: false, checks: [{ id: "numbersGrounded", name: "Every figure comes from the saved facts", passed: false, details: ["30% in opportunities.0.whyItMatters is not in the saved facts"] }] },
            }),
          ],
        },
      }),
    });
    expect((await screen.findAllByText(/did not pass quality checks/i, { selector: ".status-badge" })).length).toBeGreaterThan(0);
    expect(screen.getByText(/30% in opportunities\.0\.whyItMatters/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("downloads a file through the authenticated API", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:x");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const fetchMock = mount({
      "GET /reports?companyId=c1": () => ({ ok: true, body: { reports: [report()] } }),
      "GET /reports/r2/files/TECHNICAL/DOCX": () => ({ ok: true, blob: new Blob(["docx"]) }),
    });
    fireEvent.click(await screen.findByRole("button", { name: /download technical proposal/i }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/reports/r2/files/TECHNICAL/DOCX")).toBe(true);
  });

  it("lets you look at an earlier version", async () => {
    const v1 = report({ id: "r1", version: 1, status: "APPROVED", approvedBy: "admin", approvedAt: "2026-10-05T09:00:00Z", completedAt: "2026-10-05T08:00:00Z" });
    mount({ "GET /reports?companyId=c1": () => ({ ok: true, body: { reports: [report(), v1] } }) });
    expect(await screen.findByRole("heading", { name: "Version 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show version 1/i }));
    expect(await screen.findByRole("heading", { name: "Version 1" })).toBeInTheDocument();
    expect(screen.getByText(/this version is locked/i)).toBeInTheDocument();
  });

  it("surfaces a refusal to start, such as another report already being written", async () => {
    mount({
      "GET /reports?companyId=c1": () => ({ ok: true, body: { reports: [report()] } }),
      "POST /reports": () => ({ ok: false, status: 409, body: { error: { code: "REPORT_IN_PROGRESS", message: "A report is already being written. Try again when it finishes." } } }),
    });
    fireEvent.click(await screen.findByRole("button", { name: /write a new version/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already being written/i);
  });

  it("shows an error when the reports cannot be loaded", async () => {
    mount({ "GET /reports?companyId=c1": () => ({ ok: false, body: {} }) });
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load the reports/i);
  });
});
