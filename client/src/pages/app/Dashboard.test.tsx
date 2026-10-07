import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import Dashboard from "./Dashboard";

afterEach(() => {
  vi.restoreAllMocks();
});

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Answers each endpoint the dashboard reads; anything not given is a 404. */
function stubApi(routes: Record<string, unknown | ((init?: RequestInit) => unknown)>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) return reply(404, {});
    const value = routes[key];
    return typeof value === "function" ? (value as (i?: RequestInit) => unknown)(init) : reply(200, value);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );

const row = (over: Record<string, unknown>) => ({
  id: "1",
  title: "Opp",
  status: "DISCOVERED",
  estimatedAnnualValue: null,
  latestAssessment: null,
  latestDecision: null,
  _count: { evidence: 0, decisions: 0 },
  ...over,
});

describe("Dashboard", () => {
  it("shows a loading indicator before data arrives", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderDashboard();
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("shows an empty state with next-step links when there are no opportunities", async () => {
    stubApi({ "/opportunities": [] });
    renderDashboard();

    expect(await screen.findByText(/no opportunities yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start an analysis/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add one manually/i })).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    renderDashboard();
    expect(await screen.findByText(/could not load dashboard/i)).toBeInTheDocument();
  });

  it("shows real KPI counts, with the value card saying why it is empty", async () => {
    stubApi({
      "/opportunities": [
        row({ id: "1", _count: { evidence: 3, decisions: 0 } }),
        row({ id: "2", status: "QUALIFIED", _count: { evidence: 2, decisions: 1 } }),
      ],
      "/experiments": [],
    });
    renderDashboard();

    await screen.findByText("Opportunities");
    expect(screen.getByText("Opportunities").parentElement).toHaveTextContent("2");
    expect(screen.getByText("Evidence Sources").parentElement).toHaveTextContent("5");
    expect(screen.getByText("No values set yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view all/i })).toHaveAttribute("href", "/app/portfolio");
  });

  it("totals the user's value first, falls back to the AI value, and says how many are AI-estimated", async () => {
    stubApi({
      "/opportunities": [
        row({ id: "1", estimatedAnnualValue: 1_200_000 }),
        row({ id: "2", latestAssessment: { estimatedAnnualValue: 300_000 } }),
        row({ id: "3" }),
      ],
      "/experiments": [{ id: "e1", status: "RUNNING" }, { id: "e2", status: "COMPLETE" }],
    });
    renderDashboard();

    expect(await screen.findByText("R1.5M")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 AI-estimated")).toBeInTheDocument();
    const buckets = screen.getByRole("list", { name: "Opportunities by estimated annual value" });
    expect(within(buckets).getByText("High value (over R1M)").closest("li")).toHaveTextContent("1");
    expect(within(buckets).getByText("Further analysis (no value set)").closest("li")).toHaveTextContent("1");
    // Only the RUNNING experiment counts as active.
    await waitFor(() => expect(screen.getByText("Active 14-Day PoVs").parentElement).toHaveTextContent("1"));
  });

  it("shows the latest readiness assessment with its attribution", async () => {
    stubApi({
      "/opportunities": [row({})],
      "/experiments": [],
      "/readiness/latest": {
        overall: 62,
        dimensions: { strategy_governance: { score: 70, basis: "x" }, data_infrastructure: { score: 40, basis: "y" } },
        rationale: "Based on the evidence",
        model: "Fusion",
        createdAt: "2026-10-06T10:00:00Z",
      },
    });
    renderDashboard();

    expect(await screen.findByRole("img", { name: "62%" })).toBeInTheDocument();
    expect(screen.getByText("Strategy & Governance")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText(/AI assessment · Fusion/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-run assessment" })).toBeInTheDocument();
  });

  it("offers to run a readiness assessment when none exists, and shows the server's reason if it cannot", async () => {
    stubApi({
      "/opportunities": [row({})],
      "/experiments": [],
      "/readiness": (init?: RequestInit) =>
        init?.method === "POST"
          ? reply(503, { error: { code: "AI_NOT_CONFIGURED", message: "AI backend is not configured" } })
          : reply(404, {}),
    });
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Run readiness assessment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/AI backend is not configured/);
    // No invented score is shown.
    expect(screen.queryByRole("img", { name: /%$/ })).toBeNull();
  });

  it("lists the most recent decisions, newest first", async () => {
    stubApi({
      "/opportunities": [
        row({ id: "1", title: "Older", latestDecision: { id: "d1", decision: "Defer", rationale: null, decidedAt: "2026-09-01T00:00:00Z" } }),
        row({ id: "2", title: "Newer", latestDecision: { id: "d2", decision: "Proceed", rationale: null, decidedAt: "2026-10-01T00:00:00Z" } }),
      ],
      "/experiments": [],
    });
    renderDashboard();

    await waitFor(() => expect(screen.getByRole("link", { name: "Newer" })).toBeInTheDocument());
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Newer");
    expect(rows[1]).toHaveTextContent("Older");
  });
});
