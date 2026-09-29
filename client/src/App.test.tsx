import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "./App";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("shows the login form when no token is stored", async () => {
    render(<App />);

    expect(await screen.findByRole("button", { name: /log in/i })).toBeInTheDocument();
  });

  it("shows the opportunity list once a token is already stored", async () => {
    localStorage.setItem("aiaccelerator_auth_token", "existing-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/health")) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [] });
      })
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText("+ New")).toBeInTheDocument());
  });

  it("logs in successfully and reveals the app", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/auth/login")) {
          return Promise.resolve({ ok: true, json: async () => ({ token: "new-token" }) });
        }
        if (url.includes("/health")) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [] });
      })
    );

    render(<App />);

    fireEvent.change(await screen.findByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-password" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByText("+ New")).toBeInTheDocument());
  });

  it("shows an error message on failed login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    render(<App />);

    fireEvent.change(await screen.findByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/invalid/i));
  });
});
