import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "./App";
import { PRODUCT_NAME } from "./brand";

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, "", "/sign-in");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("shows the login form when no token is stored", async () => {
    render(<App />);

    expect(await screen.findByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
  });

  it("shows the product name from brand.ts as the login heading", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: PRODUCT_NAME })).toBeInTheDocument();
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

    await waitFor(() => expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument());
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
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument());
  });

  it("shows an error message on failed login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    render(<App />);

    fireEvent.change(await screen.findByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/invalid/i));
  });

  it("shows an error message when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    render(<App />);

    fireEvent.change(await screen.findByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-password" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/unreachable/i));
  });

  it("logs out and returns to the login form", async () => {
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

    await waitFor(() => expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(await screen.findByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(localStorage.getItem("aiaccelerator_auth_token")).toBeNull();
  });
});
