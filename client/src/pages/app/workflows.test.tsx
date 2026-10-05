import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import HypothesisEngine from "./HypothesisEngine";
import ReportsAndExports from "./ReportsAndExports";

afterEach(() => {
  vi.restoreAllMocks();
});

const list = [{ id: "o1", title: "Invoice triage" }];
const detail = { id: "o1", title: "Invoice triage", hypothesis: "Automation cuts cost", decisions: [] };

function routeFetch(handlers: Record<string, (init?: RequestInit) => { ok: boolean; status?: number; body: unknown }>) {
  const fn = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.replace("/api", "")}`;
    const h = handlers[key];
    if (!h) return Promise.reject(new Error(`unexpected ${key}`));
    const r = h(init);
    return Promise.resolve({ ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.body });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("HypothesisEngine", () => {
  it("shows an empty state when there are no opportunities", async () => {
    routeFetch({ "GET /opportunities": () => ({ ok: true, body: [] }) });
    render(
      <MemoryRouter>
        <HypothesisEngine />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/no opportunities yet/i)).toBeInTheDocument();
  });

  it("shows an error when the list fails to load", async () => {
    routeFetch({ "GET /opportunities": () => ({ ok: false, body: {} }) });
    render(
      <MemoryRouter>
        <HypothesisEngine />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("loads the focused opportunity, saves the hypothesis, records a decision, and flags recommendations as unavailable", async () => {
    const fetchMock = routeFetch({
      "GET /opportunities": () => ({ ok: true, body: list }),
      "GET /opportunities/o1": () => ({ ok: true, body: detail }),
      "PATCH /opportunities/o1": () => ({ ok: true, body: detail }),
      "POST /opportunities/o1/decisions": () => ({
        ok: true,
        body: { id: "d1", decision: "Proceed", rationale: null, decidedAt: "2026-10-05T00:00:00Z" },
      }),
    });
    render(
      <MemoryRouter initialEntries={["/app/hypothesis?opportunity=o1"]}>
        <HypothesisEngine />
      </MemoryRouter>,
    );

    const box = await screen.findByLabelText("Hypothesis");
    expect(box).toHaveValue("Automation cuts cost");
    expect(screen.getByText(/recommendations .* not available yet/i)).toBeInTheDocument();

    fireEvent.change(box, { target: { value: "New hypothesis" } });
    fireEvent.click(screen.getByRole("button", { name: /save hypothesis/i }));
    expect(await screen.findByText(/hypothesis saved/i)).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(patch![1].body as string)).toEqual({ hypothesis: "New hypothesis" });

    fireEvent.change(screen.getByLabelText("Decision"), { target: { value: "Proceed" } });
    fireEvent.click(screen.getByRole("button", { name: /record decision/i }));
    expect(await screen.findByText(/decision recorded/i)).toBeInTheDocument();
    expect(screen.getByText("Proceed")).toBeInTheDocument();
  });
});

describe("ReportsAndExports", () => {
  it("lists every non-narrative report as visibly unavailable", async () => {
    routeFetch({ "GET /opportunities": () => ({ ok: true, body: list }) });
    render(<ReportsAndExports />);
    expect(await screen.findByText("ROI report")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /not yet available/i });
    expect(buttons).toHaveLength(6);
    buttons.forEach((b) => expect(b).toBeDisabled());
  });

  it("shows an error when the list fails to load", async () => {
    routeFetch({ "GET /opportunities": () => ({ ok: false, body: {} }) });
    render(<ReportsAndExports />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("generates the opportunity report", async () => {
    routeFetch({
      "GET /opportunities": () => ({ ok: true, body: list }),
      "POST /opportunities/o1/report": () => ({ ok: true, body: { report: "Report body text" } }),
    });
    render(<ReportsAndExports />);
    const select = await screen.findByLabelText("Opportunity");
    const generate = screen.getByRole("button", { name: /generate report/i });
    expect(generate).toBeDisabled();
    fireEvent.change(select, { target: { value: "o1" } });
    fireEvent.click(generate);
    expect(await screen.findByText("Report body text")).toBeInTheDocument();
  });

  it("surfaces the AI-not-configured error from the report endpoint", async () => {
    routeFetch({
      "GET /opportunities": () => ({ ok: true, body: list }),
      "POST /opportunities/o1/report": () => ({
        ok: false,
        status: 503,
        body: { error: { code: "AI_NOT_CONFIGURED", message: "AI backend is not configured" } },
      }),
    });
    render(<ReportsAndExports />);
    fireEvent.change(await screen.findByLabelText("Opportunity"), { target: { value: "o1" } });
    fireEvent.click(screen.getByRole("button", { name: /generate report/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/not configured/i));
  });
});
