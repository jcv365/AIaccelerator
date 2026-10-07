import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("../api", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import StartAnalysis from "./StartAnalysis";
import { api } from "../api";

const STORAGE_KEY = "startAnalysis.job";

function submit(company: string) {
  const input = screen.getByLabelText(/company name/i);
  fireEvent.change(input, { target: { value: company } });
  const form = input.closest("form");
  if (!form) throw new Error("Form not found");
  form.noValidate = true;
  fireEvent.submit(form);
}

const running = { id: "job1", status: "RUNNING", opportunitiesFound: 0, error: null };

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StartAnalysis", () => {
  it("renders the heading and shows NO DATA for all six gauges (no scoring backend yet)", () => {
    render(<StartAnalysis />);
    expect(screen.getByRole("heading", { name: /start analysis/i })).toBeInTheDocument();
    expect(screen.getAllByText("NO DATA")).toHaveLength(6);
  });

  it("shows an inline error when the company name is blank on submit", async () => {
    render(<StartAnalysis />);
    submit("");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/company name is required/i));
    expect(api.post).not.toHaveBeenCalled();
  });

  it("starts a job, shows progress while it runs, then reports success and never shows fake gauge values", async () => {
    vi.mocked(api.post).mockResolvedValue({ jobId: "job1", status: "QUEUED" });
    // Hold the job in RUNNING until the progress text has been seen, so the check cannot race the poll timer.
    let finished = false;
    vi.mocked(api.get).mockImplementation(async () =>
      finished ? { id: "job1", status: "SUCCEEDED", opportunitiesFound: 3, error: null } : running
    );

    render(<StartAnalysis pollIntervalMs={10} />);
    submit("Acme Manufacturing");

    expect(await screen.findByText(/researching acme manufacturing/i)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/opportunities/analyze", { companyName: "Acme Manufacturing" });
    finished = true;

    expect(await screen.findByText(/found 3 opportunities/i)).toBeInTheDocument();
    expect(screen.getByText(/View in Opportunity Portfolio/i)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/opportunities/analyze/job1");
    expect(screen.getAllByText("NO DATA")).toHaveLength(6);
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("shows the server's message when the job fails", async () => {
    vi.mocked(api.post).mockResolvedValue({ jobId: "job1", status: "QUEUED" });
    vi.mocked(api.get).mockResolvedValue({
      id: "job1",
      status: "FAILED",
      opportunitiesFound: 0,
      error: { code: "AI_BUSY", message: "Conclave is busy with another session" },
    });

    render(<StartAnalysis pollIntervalMs={10} />);
    submit("Acme");

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/conclave is busy/i));
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("shows an inline error when starting the job fails (e.g. another analysis is running)", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Another analysis is already running."));
    render(<StartAnalysis />);
    submit("Acme");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/already running/i));
    expect(api.get).not.toHaveBeenCalled();
  });

  it("resumes polling a job stored in sessionStorage after leaving and returning to the page", async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ jobId: "job9", companyName: "Maersk", startedAtMs: Date.now() - 90_000 })
    );
    vi.mocked(api.get).mockResolvedValue({ id: "job9", status: "SUCCEEDED", opportunitiesFound: 1, error: null });

    render(<StartAnalysis pollIntervalMs={10} />);

    expect(await screen.findByText(/found 1 opportunity/i)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/opportunities/analyze/job9");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("stops and shows an error if the stored job no longer exists", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId: "gone", companyName: "Maersk", startedAtMs: Date.now() }));
    vi.mocked(api.get).mockRejectedValue(new Error("Analysis job not found"));

    render(<StartAnalysis pollIntervalMs={10} />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/not found/i));
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("StartAnalysis with queued and staged jobs", () => {
  function resumeJob() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId: "job1", companyName: "Cassava", startedAtMs: Date.now() }));
  }

  it("tells the user the analysis is waiting for the Council, with its queue position", async () => {
    resumeJob();
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "job1", status: "QUEUED", opportunitiesFound: 0, error: null, queuePosition: 2, stage: "queued",
    });
    render(<StartAnalysis pollIntervalMs={60_000} />);
    await waitFor(() => expect(screen.getByText(/waiting for the council/i)).toBeInTheDocument());
    expect(screen.getByText(/position 2/i)).toBeInTheDocument();
  });

  it("shows the current stage of a running analysis", async () => {
    resumeJob();
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "job1", status: "RUNNING", opportunitiesFound: 0, error: null, stage: "critiques", queuePosition: null,
    });
    render(<StartAnalysis pollIntervalMs={60_000} />);
    await waitFor(() => expect(screen.getByText(/critiques/i)).toBeInTheDocument());
  });

  it("still shows the plain researching message before the first poll answers", () => {
    resumeJob();
    (api.get as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<StartAnalysis pollIntervalMs={60_000} />);
    expect(screen.getByText(/researching cassava/i)).toBeInTheDocument();
  });
});
