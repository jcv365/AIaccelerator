import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import OpportunityList from "./OpportunityList";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OpportunityList", () => {
  it("renders the fetched opportunities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ id: "1", title: "Contract renewals", status: "QUALIFIED", owner: "J. Smith" }],
      })
    );

    render(
      <MemoryRouter>
        <OpportunityList />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Contract renewals")).toBeInTheDocument());
    expect(screen.getByText("QUALIFIED")).toBeInTheDocument();
  });
});
