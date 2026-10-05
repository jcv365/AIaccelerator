import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import Portfolio from "./Portfolio";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Portfolio", () => {
  it("shows a friendly message (and no status sections) when there are no opportunities", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }));

    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>
    );

    expect(await screen.findByText(/no opportunities yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "DISCOVERED" })).not.toBeInTheDocument();
  });

  it("groups opportunities into sections by status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          { id: "1", title: "Discovered One", status: "DISCOVERED", owner: null },
          { id: "2", title: "Qualified One", status: "QUALIFIED", owner: null },
          { id: "3", title: "Discovered Two", status: "DISCOVERED", owner: null },
        ],
      })
    );

    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Discovered One")).toBeInTheDocument());
    expect(screen.getByText("Discovered Two")).toBeInTheDocument();
    expect(screen.getByText("Qualified One")).toBeInTheDocument();

    const discoveredHeading = screen.getByRole("heading", { name: "DISCOVERED" });
    const qualifiedHeading = screen.getByRole("heading", { name: "QUALIFIED" });
    expect(discoveredHeading).toBeInTheDocument();
    expect(qualifiedHeading).toBeInTheDocument();
  });

  it("does not render a heading for a status with no opportunities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ id: "1", title: "Discovered One", status: "DISCOVERED", owner: null }],
      })
    );

    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Discovered One")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "PROVEN" })).not.toBeInTheDocument();
  });

  it("keeps the + New link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }));

    render(
      <MemoryRouter>
        <Portfolio />
      </MemoryRouter>
    );

    expect(await screen.findByText("+ New")).toBeInTheDocument();
  });
});
