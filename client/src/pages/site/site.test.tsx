import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import Landing from "./Landing";
import SignIn from "./SignIn";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Landing", () => {
  it("describes the journey in text and offers sign-in", () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    for (const step of ["Discover", "Reason", "Prove", "Decide", "Learn"]) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("link", { name: /sign in/i })[0]).toHaveAttribute("href", "/sign-in");
  });

  it("marks the demo booking as not yet available instead of linking nowhere", () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /book a demo/i })).toBeDisabled();
  });
});

describe("SignIn", () => {
  it("shows SSO providers as disabled, coming-soon controls", () => {
    render(
      <MemoryRouter>
        <SignIn onSuccess={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /microsoft.*coming soon/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /google.*coming soon/i })).toBeDisabled();
  });

  it("calls onSuccess after a successful login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "t" }) }));
    const onSuccess = vi.fn();
    render(
      <MemoryRouter>
        <SignIn onSuccess={onSuccess} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("shows an inline error on failed login and does not call onSuccess", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const onSuccess = vi.fn();
    render(
      <MemoryRouter>
        <SignIn onSuccess={onSuccess} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid username or password/i);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
