import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CompanySwitcher } from "./CompanySwitcher";

const companies = [
  { id: "c1", name: "Maersk" },
  { id: "c2", name: "Acme Manufacturing" },
];

function setup(overrides: Partial<React.ComponentProps<typeof CompanySwitcher>> = {}) {
  const onSelect = vi.fn();
  const onCreate = vi.fn().mockResolvedValue({ created: true, name: "New Co" });
  render(<CompanySwitcher companies={companies} currentId="c1" onSelect={onSelect} onCreate={onCreate} {...overrides} />);
  return { onSelect, onCreate };
}

describe("CompanySwitcher", () => {
  it("lists the companies with the current one selected, plus an add option", () => {
    setup();
    const select = screen.getByLabelText(/switch company/i) as HTMLSelectElement;
    expect(select.value).toBe("c1");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Maersk", "Acme Manufacturing", "+ Add company…"]);
  });

  it("selects another company", () => {
    const { onSelect } = setup();
    fireEvent.change(screen.getByLabelText(/switch company/i), { target: { value: "c2" } });
    expect(onSelect).toHaveBeenCalledWith("c2");
  });

  it("opens the add form from the dropdown without selecting anything", () => {
    const { onSelect } = setup();
    fireEvent.change(screen.getByLabelText(/switch company/i), { target: { value: "__add__" } });
    expect(screen.getByRole("dialog", { name: /add a company/i })).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("creates a company from the form and closes it", async () => {
    const { onCreate } = setup();
    fireEvent.change(screen.getByLabelText(/switch company/i), { target: { value: "__add__" } });
    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: "  New Co " } });
    fireEvent.change(screen.getByLabelText(/website/i), { target: { value: "newco.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^add company$/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("New Co", "newco.com"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("says so, and keeps the form until Done, when the company already existed", async () => {
    const onCreate = vi.fn().mockResolvedValue({ created: false, name: "Maersk" });
    setup({ onCreate });
    fireEvent.change(screen.getByLabelText(/switch company/i), { target: { value: "__add__" } });
    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: "MAERSK" } });
    fireEvent.click(screen.getByRole("button", { name: /^add company$/i }));

    expect(await screen.findByText(/“Maersk” already exists, so we selected it/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the server's message and stays open when creating fails", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("website must be a valid public web address, like maersk.com"));
    setup({ onCreate });
    fireEvent.change(screen.getByLabelText(/switch company/i), { target: { value: "__add__" } });
    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: "Bad Co" } });
    fireEvent.click(screen.getByRole("button", { name: /^add company$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/valid public web address/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not call the server for a blank name", async () => {
    const { onCreate } = setup();
    fireEvent.change(screen.getByLabelText(/switch company/i), { target: { value: "__add__" } });
    fireEvent.click(screen.getByRole("button", { name: /^add company$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/name is required/i);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("cancel closes the form", () => {
    setup();
    fireEvent.change(screen.getByLabelText(/switch company/i), { target: { value: "__add__" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("with no companies, offers to add the first one instead of a dropdown", () => {
    setup({ companies: [], currentId: null });
    expect(screen.queryByLabelText(/switch company/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add your first company/i }));
    expect(screen.getByRole("dialog", { name: /add a company/i })).toBeInTheDocument();
  });
});
