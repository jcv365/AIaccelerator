import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
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

type Reply = { ok: boolean; status?: number; body?: unknown; blob?: Blob };

function stub(handlers: Record<string, (init?: RequestInit) => Reply>) {
  const fn = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.replace(/^\/api/, "")}`;
    const h = handlers[key];
    if (!h) return Promise.reject(new Error(`unexpected ${key}`));
    const r = h(init);
    return Promise.resolve({ ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.body, blob: async () => r.blob ?? new Blob(["a,b"]) });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const maersk = { id: "c1", name: "Maersk", website: null, opportunityCount: 3 };

function mount(handlers: Record<string, (init?: RequestInit) => Reply>) {
  const fn = stub({ "GET /companies": () => ({ ok: true, body: [maersk] }), ...handlers });
  render(
    <MemoryRouter>
      <CompanyProvider>
        <ReportsAndExports />
      </CompanyProvider>
    </MemoryRouter>
  );
  return fn;
}

describe("Reports & Exports: Standard Reports", () => {
  it("lists the five standard reports and the data export, each with an action", async () => {
    mount({});
    for (const name of ["Executive Summary", "Opportunity Portfolio Report", "Evidence Report", "PoV Results Report", "ROI & Business Case"]) {
      expect(await screen.findByRole("button", { name: `Generate ${name}` })).toBeEnabled();
    }
    expect(screen.getByRole("button", { name: "Download Export Data" })).toBeEnabled();
  });

  it("generates a report for the selected company and shows it with the model that wrote it", async () => {
    let body: Record<string, unknown> = {};
    mount({
      "POST /reports/standard/portfolio": (init) => {
        body = JSON.parse(String(init?.body));
        return { ok: true, body: { type: "portfolio", report: "First paragraph.\n\nSecond paragraph.", model: "Fusion", createdAt: "2026-10-06T10:00:00Z" } };
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Generate Opportunity Portfolio Report" }));

    expect(await screen.findByText("Second paragraph.")).toBeInTheDocument();
    expect(screen.getByText(/written by ai.*fusion/i)).toBeInTheDocument();
    expect(body).toEqual({ companyId: "c1" });
  });

  it("shows the server's reason when a report cannot be generated", async () => {
    mount({
      "POST /reports/standard/roi": () => ({ ok: false, status: 503, body: { error: { code: "AI_NOT_CONFIGURED", message: "AI backend is not configured" } } }),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Generate ROI & Business Case" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/AI backend is not configured/);
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("downloads the CSV through the authenticated API, scoped to the company", async () => {
    const create = vi.fn(() => "blob:csv");
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const fetchMock = mount({ "GET /exports/opportunities.csv?companyId=c1": () => ({ ok: true, blob: new Blob(["Title\r\nA"]) }) });

    fireEvent.click(await screen.findByRole("button", { name: "Download Export Data" }));

    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/exports/opportunities.csv?companyId=c1"))).toBe(true);
  });

  it("says plainly that Custom and Scheduled reports are not available", async () => {
    mount({});
    fireEvent.click(await screen.findByRole("tab", { name: "Custom Reports" }));
    expect(screen.getByText(/custom reports are not available yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Scheduled Reports" }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText(/scheduled reports are not available yet/i)).toBeInTheDocument();
  });
});
