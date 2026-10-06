import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import Portfolio from "./Portfolio";

afterEach(() => {
  vi.restoreAllMocks();
});

const stub = (body: unknown) =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }));

const renderPortfolio = () =>
  render(
    <MemoryRouter>
      <Portfolio />
    </MemoryRouter>
  );

const row = (over: Record<string, unknown>) => ({
  id: "1",
  title: "Opp",
  status: "DISCOVERED",
  category: null,
  estimatedAnnualValue: null,
  priority: null,
  evidenceScore: null,
  latestAssessment: null,
  latestDecision: null,
  ...over,
});

describe("Portfolio", () => {
  it("shows a friendly message and no table when there are no opportunities", async () => {
    stub([]);
    renderPortfolio();
    expect(await screen.findByText(/no opportunities yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an error when the opportunities cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    renderPortfolio();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load opportunities/i);
  });

  it("keeps a link to add an opportunity", async () => {
    stub([]);
    renderPortfolio();
    expect(await screen.findByRole("link", { name: "Add opportunity" })).toHaveAttribute("href", "/app/opportunities/new");
  });

  it("lists value, evidence score, priority and status, saying so where nothing is set", async () => {
    stub([
      row({ id: "1", title: "Routing", category: "Logistics", estimatedAnnualValue: 1_200_000, priority: "HIGH", evidenceScore: 82, status: "QUALIFIED" }),
      row({ id: "2", title: "Forecasting" }),
    ]);
    renderPortfolio();

    const routing = (await screen.findByRole("link", { name: "Routing" })).closest("tr")!;
    expect(routing).toHaveTextContent("Logistics");
    expect(routing).toHaveTextContent("R1.2M");
    expect(routing).toHaveTextContent("82/100");
    expect(routing).toHaveTextContent("High");
    expect(routing).toHaveTextContent("QUALIFIED");

    const forecasting = screen.getByRole("link", { name: "Forecasting" }).closest("tr")!;
    expect(forecasting).toHaveTextContent("Not scored");
    expect(forecasting).toHaveTextContent("Not set");
  });

  it("falls back to the AI assessment for value, category and priority and labels it as an estimate", async () => {
    stub([
      row({
        title: "Chatbot",
        latestAssessment: { category: "Customer service", estimatedAnnualValue: 450_000, priority: "MEDIUM" },
      }),
    ]);
    renderPortfolio();

    const chatbot = (await screen.findByRole("link", { name: "Chatbot" })).closest("tr")!;
    expect(chatbot).toHaveTextContent("Customer service");
    expect(chatbot).toHaveTextContent("R450k");
    expect(chatbot).toHaveTextContent("AI estimate");
    expect(chatbot).toHaveTextContent("Medium");
  });

  it("filters by search, priority and status, and says when nothing matches", async () => {
    stub([
      row({ id: "1", title: "Alpha routing", priority: "HIGH", status: "QUALIFIED" }),
      row({ id: "2", title: "Beta forecasting", priority: "LOW", status: "DISCOVERED" }),
    ]);
    renderPortfolio();
    await screen.findByRole("link", { name: "Alpha routing" });

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "beta" } });
    expect(screen.queryByRole("link", { name: "Alpha routing" })).toBeNull();
    expect(screen.getByRole("link", { name: "Beta forecasting" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "HIGH" } });
    expect(screen.getByRole("link", { name: "Alpha routing" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Beta forecasting" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "DISCOVERED" } });
    expect(screen.getByText(/no opportunities match these filters/i)).toBeInTheDocument();
  });

  it("offers only the categories that exist and filters by one", async () => {
    stub([
      row({ id: "1", title: "A", category: "Logistics" }),
      row({ id: "2", title: "B", category: "Finance" }),
    ]);
    renderPortfolio();
    await screen.findByRole("link", { name: "A" });

    const options = within(screen.getByLabelText("Category")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["All categories", "Finance", "Logistics"]);

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Finance" } });
    expect(screen.queryByRole("link", { name: "A" })).toBeNull();
    expect(screen.getByRole("link", { name: "B" })).toBeInTheDocument();
  });

  it("pages ten rows at a time and numbers rows across pages", async () => {
    stub(Array.from({ length: 12 }, (_, i) => row({ id: String(i), title: `Opp ${i + 1}` })));
    renderPortfolio();

    await waitFor(() => expect(screen.getByText("Showing 1–10 of 12")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Opp 11" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const eleventh = screen.getByRole("link", { name: "Opp 11" }).closest("tr")!;
    expect(within(eleventh).getAllByRole("cell")[0]).toHaveTextContent("11");
  });
});
