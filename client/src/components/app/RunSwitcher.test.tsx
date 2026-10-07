import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { RunSwitcher } from "./RunSwitcher";

const runs = [
  { id: "j2", createdAt: "2026-10-07T11:00:00Z", opportunities: 8 },
  { id: "j1", createdAt: "2026-10-05T09:00:00Z", opportunities: 1 },
];

describe("RunSwitcher", () => {
  it("renders nothing when there is no analysis to choose between", () => {
    const { container } = render(<RunSwitcher runs={[]} runId={null} onSelect={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each run with its date and count, plus all runs together", () => {
    render(<RunSwitcher runs={runs} runId="j2" onSelect={() => {}} />);
    const select = screen.getByLabelText("Switch analysis run") as HTMLSelectElement;
    expect(select.value).toBe("j2");
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels[0]).toMatch(/8 opportunities/);
    expect(labels[1]).toMatch(/1 opportunity$/);
    expect(labels[2]).toBe("All runs together");
  });

  it("reports the chosen run, or null for all runs", () => {
    const onSelect = vi.fn();
    render(<RunSwitcher runs={runs} runId="j2" onSelect={onSelect} />);
    const select = screen.getByLabelText("Switch analysis run");
    fireEvent.change(select, { target: { value: "j1" } });
    expect(onSelect).toHaveBeenLastCalledWith("j1");
    fireEvent.change(select, { target: { value: "__all__" } });
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("shows all runs as selected when no run is chosen", () => {
    render(<RunSwitcher runs={runs} runId={null} onSelect={() => {}} />);
    expect((screen.getByLabelText("Switch analysis run") as HTMLSelectElement).value).toBe("__all__");
  });
});
