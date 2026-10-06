import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import PovPipeline from "./PovPipeline";
import NoAiOpportunities from "./NoAiOpportunities";

afterEach(() => {
  vi.restoreAllMocks();
});

function stubFetch(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body }));
}

function renderPage(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const opp = { id: "o1", title: "Invoice triage" };

describe("PovPipeline", () => {
  const rows = [
    { id: "x1", title: "Pilot A", status: "RUNNING", opportunity: opp, _count: { learnings: 1 } },
    { id: "x2", title: "Pilot B", status: "COMPLETE", success: true, opportunity: opp, _count: { learnings: 0 } },
  ];

  it("shows an empty state when there are no experiments", async () => {
    stubFetch([]);
    renderPage(<PovPipeline />);
    expect(await screen.findByText(/no experiments yet/i)).toBeInTheDocument();
  });

  it("shows an error when the request fails", async () => {
    stubFetch({}, false);
    renderPage(<PovPipeline />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load experiments/i);
  });

  it("links rows to the experiment detail and filters by status tab", async () => {
    stubFetch(rows);
    renderPage(<PovPipeline />);
    expect(await screen.findByRole("link", { name: "Pilot A" })).toHaveAttribute(
      "href",
      "/app/opportunities/o1/experiments/x1",
    );
    fireEvent.click(screen.getByRole("tab", { name: /^Completed/ }));
    expect(screen.queryByText("Pilot A")).not.toBeInTheDocument();
    expect(screen.getByText("Pilot B")).toBeInTheDocument();
  });
});

describe("PovPipeline cards", () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  it("shows days left, the team and schedule progress derived from the start date and planned length", async () => {
    stubFetch([
      {
        id: "x1",
        title: "Pilot A",
        status: "RUNNING",
        startedAt: daysAgo(4),
        plannedDays: 14,
        team: ["Ann Lee", "Bo Chen"],
        opportunity: { ...opp, category: "Finance" },
        _count: { learnings: 2 },
      },
    ]);
    renderPage(<PovPipeline />);

    expect(await screen.findByText(/10 days left/)).toBeInTheDocument();
    expect(screen.getByText(/Invoice triage · Finance/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Team: Ann Lee, Bo Chen" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Pilot A schedule" })).toHaveAttribute("aria-valuenow", "29");
    expect(screen.getByText(/2 learnings/)).toBeInTheDocument();
  });

  it("says when a running experiment is overdue, and when one has not started or has no team", async () => {
    stubFetch([
      { id: "x1", title: "Late", status: "RUNNING", startedAt: daysAgo(20), plannedDays: 14, opportunity: opp },
      { id: "x2", title: "Waiting", status: "PLANNED", plannedDays: 14, opportunity: opp },
    ]);
    renderPage(<PovPipeline />);

    expect(await screen.findByText(/Overdue by 6 days/)).toBeInTheDocument();
    expect(screen.getByText("Not started · 14-day plan")).toBeInTheDocument();
    expect(screen.getAllByText("No team assigned").length).toBe(2);
  });
});

describe("NoAiOpportunities", () => {
  it("shows the latest decision, its reason and date, preferring the decision's rationale", async () => {
    stubFetch([
      {
        ...opp,
        status: "NO_AI",
        aiSuitability: "Fallback text",
        latestDecision: { id: "d1", decision: "Not AI", rationale: "Rules are deterministic", decidedAt: "2026-10-01T00:00:00Z" },
      },
    ]);
    renderPage(<NoAiOpportunities />);

    const row = (await screen.findByRole("link", { name: "Invoice triage" })).closest("tr")!;
    expect(row).toHaveTextContent("Rules are deterministic");
    expect(row).not.toHaveTextContent("Fallback text");
    expect(row).toHaveTextContent("Not AI");
    expect(row).toHaveTextContent(new Date("2026-10-01T00:00:00Z").toLocaleDateString());
  });

  it("shows an empty state when nothing is NO_AI", async () => {
    stubFetch([{ ...opp, status: "DISCOVERED" }]);
    renderPage(<NoAiOpportunities />);
    expect(await screen.findByText(/no opportunities have been decided as not-ai/i)).toBeInTheDocument();
  });

  it("shows an error when the request fails", async () => {
    stubFetch({}, false);
    renderPage(<NoAiOpportunities />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("lists only NO_AI opportunities with their reasoning", async () => {
    stubFetch([
      { ...opp, status: "NO_AI", aiSuitability: "Rules are deterministic" },
      { id: "o2", title: "Other", status: "QUALIFIED" },
    ]);
    renderPage(<NoAiOpportunities />);
    expect(await screen.findByRole("link", { name: "Invoice triage" })).toBeInTheDocument();
    expect(screen.getByText("Rules are deterministic")).toBeInTheDocument();
    expect(screen.queryByText("Other")).not.toBeInTheDocument();
  });
});
