import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("../api", () => ({
  api: { post: vi.fn(), get: vi.fn(), patch: vi.fn() },
}));

const refresh = vi.fn().mockResolvedValue([]);
vi.mock("../company/CompanyContext", () => ({
  useCompany: () => ({ refresh }),
}));

import StartAnalysis from "./StartAnalysis";
import { api } from "../api";

beforeEach(() => {
  sessionStorage.clear();
  refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
