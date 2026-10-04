import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import Dashboard from "./Dashboard";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Dashboard", () => {
  it("shows a loading indicator before data arrives", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("shows an empty state with next-step links when there are no opportunities", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }));

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(await screen.findByText(/no opportunities yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start an analysis/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add one manually/i })).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("shows real KPI counts and flags the ones with no backend source yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { id: "1", status: "DISCOVERED", _count: { evidence: 3, decisions: 0 } },
          { id: "2", status: "QUALIFIED", _count: { evidence: 2, decisions: 1 } },
        ],
      })
    );

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(screen.getByText("Opportunities")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Evidence Sources")).toBeInTheDocument();
    expect(screen.getAllByText("Not yet available")).toHaveLength(2);
    expect(screen.getByText(/no ai-readiness scoring exists/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open the opportunity portfolio/i })).toBeInTheDocument();
  });
});
