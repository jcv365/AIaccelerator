import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import SystemHealth from "./SystemHealth";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SystemHealth", () => {
  it("shows a loading indicator while checks run", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<SystemHealth />);
    expect(screen.getByRole("status")).toHaveTextContent(/running health checks/i);
  });

  it("shows each check with a text status and the build version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => (url.includes("/version") ? { version: "1.2.3", commit: "abc123" } : { status: "ok" }),
        }),
      ),
    );
    render(<SystemHealth />);
    expect(await screen.findByText(/version 1\.2\.3 \(commit abc123\)/i)).toBeInTheDocument();
    expect(screen.getAllByText("OK")).toHaveLength(3);
  });

  it("flags a failing readiness check with its reason, not just a colour", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) =>
        url.includes("/ready")
          ? Promise.resolve({ ok: false, status: 503, json: async () => ({ error: { message: "Database is unreachable" } }) })
          : Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok", version: "1", commit: "c" }) }),
      ),
    );
    render(<SystemHealth />);
    expect(await screen.findByText("Failing")).toBeInTheDocument();
    expect(screen.getByText("Database is unreachable")).toBeInTheDocument();
  });

  it("reports an unreachable server per check", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<SystemHealth />);
    expect(await screen.findAllByText("Failing")).toHaveLength(3);
    expect(screen.getAllByText("Unreachable")).toHaveLength(3);
  });
});
