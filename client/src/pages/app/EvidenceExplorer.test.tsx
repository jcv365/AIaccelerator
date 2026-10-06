import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import EvidenceExplorer from "./EvidenceExplorer";

afterEach(() => {
  vi.restoreAllMocks();
});

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function stubApi(routes: Record<string, unknown | ((init?: RequestInit) => unknown)>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    // Longest key first, so "/opportunities/o1/evidence" is not swallowed by "/opportunities".
    const key = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((k) => String(url).includes(k));
    if (!key) return reply(404, {});
    const v = routes[key];
    return typeof v === "function" ? (v as (i?: RequestInit) => unknown)(init) : reply(200, v);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <EvidenceExplorer />
    </MemoryRouter>
  );

const opp = { id: "o1", title: "Invoice triage" };
const recent = new Date(Date.now() - 30 * 86_400_000).toISOString();
const old = new Date(Date.now() - 900 * 86_400_000).toISOString();
const quality = { credibility: "HIGH", applicability: "MEDIUM", depth: "LOW", relevance: "HIGH", rationale: "Primary source" };

describe("EvidenceExplorer", () => {
  it("shows loading, then an empty state", async () => {
    stubApi({ "/evidence": [], "/opportunities": [] });
    renderPage();
    expect(screen.getByText(/loading evidence/i)).toBeInTheDocument();
    expect(await screen.findByText(/no evidence recorded yet/i)).toBeInTheDocument();
  });

  it("shows an error when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load evidence/i);
  });

  it("lists sources as cards with a text type tag and filters by type", async () => {
    stubApi({
      "/evidence": [
        { id: "e1", claim: "Volume is rising", type: "FACT", capturedAt: recent, opportunity: opp },
        { id: "e2", claim: "Staff may resist", type: "ASSUMPTION", capturedAt: recent, opportunity: opp },
      ],
      "/opportunities": [opp],
    });
    renderPage();
    const list = await screen.findByRole("list", { name: "Evidence sources" });
    expect(within(list).getAllByText("[FACT]").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "FACT" } });
    expect(within(list).queryByText("Staff may resist")).not.toBeInTheDocument();
    expect(within(list).getByText("Volume is rising")).toBeInTheDocument();
  });

  it("shows the selected source's findings, quality per criterion and recency from its date", async () => {
    stubApi({
      "/evidence": [
        { id: "e1", claim: "Volume is rising", type: "FACT", excerpt: "Up 20% year on year", source: "Annual report", capturedAt: old, quality, qualityModel: "Fusion", qualityAt: "2026-10-06T10:00:00Z", opportunity: opp },
        { id: "e2", claim: "Staff may resist", type: "ASSUMPTION", capturedAt: recent, opportunity: opp },
      ],
      "/opportunities": [opp],
    });
    renderPage();

    const detail = await screen.findByRole("region", { name: "Evidence detail" });
    expect(within(detail).getByText("Up 20% year on year")).toBeInTheDocument();
    expect(within(detail).getByText("Source credibility").closest("tr")).toHaveTextContent("High");
    expect(within(detail).getByText("Data depth").closest("tr")).toHaveTextContent("Low");
    // 900 days old is outside the two-year window.
    expect(within(detail).getByText("Recency").closest("tr")).toHaveTextContent("Low");
    expect(within(detail).getByText(/AI assessment · Fusion/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Staff may resist/ }));
    const second = screen.getByRole("region", { name: "Evidence detail" });
    expect(within(second).getByText("No excerpt recorded for this source.")).toBeInTheDocument();
    expect(within(second).getByText("Source credibility").closest("tr")).toHaveTextContent("Not scored");
    expect(within(second).getByText("Recency").closest("tr")).toHaveTextContent("High");
  });

  it("scores unscored evidence and shows the result, or the server's reason when it cannot", async () => {
    let calls = 0;
    stubApi({
      "/evidence": [{ id: "e1", claim: "Volume is rising", type: "FACT", capturedAt: recent, opportunity: opp }],
      "/opportunities/o1/evidence/quality": () => {
        calls += 1;
        return calls === 1
          ? reply(503, { error: { code: "AI_NOT_CONFIGURED", message: "AI backend is not configured" } })
          : reply(200, { scored: 1, evidence: [{ id: "e1", quality, qualityModel: "Fusion", qualityAt: "2026-10-06T10:00:00Z" }] });
      },
      "/opportunities": [opp],
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Score evidence quality" }));
    expect(await screen.findByText(/AI backend is not configured/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Score evidence quality" }));
    const detail = screen.getByRole("region", { name: "Evidence detail" });
    expect(await within(detail).findByText(/AI assessment · Fusion/)).toBeInTheDocument();
    expect(within(detail).getByText("Source credibility").closest("tr")).toHaveTextContent("High");
    expect(screen.queryByRole("button", { name: "Score evidence quality" })).toBeNull();
  });

  it("adds evidence against a chosen opportunity", async () => {
    let body: Record<string, unknown> = {};
    stubApi({
      "/evidence": [{ id: "e1", claim: "Existing", type: "FACT", capturedAt: recent, opportunity: opp }],
      "/opportunities/o1/evidence": (init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return reply(201, { id: "e9", claim: "New claim", type: "INFERENCE", excerpt: "Findings", capturedAt: recent });
      },
      "/opportunities": [opp],
    });
    renderPage();

    await screen.findByRole("list", { name: "Evidence sources" });
    const add = await screen.findByRole("button", { name: "Add evidence" });
    await vi.waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    fireEvent.change(screen.getByLabelText("Opportunity"), { target: { value: "o1" } });
    fireEvent.change(screen.getByLabelText("Claim"), { target: { value: "New claim" } });
    fireEvent.change(screen.getByLabelText("Evidence type"), { target: { value: "INFERENCE" } });
    fireEvent.change(screen.getByLabelText("Key findings"), { target: { value: "Findings" } });
    fireEvent.click(screen.getByRole("button", { name: "Save evidence" }));

    expect(await screen.findByText("Evidence added.")).toBeInTheDocument();
    expect(body).toMatchObject({ claim: "New claim", type: "INFERENCE", excerpt: "Findings" });
    expect(within(screen.getByRole("list", { name: "Evidence sources" })).getByText("New claim")).toBeInTheDocument();
  });
});
