import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import HypothesisEngine from "./HypothesisEngine";

afterEach(() => {
  vi.restoreAllMocks();
});

const list = [{ id: "o1", title: "Invoice triage" }];
const detail = { id: "o1", title: "Invoice triage", hypothesis: "Automation cuts cost", decisions: [] };

function routeFetch(handlers: Record<string, (init?: RequestInit) => { ok: boolean; status?: number; body: unknown }>) {
  const fn = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.replace("/api", "")}`;
    const h = handlers[key];
    if (!h) return Promise.reject(new Error(`unexpected ${key}`));
    const r = h(init);
    return Promise.resolve({ ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.body });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("HypothesisEngine", () => {
  it("shows an empty state when there are no opportunities", async () => {
    routeFetch({ "GET /opportunities": () => ({ ok: true, body: [] }) });
    render(
      <MemoryRouter>
        <HypothesisEngine />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/no opportunities yet/i)).toBeInTheDocument();
  });

  it("shows an error when the list fails to load", async () => {
    routeFetch({ "GET /opportunities": () => ({ ok: false, body: {} }) });
    render(
      <MemoryRouter>
        <HypothesisEngine />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("loads the focused opportunity, saves the hypothesis, records a decision, and flags recommendations as unavailable", async () => {
    const fetchMock = routeFetch({
      "GET /opportunities": () => ({ ok: true, body: list }),
      "GET /opportunities/o1": () => ({ ok: true, body: detail }),
      "GET /opportunities/o1/assessment": () => ({ ok: false, status: 404, body: {} }),
      "PATCH /opportunities/o1": () => ({ ok: true, body: detail }),
      "POST /opportunities/o1/decisions": () => ({
        ok: true,
        body: { id: "d1", decision: "Proceed", rationale: null, decidedAt: "2026-10-05T00:00:00Z" },
      }),
    });
    render(
      <MemoryRouter initialEntries={["/app/hypothesis?opportunity=o1"]}>
        <HypothesisEngine />
      </MemoryRouter>,
    );

    // The tab panel is also labelled "Hypothesis", so pick the text box by role.
    const box = await screen.findByRole("textbox", { name: "Hypothesis" });
    expect(box).toHaveValue("Automation cuts cost");
    // With no assessment run, the recommendation card says so and estimates nothing.
    expect(screen.getByText(/no ai assessment has been run/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run assessment" })).toBeInTheDocument();

    fireEvent.change(box, { target: { value: "New hypothesis" } });
    fireEvent.click(screen.getByRole("button", { name: /save hypothesis/i }));
    expect(await screen.findByText(/hypothesis saved/i)).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(patch![1].body as string)).toEqual({ hypothesis: "New hypothesis" });

    fireEvent.click(screen.getByRole("tab", { name: "Decision" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Decision" }), { target: { value: "Proceed" } });
    fireEvent.click(screen.getByRole("button", { name: /record decision/i }));
    expect(await screen.findByText(/decision recorded/i)).toBeInTheDocument();
    expect(screen.getByText("Proceed")).toBeInTheDocument();
  });
});
