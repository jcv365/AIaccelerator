import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "./App";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("shows the backend status once the health check resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok" }),
      })
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText(/backend status: ok/i)).toBeInTheDocument());
  });

  it("shows an error state when the health check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/backend status: unreachable/i)).toBeInTheDocument()
    );
  });
});
