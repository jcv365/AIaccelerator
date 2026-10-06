import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("../api", () => ({
  api: { post: vi.fn(), get: vi.fn(), patch: vi.fn() },
}));

const refresh = vi.fn().mockResolvedValue([]);
const state = vi.hoisted(() => ({ current: null as null | { id: string; name: string } }));
vi.mock("../company/CompanyContext", () => ({
  useCompany: () => ({ refresh, current: state.current }),
}));

import StartAnalysis from "./StartAnalysis";
import { api } from "../api";

beforeEach(() => {
  sessionStorage.clear();
  refresh.mockClear();
  state.current = null;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StartAnalysis prefills the selected company", () => {
  it("shows the selected company's name so it never has to be re-typed", () => {
    state.current = { id: "c1", name: "Maersk" };
    render(<StartAnalysis />);
    expect(screen.getByLabelText(/company name/i)).toHaveValue("Maersk");
  });

  it("starts the analysis for the prefilled company without typing anything", async () => {
    state.current = { id: "c1", name: "Maersk" };
    vi.mocked(api.post).mockResolvedValue({ jobId: "job1", status: "QUEUED", companyId: "c1" });
    vi.mocked(api.get).mockResolvedValue({ id: "job1", status: "RUNNING", opportunitiesFound: 0, error: null });

    render(<StartAnalysis pollIntervalMs={10} />);
    const form = screen.getByLabelText(/company name/i).closest("form") as HTMLFormElement;
    form.noValidate = true;
    fireEvent.submit(form);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/opportunities/analyze", { companyName: "Maersk" }));
  });

  it("follows the dropdown when another company is selected or a new one is added", () => {
    state.current = { id: "c1", name: "Maersk" };
    const view = render(<StartAnalysis />);
    expect(screen.getByLabelText(/company name/i)).toHaveValue("Maersk");

    state.current = { id: "c2", name: "Acme Manufacturing" };
    view.rerender(<StartAnalysis />);
    expect(screen.getByLabelText(/company name/i)).toHaveValue("Acme Manufacturing");
  });

  it("fills in once the companies finish loading (the company arrives after the first render)", () => {
    const view = render(<StartAnalysis />);
    expect(screen.getByLabelText(/company name/i)).toHaveValue("");

    state.current = { id: "c1", name: "Maersk" };
    view.rerender(<StartAnalysis />);
    expect(screen.getByLabelText(/company name/i)).toHaveValue("Maersk");
  });

  it("lets the user type a different company to analyse instead", async () => {
    state.current = { id: "c1", name: "Maersk" };
    vi.mocked(api.post).mockResolvedValue({ jobId: "job1", status: "QUEUED", companyId: "c9" });
    vi.mocked(api.get).mockResolvedValue({ id: "job1", status: "RUNNING", opportunitiesFound: 0, error: null });

    render(<StartAnalysis pollIntervalMs={10} />);
    const input = screen.getByLabelText(/company name/i);
    fireEvent.change(input, { target: { value: "Another Co" } });
    expect(input).toHaveValue("Another Co");
    const form = input.closest("form") as HTMLFormElement;
    form.noValidate = true;
    fireEvent.submit(form);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/opportunities/analyze", { companyName: "Another Co" }));
  });

  it("stays empty and still works when there is no company yet", () => {
    render(<StartAnalysis />);
    expect(screen.getByLabelText(/company name/i)).toHaveValue("");
  });
});

describe("StartAnalysis and companies", () => {
  it("selects the company the server created or found for the typed name, as soon as the analysis starts", async () => {
    vi.mocked(api.post).mockResolvedValue({ jobId: "job1", status: "QUEUED", companyId: "co-42" });
    vi.mocked(api.get).mockResolvedValue({ id: "job1", status: "RUNNING", opportunitiesFound: 0, error: null });

    render(<StartAnalysis pollIntervalMs={10} />);
    const input = screen.getByLabelText(/company name/i);
    fireEvent.change(input, { target: { value: "Brand New Co" } });
    const form = input.closest("form") as HTMLFormElement;
    form.noValidate = true;
    fireEvent.submit(form);

    await waitFor(() => expect(refresh).toHaveBeenCalledWith("co-42"));
    expect(api.post).toHaveBeenCalledWith("/opportunities/analyze", { companyName: "Brand New Co" });
  });

  it("does not break when the server response has no companyId (older server)", async () => {
    vi.mocked(api.post).mockResolvedValue({ jobId: "job1", status: "QUEUED" });
    vi.mocked(api.get).mockResolvedValue({ id: "job1", status: "RUNNING", opportunitiesFound: 0, error: null });

    render(<StartAnalysis pollIntervalMs={10} />);
    const input = screen.getByLabelText(/company name/i);
    fireEvent.change(input, { target: { value: "Acme" } });
    const form = input.closest("form") as HTMLFormElement;
    form.noValidate = true;
    fireEvent.submit(form);

    expect(await screen.findByText(/researching acme/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
