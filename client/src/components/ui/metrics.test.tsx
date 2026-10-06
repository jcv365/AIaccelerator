import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ProgressBar, BarList, PriorityBadge, Avatars, AiAssessmentNote, Pagination } from "./index";

describe("ProgressBar", () => {
  it("exposes its value and name to assistive tech and clamps out-of-range values", () => {
    const { rerender } = render(<ProgressBar percent={40} label="Days elapsed" />);
    expect(screen.getByRole("progressbar", { name: "Days elapsed" })).toHaveAttribute("aria-valuenow", "40");
    rerender(<ProgressBar percent={250} label="Days elapsed" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    rerender(<ProgressBar percent={Number.NaN} label="Days elapsed" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});

describe("BarList", () => {
  it("shows every row's number as text, scaling bars to the largest value", () => {
    const { container } = render(
      <BarList caption="Value buckets" items={[{ label: "High value", value: 8 }, { label: "Quick wins", value: 4, display: "4 items" }]} />,
    );
    expect(screen.getByRole("list", { name: "Value buckets" })).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("4 items")).toBeInTheDocument();
    const fills = container.querySelectorAll<HTMLElement>(".bar-list__fill");
    expect(fills[0].style.width).toBe("100%");
    expect(fills[1].style.width).toBe("50%");
  });
});

describe("PriorityBadge", () => {
  it("labels a priority in words and says so when none is set", () => {
    const { rerender } = render(<PriorityBadge priority="HIGH" />);
    expect(screen.getByText("High")).toBeInTheDocument();
    rerender(<PriorityBadge priority={null} />);
    expect(screen.getByText("Not set")).toBeInTheDocument();
  });
});

describe("Avatars", () => {
  it("shows initials, collapses extras and names the full team for assistive tech", () => {
    render(<Avatars names={["Ann Lee", "Bo Chen", "Cy Dunn", "Di Evans"]} />);
    expect(screen.getByRole("img", { name: "Team: Ann Lee, Bo Chen, Cy Dunn, Di Evans" })).toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("says so when no team is assigned", () => {
    render(<Avatars names={[]} />);
    expect(screen.getByText("No team assigned")).toBeInTheDocument();
  });
});

describe("AiAssessmentNote", () => {
  it("attributes the model and date and puts the rationale behind a disclosure as plain text", () => {
    render(<AiAssessmentNote model="Fusion" createdAt="2026-10-06T10:00:00Z" rationale="<b>bold</b> basis" />);
    expect(screen.getByText(/AI assessment · Fusion/)).toBeInTheDocument();
    expect(screen.getByText("Why")).toBeInTheDocument();
    // Rendered as text, not HTML.
    expect(screen.getByText("<b>bold</b> basis")).toBeInTheDocument();
  });
});

describe("Pagination", () => {
  it("renders nothing when everything fits on one page", () => {
    const { container } = render(<Pagination page={1} pageSize={10} total={7} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("summarises the range and moves between pages, disabling the ends", () => {
    const onPageChange = vi.fn();
    const { rerender } = render(<Pagination page={1} pageSize={10} total={32} onPageChange={onPageChange} />);
    expect(screen.getByText("Showing 1–10 of 32")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    rerender(<Pagination page={4} pageSize={10} total={32} onPageChange={onPageChange} />);
    expect(screen.getByText("Showing 31–32 of 32")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
