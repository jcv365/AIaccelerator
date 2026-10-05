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
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Reasoning" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Evidence" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Connectors" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Experiments" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Decision" })).toBeInTheDocument();
  });

  it("shows a loading indicator, then an error message, when the opportunity fails to load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    renderAtId("1");

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("switches to the Evidence tab and shows evidence content", async () => {
    const opp = { ...baseOpportunity, evidence: [{ id: "ev1", claim: "A claim", type: "FACT" }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => opp }));

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Evidence" }));

    expect(screen.getByText(/A claim/)).toBeInTheDocument();
  });

  it("switches to the Reasoning tab, shows hypothesis and the Generate Report button", async () => {
    const opp = { ...baseOpportunity, hypothesis: "This will save time" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => opp });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Reasoning" }));

    expect(screen.getByDisplayValue("This will save time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Report" })).toBeInTheDocument();
  });

  it("switches to the Connectors tab and shows the placeholder-contract notice", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => baseOpportunity }));

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Connectors" }));

    expect(screen.getByText(/no data-source connector backend exists yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /re-analyse/i })).toBeDisabled();
  });

  it("switches to the Decision tab and shows decision content", async () => {
    const opp = { ...baseOpportunity, decisions: [{ id: "d1", decision: "Proceed" }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => opp }));

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Decision" }));

    expect(screen.getByText("Proceed")).toBeInTheDocument();
  });

  describe("saved reports", () => {
    function stubFetch(reportGet: { ok: boolean; status: number; body?: unknown }, reportPost?: { report: string; createdAt: string | null }) {
      const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith("/report")) {
          if (init?.method === "POST") {
            return Promise.resolve({ ok: true, status: 200, json: async () => reportPost });
          }
          return Promise.resolve({ ok: reportGet.ok, status: reportGet.status, json: async () => reportGet.body });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => baseOpportunity });
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    async function openReasoningTab() {
      renderAtId("1");
      await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("tab", { name: "Reasoning" }));
    }

    it("shows the latest saved report, with when it was generated, without clicking Generate", async () => {
      stubFetch({ ok: true, status: 200, body: { report: "Saved report text", model: "Fusion", createdAt: "2026-10-05T10:00:00.000Z" } });

      await openReasoningTab();

      expect(await screen.findByText("Saved report text")).toBeInTheDocument();
      expect(screen.getByText(/generated/i, { selector: "p" })).toBeInTheDocument();
    });

    it("shows no report and no error when none has been generated yet (404)", async () => {
      stubFetch({ ok: false, status: 404, body: { error: { code: "NOT_FOUND", message: "No report has been generated yet" } } });

      await openReasoningTab();

      expect(screen.getByRole("button", { name: "Generate Report" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByText(/saved report text/i)).not.toBeInTheDocument();
    });

    it("replaces the shown report with a freshly generated one", async () => {
      stubFetch(
        { ok: true, status: 200, body: { report: "Old report", model: "Fusion", createdAt: "2026-10-04T10:00:00.000Z" } },
        { report: "Fresh report", createdAt: "2026-10-05T12:00:00.000Z" }
      );

      await openReasoningTab();
      expect(await screen.findByText("Old report")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /generate report/i }));

      expect(await screen.findByText("Fresh report")).toBeInTheDocument();
      expect(screen.queryByText("Old report")).not.toBeInTheDocument();
    });

    it("warns that a generated report could not be saved (createdAt null)", async () => {
      stubFetch({ ok: false, status: 404 }, { report: "Unsaved report", createdAt: null });

      await openReasoningTab();
      fireEvent.click(screen.getByRole("button", { name: /generate report/i }));

      expect(await screen.findByText("Unsaved report")).toBeInTheDocument();
      expect(screen.getByText(/could not be saved/i)).toBeInTheDocument();
    });
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
    fireEvent.click(screen.getByRole("tab", { name: "Reasoning" }));
    fireEvent.click(screen.getByRole("button", { name: /generate report/i }));

    await waitFor(() => expect(screen.getByText("A generated report.")).toBeInTheDocument());
  });

  it("shows an inline error when report generation fails, instead of alert()", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/report")) {
        return Promise.resolve({ ok: false, status: 503, json: async () => ({ error: { message: "AI backend unavailable" } }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => baseOpportunity });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Reasoning" }));
    fireEvent.click(screen.getByRole("button", { name: /generate report/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/ai backend unavailable/i);
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
    fireEvent.click(screen.getByRole("tab", { name: "Reasoning" }));
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

describe("OpportunityDetail Experiments tab", () => {
  it("lists experiments, links to each one's detail page, and adds a new one", async () => {
    const opp = {
      ...baseOpportunity,
      experiments: [
        { id: "e1", title: "Try automation", method: "Script the workflow", status: "PLANNED", resultSummary: null, success: null, learnings: [] },
      ],
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/experiments")) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ id: "e2", title: "New one", method: "M", status: "PLANNED", resultSummary: null, success: null, learnings: [] }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => opp });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Experiments" }));

    const link = screen.getByRole("link", { name: "Try automation" });
    expect(link).toHaveAttribute("href", "/app/opportunities/1/experiments/e1");

    fireEvent.change(screen.getByPlaceholderText("Title"), { target: { value: "New one" } });
    fireEvent.change(screen.getByPlaceholderText("Method"), { target: { value: "M" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Experiment" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities/1/experiments"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });
});
