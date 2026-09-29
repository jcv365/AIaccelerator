import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "./App";
import { setApiKey } from "./api";

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url.includes("/health")) return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: "ok" }) });
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    })
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("App", () => {
  it("shows the API key prompt when no key is stored", async () => {
    stubFetch();

    render(<App />);

    expect(await screen.findByLabelText("API Key")).toBeInTheDocument();
    expect(screen.queryByText("+ New")).not.toBeInTheDocument();
  });

  it("shows the opportunity list at the root route once a key is present", async () => {
    setApiKey("secret");
    stubFetch();

    render(<App />);

    await waitFor(() => expect(screen.getByText("AI Accelerator")).toBeInTheDocument());
    expect(screen.getByText("+ New")).toBeInTheDocument();
  });

  it("submitting the prompt form reveals the app", async () => {
    stubFetch();

    render(<App />);

    const input = await screen.findByLabelText("API Key");
    fireEvent.change(input, { target: { value: "my-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(screen.getByText("+ New")).toBeInTheDocument());
  });
});
