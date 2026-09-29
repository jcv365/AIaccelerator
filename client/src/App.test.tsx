import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "./App";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("shows the opportunity list at the root route by default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/health")) return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
        return Promise.resolve({ ok: true, status: 200, json: async () => [] });
      })
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText("AI Accelerator")).toBeInTheDocument());
  });
});
