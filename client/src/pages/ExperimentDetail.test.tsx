import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import "@testing-library/jest-dom";
import ExperimentDetail from "./ExperimentDetail";

afterEach(() => {
  vi.restoreAllMocks();
});

function renderAt(id: string, experimentId: string) {
  return render(
    <MemoryRouter initialEntries={[`/opportunities/${id}/experiments/${experimentId}`]}>
      <Routes>
        <Route path="/opportunities/:id/experiments/:experimentId" element={<ExperimentDetail />} />
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
  experiments: [
    { id: "e1", title: "Try automation", method: "Script it", status: "PLANNED", resultSummary: null, success: null, learnings: [] },
  ],
};

describe("ExperimentDetail", () => {
  it("shows the experiment's title and method, with a back link to the opportunity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => baseOpportunity }));

    renderAt("1", "e1");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Try automation" })).toBeInTheDocument());
    expect(screen.getByText("Script it")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to x/i })).toHaveAttribute("href", "/app/opportunities/1");
  });

  it("shows an error when the experiment is not found on the loaded opportunity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => baseOpportunity }));

    renderAt("1", "does-not-exist");

    expect(await screen.findByRole("alert")).toHaveTextContent(/not found/i);
  });

  it("updates the experiment's status via PATCH", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH" && url.includes("/experiments/e1")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...baseOpportunity.experiments[0], status: "RUNNING" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => baseOpportunity });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("1", "e1");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Try automation" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/experiment status/i), { target: { value: "RUNNING" } });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities/1/experiments/e1"),
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "RUNNING" }) })
      )
    );
  });

  it("updates the experiment's resultSummary via PATCH on blur", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH" && url.includes("/experiments/e1")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...baseOpportunity.experiments[0], resultSummary: "Worked well" }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => baseOpportunity });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("1", "e1");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Try automation" })).toBeInTheDocument());
    const input = screen.getByPlaceholderText("Result summary");
    fireEvent.change(input, { target: { value: "Worked well" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities/1/experiments/e1"),
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ resultSummary: "Worked well" }) })
      )
    );
  });

  it("toggles the experiment's success via checkbox PATCH", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PATCH" && url.includes("/experiments/e1")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...baseOpportunity.experiments[0], success: true }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => baseOpportunity });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("1", "e1");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Try automation" })).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/success/i));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities/1/experiments/e1"),
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ success: true }) })
      )
    );
  });

  it("lists learnings and adds a new one", async () => {
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

    renderAt("1", "e1");

    await waitFor(() => expect(screen.getByText(/Automation saves 2 days/)).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Insight"), { target: { value: "New insight" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Learning" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/opportunities/1/experiments/e1/learnings"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });
});
