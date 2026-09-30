import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import "@testing-library/jest-dom";
import OpportunityDetail from "./OpportunityDetail";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderAtId(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/opportunities/${id}`]}>
      <Routes>
        <Route path="/opportunities/:id" element={<OpportunityDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

const baseOpportunity = {
  id: "1",
  title: "X",
  status: "DISCOVERED",
  hypothesis: null,
  evidence: [],
  decisions: [],
  experiments: [],
};

describe("OpportunityDetail tabs", () => {
  it("shows the Overview tab by default with tab buttons for all sections", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => baseOpportunity }));

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evidence" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reasoning" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decisions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Experiments" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Learnings" })).toBeInTheDocument();
  });

  it("switches to the Evidence tab and shows evidence content", async () => {
    const opp = { ...baseOpportunity, evidence: [{ id: "ev1", claim: "A claim", type: "FACT" }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => opp }));

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Evidence" }));

    expect(screen.getByText(/A claim/)).toBeInTheDocument();
  });

  it("switches to the Reasoning tab, shows hypothesis and the Generate Report button", async () => {
    const opp = { ...baseOpportunity, hypothesis: "This will save time" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => opp });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Reasoning" }));

    expect(screen.getByDisplayValue("This will save time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Report" })).toBeInTheDocument();
  });

  it("switches to the Decisions tab and shows decision content", async () => {
    const opp = { ...baseOpportunity, decisions: [{ id: "d1", decision: "Proceed" }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => opp }));

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Decisions" }));

    expect(screen.getByText("Proceed")).toBeInTheDocument();
  });

  it("generates and displays a report from the Reasoning tab", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/report")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ report: "A generated report." }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => baseOpportunity });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Reasoning" }));
    fireEvent.click(screen.getByRole("button", { name: /generate report/i }));

    await waitFor(() => expect(screen.getByText("A generated report.")).toBeInTheDocument());
  });

  it("updates the hypothesis field via PATCH", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...baseOpportunity, hypothesis: "New hypothesis" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => baseOpportunity });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Reasoning" }));
    fireEvent.change(screen.getByLabelText(/hypothesis/i), { target: { value: "New hypothesis" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities/1"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
  });
});
