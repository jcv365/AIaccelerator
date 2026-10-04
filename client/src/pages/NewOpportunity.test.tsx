import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import NewOpportunity from "./NewOpportunity";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NewOpportunity", () => {
  it("submits the title field to the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "new-id", title: "Fresh idea" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <NewOpportunity />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Fresh idea" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual(expect.objectContaining({ title: "Fresh idea" }));
  });

  it("shows an inline error when the save fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));

    render(
      <MemoryRouter>
        <NewOpportunity />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Fresh idea" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save/i);
  });

  it("shows an inline error when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    render(
      <MemoryRouter>
        <NewOpportunity />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Fresh idea" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
  });
});
