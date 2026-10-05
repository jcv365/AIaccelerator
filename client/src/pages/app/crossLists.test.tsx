import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import EvidenceExplorer from "./EvidenceExplorer";
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

describe("EvidenceExplorer", () => {
  it("shows loading, then an empty state", async () => {
    stubFetch([]);
    renderPage(<EvidenceExplorer />);
    expect(screen.getByText(/loading evidence/i)).toBeInTheDocument();
    expect(await screen.findByText(/no evidence recorded yet/i)).toBeInTheDocument();
  });

  it("shows an error when the request fails", async () => {
    stubFetch({}, false);
    renderPage(<EvidenceExplorer />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load evidence/i);
  });

  it("lists evidence with a text type tag, links to the opportunity, and filters", async () => {
    stubFetch([
      { id: "e1", claim: "Volume is rising", type: "FACT", capturedAt: "2026-10-01T00:00:00Z", opportunity: opp },
      { id: "e2", claim: "Staff may resist", type: "ASSUMPTION", capturedAt: "2026-10-02T00:00:00Z", opportunity: opp },
    ]);
    renderPage(<EvidenceExplorer />);
    expect(await screen.findByText("[FACT]")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Invoice triage" })[0]).toHaveAttribute("href", "/app/opportunities/o1");

    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "FACT" } });
    expect(screen.queryByText("Staff may resist")).not.toBeInTheDocument();
    expect(screen.getByText("Volume is rising")).toBeInTheDocument();
  });

  it("says plainly that quality scoring is unavailable", async () => {
    stubFetch([]);
    renderPage(<EvidenceExplorer />);
    expect(await screen.findByText(/quality scoring .* not available yet/i)).toBeInTheDocument();
  });
});

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
    fireEvent.click(screen.getByRole("tab", { name: "Completed" }));
    expect(screen.queryByText("Pilot A")).not.toBeInTheDocument();
    expect(screen.getByText("Pilot B")).toBeInTheDocument();
  });
});

describe("NoAiOpportunities", () => {
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
