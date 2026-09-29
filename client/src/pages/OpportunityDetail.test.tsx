import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

describe("OpportunityDetail", () => {
  it("renders the opportunity, its evidence, and its decisions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "1",
          title: "Contract renewals",
          status: "QUALIFIED",
          evidence: [{ id: "e1", claim: "Renewal volume is high", type: "FACT" }],
          decisions: [{ id: "d1", decision: "Proceed to hypothesis phase" }],
        }),
      })
    );

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("Contract renewals")).toBeInTheDocument());
    expect(screen.getByText(/Renewal volume is high/)).toBeInTheDocument();
    expect(screen.getByText("Proceed to hypothesis phase")).toBeInTheDocument();
  });

  it("only offers valid next statuses in the transition select", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "1", title: "X", status: "PROVING", evidence: [], decisions: [] }),
      })
    );

    renderAtId("1");

    await waitFor(() => expect(screen.getByText("X")).toBeInTheDocument());
    const select = screen.getByLabelText(/status/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(["PROVING", "PROVEN", "REJECTED"]);
  });
});
