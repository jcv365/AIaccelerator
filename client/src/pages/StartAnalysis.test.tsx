import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock the api module
vi.mock("../api", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import StartAnalysis from "./StartAnalysis";
import { api } from "../api";

afterEach(() => {
  vi.clearAllMocks();
});

describe("StartAnalysis", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockResolvedValue({ opportunitiesFound: 3 });
  });

  it("shows NO DATA for all six gauges before any analysis runs", () => {
    render(<StartAnalysis />);

    expect(screen.getAllByText("NO DATA")).toHaveLength(6);
    expect(screen.getByText("Evidence Strength")).toBeInTheDocument();
    expect(screen.getByText("Risk")).toBeInTheDocument();
  });

  it("renders the component with heading", () => {
    render(<StartAnalysis />);
    expect(screen.getByRole("heading", { name: /start analysis/i })).toBeInTheDocument();
  });

  it("streams the three evidence gauges and shows a success message with opportunity count", async () => {
    render(<StartAnalysis />);

    const companyNameInput = screen.getByLabelText(/company name/i);
    fireEvent.change(companyNameInput, { target: { value: "Acme Manufacturing" } });
    
    const form = companyNameInput.closest('form');
    if (!form) throw new Error("Form not found");
    form.noValidate = true;
    fireEvent.submit(form);

    // Wait for the simulated streaming to complete (3 gauges * 500ms each + API call)
    // The success alert has variant="info" which renders with role="status"
    // Use getByText to find the specific success message
    await waitFor(() => expect(screen.getByText(/Analysis complete — found/i)).toBeInTheDocument(), { timeout: 20000 });
    
    // The gauges should show simulated values (50-80%)
    const gaugeReadings = screen.getAllByText(/\d+%/);
    expect(gaugeReadings.length).toBeGreaterThanOrEqual(3);

    // Risk/Feasibility/Value are never populated (no decision-scoring backend)
    expect(screen.getAllByText("NO DATA")).toHaveLength(3);

    expect(await screen.findByText(/found 3 opportunities/i)).toBeInTheDocument();
    expect(screen.getByText(/View in Opportunity Portfolio/i)).toBeInTheDocument();
  });

  it("shows an inline error when the company name is blank on submit", async () => {
    render(<StartAnalysis />);

    // Explicitly ensure companyName is empty
    const companyNameInput = screen.getByLabelText(/company name/i);
    fireEvent.input(companyNameInput, { target: { value: "" } });
    
    // Get the form by finding the closest form element from the input
    const form = companyNameInput.closest('form');
    if (!form) throw new Error("Form not found");
    
    // Disable validation
    form.noValidate = true;
    
    fireEvent.submit(form);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/company name is required/i));
  });

  it("shows an inline error when the API call fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Network error"));
    
    render(<StartAnalysis />);

    const companyNameInput = screen.getByLabelText(/company name/i);
    fireEvent.change(companyNameInput, { target: { value: "Acme Manufacturing" } });
    
    const form = companyNameInput.closest('form');
    if (!form) throw new Error("Form not found");
    form.noValidate = true;
    fireEvent.submit(form);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/network error/i), { timeout: 20000 });
  });
});
