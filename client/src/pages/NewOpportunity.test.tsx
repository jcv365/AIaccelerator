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
});
