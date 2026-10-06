import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import HypothesisEngine from "./HypothesisEngine";

afterEach(() => {
  vi.restoreAllMocks();
});

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Keyed by "METHOD /path"; anything not listed is a 404. */
function stubApi(handlers: Record<string, (init?: RequestInit) => unknown>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).replace("/api", "")}`;
    const h = handlers[key];
    return h ? h(init) : reply(404, {});
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const detail = {
  id: "o1",
  title: "Invoice triage",
  hypothesis: "Automation cuts cost",
  risks: "Data quality varies",
  evidence: [
    { id: "e1", claim: "Volume is rising", type: "FACT", source: "Annual report" },
    { id: "e2", claim: "Staff may resist", type: "ASSUMPTION" },
  ],
  decisions: [{ id: "d1", decision: "Investigate", rationale: null, assumptions: "Clean data exists", risks: null, decidedAt: "2026-10-01T00:00:00Z" }],
};

const assessment = {
  id: "a1",
  category: "Finance",
  estimatedAnnualValue: 1_200_000,
  priority: "HIGH",
  recommendation: "PROCEED_TO_POV",
  confidence: 0.72,
  effort: "LOW",
  risk: "MEDIUM",
  whyBelieve: ["Volume is rising"],
  couldDisprove: ["Error rate is already low"],
  rationale: "Based on the recorded evidence",
  model: "Fusion",
  createdAt: "2026-10-06T10:00:00Z",
};

const renderEngine = () =>
  render(
    <MemoryRouter initialEntries={["/app/hypothesis?opportunity=o1"]}>
      <HypothesisEngine />
    </MemoryRouter>
  );

const base = {
  "GET /opportunities": () => reply(200, [{ id: "o1", title: "Invoice triage" }]),
  "GET /opportunities/o1": () => reply(200, detail),
};

describe("HypothesisEngine tabs and recommendation", () => {
  it("shows the AI's reasons, what could disprove it and the recommendation card with attribution", async () => {
    stubApi({ ...base, "GET /opportunities/o1/assessment": () => reply(200, assessment) });
    renderEngine();

    expect(await screen.findByText("Volume is rising")).toBeInTheDocument();
    expect(screen.getByText("Error rate is already low")).toBeInTheDocument();
    expect(screen.getByText(/AI assessment · Fusion/)).toBeInTheDocument();

    const card = screen.getByRole("complementary", { name: "Decision recommendation" });
    expect(within(card).getByText("Proceed to a 14-day PoV")).toBeInTheDocument();
    expect(within(card).getByText("72%")).toBeInTheDocument();
    expect(within(card).getByText("R1.2M")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Re-run assessment" })).toBeInTheDocument();
  });

  it("runs an assessment on request and shows the server's reason if it cannot", async () => {
    let calls = 0;
    stubApi({
      ...base,
      "POST /opportunities/o1/assessment": () => {
        calls += 1;
        return calls === 1
          ? reply(503, { error: { code: "AI_NOT_CONFIGURED", message: "AI backend is not configured" } })
          : reply(201, assessment);
      },
    });
    renderEngine();

    fireEvent.click(await screen.findByRole("button", { name: "Run assessment" }));
    expect(await screen.findByText(/AI backend is not configured/)).toBeInTheDocument();
    expect(screen.queryByText("Proceed to a 14-day PoV")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Run assessment" }));
    expect(await screen.findByText("Proceed to a 14-day PoV")).toBeInTheDocument();
    expect(screen.getByText("Error rate is already low")).toBeInTheDocument();
  });

  it("fills the Evidence, Assumptions and Risks tabs from what is recorded", async () => {
    stubApi(base);
    renderEngine();
    await screen.findByRole("textbox", { name: "Hypothesis" });

    fireEvent.click(screen.getByRole("tab", { name: "Evidence" }));
    expect(screen.getByText("Annual report")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Assumptions" }));
    expect(screen.getByText("Staff may resist")).toBeInTheDocument();
    expect(screen.getByText("Clean data exists")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Risks" }));
    expect(screen.getByText("Data quality varies")).toBeInTheDocument();
  });

  it("creates a 14-day PoV for the opportunity and links to it", async () => {
    let body: Record<string, unknown> = {};
    stubApi({
      ...base,
      "POST /opportunities/o1/experiments": (init) => {
        body = JSON.parse(String(init?.body));
        return reply(201, { id: "x9" });
      },
    });
    renderEngine();

    fireEvent.click(await screen.findByRole("button", { name: "Create 14-day PoV" }));
    const link = await screen.findByRole("link", { name: /open the new poV/i });
    expect(link).toHaveAttribute("href", "/app/opportunities/o1/experiments/x9");
    expect(body).toMatchObject({ title: "14-day PoV: Invoice triage", plannedDays: 14 });
    expect(screen.getByRole("button", { name: "Create 14-day PoV" })).toBeDisabled();
  });
});
