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
    expect(screen.getByRole("tab", { name: "Evidence" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Reasoning" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Decisions" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Experiments" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Learnings" })).toBeInTheDocument();
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

  it("switches to the Decisions tab and shows decision content", async () => {
    const opp = { ...baseOpportunity, decisions: [{ id: "d1", decision: "Proceed" }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => opp }));

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Decisions" }));

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
    fireEvent.click(screen.getByRole("tab", { name: "Reasoning" }));
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
  it("lists experiments and adds a new one", async () => {
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

    expect(screen.getByText("Try automation")).toBeInTheDocument();

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

  it("updates an experiment's status via PATCH", async () => {
    const opp = {
      ...baseOpportunity,
      experiments: [
        { id: "e1", title: "Try automation", method: "Script it", status: "PLANNED", resultSummary: null, success: null, learnings: [] },
      ],
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH" && url.includes("/experiments/e1")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...opp.experiments[0], status: "RUNNING" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => opp });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Experiments" }));
    fireEvent.change(screen.getByLabelText(/experiment status/i), { target: { value: "RUNNING" } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities/1/experiments/e1"),
        expect.objectContaining({ method: "PATCH" })
      )
    );
  });

  it("updates an experiment's resultSummary via PATCH on blur", async () => {
    const opp = {
      ...baseOpportunity,
      experiments: [
        { id: "e1", title: "Try automation", method: "Script it", status: "PLANNED", resultSummary: null, success: null, learnings: [] },
      ],
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH" && url.includes("/experiments/e1")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...opp.experiments[0], resultSummary: "Worked well" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => opp });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Experiments" }));

    const input = screen.getByPlaceholderText("Result summary");
    fireEvent.change(input, { target: { value: "Worked well" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities/1/experiments/e1"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ resultSummary: "Worked well" }),
        })
      )
    );
  });

  it("toggles an experiment's success via checkbox PATCH", async () => {
    const opp = {
      ...baseOpportunity,
      experiments: [
        { id: "e1", title: "Try automation", method: "Script it", status: "PLANNED", resultSummary: null, success: null, learnings: [] },
      ],
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH" && url.includes("/experiments/e1")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...opp.experiments[0], success: true }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => opp });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Experiments" }));

    fireEvent.click(screen.getByLabelText(/success/i));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities/1/experiments/e1"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ success: true }),
        })
      )
    );
  });
});

describe("OpportunityDetail Learnings tab", () => {
  it("lists learnings across experiments and adds a new one", async () => {
    const opp = {
      ...baseOpportunity,
      experiments: [
        { id: "e1", title: "Try automation", method: "Script it", status: "COMPLETE", resultSummary: "Worked", success: true, learnings: [{ id: "l1", insight: "Automation saves 2 days" }] },
      ],
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.includes("/learnings")) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: "l2", experimentId: "e1", insight: "New insight" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => opp });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Learnings" }));

    expect(screen.getByText(/Automation saves 2 days/)).toBeInTheDocument();
    expect(screen.getByText(/\(Try automation\)/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/experiment/i), { target: { value: "e1" } });
    fireEvent.change(screen.getByPlaceholderText("Insight"), { target: { value: "New insight" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Learning" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities/1/experiments/e1/learnings"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("hides the add-learning form when there are no experiments yet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => baseOpportunity }));

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: "Learnings" }));

    expect(screen.queryByPlaceholderText("Insight")).not.toBeInTheDocument();
  });
});
