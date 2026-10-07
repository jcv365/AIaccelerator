import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
    // The header and the hero each offer it; every one is disabled.
    const buttons = screen.getAllByRole("button", { name: /book a demo/i });
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b).toBeDisabled();
  });
});

describe("Landing sections", () => {
  it("makes every nav link point at a section that exists on the page", () => {
    const { container } = render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: /on this page/i });
    const links = Array.from(nav.querySelectorAll("a"));
    expect(links.map((a) => a.textContent)).toEqual(["Why AI Accelerator", "How it works", "Use cases", "Results"]);
    for (const a of links) {
      expect(container.querySelector(a.getAttribute("href")!)).not.toBeNull();
    }
  });

  it("draws the mountain path as a described image and lists the five features, with no video promise", () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    expect(screen.getByRole("img", { name: /mountain path.*discover.*learn/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Turn AI potential into measurable business value.");
    const strip = screen.getByRole("list", { name: /what sets it apart/i });
    for (const feature of ["Evidence-Based", "Fail-Fast", "Real Business", "Measurable", "Expert-Guided"]) {
      expect(within(strip).getByText(feature)).toBeInTheDocument();
    }
    expect(screen.queryByText(/watch overview/i)).toBeNull();
  });
});

describe("SignIn", () => {
  it("shows the welcome panel with its value points and says who resets passwords", () => {
    render(
      <MemoryRouter>
        <SignIn onSuccess={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByText(/validate with evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/ask your administrator/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

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
