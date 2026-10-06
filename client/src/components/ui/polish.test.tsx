import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom";
import { PageHeader, Select, EvidenceTag, ReportPanel, Tabs, DataTable } from "./index";
import { AppShell } from "../app/AppShell";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PageHeader", () => {
  it("renders the title as the page h1 with an optional description and actions", () => {
    render(<PageHeader title="Evidence" description="All claims" actions={<button>Add</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Evidence" })).toBeInTheDocument();
    expect(screen.getByText("All claims")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("omits the description and actions when not given", () => {
    const { container } = render(<PageHeader title="Only title" />);
    expect(container.querySelector(".page-header__desc")).toBeNull();
    expect(container.querySelector(".page-header__actions")).toBeNull();
  });
});

describe("Select", () => {
  it("associates its label with the native select", () => {
    render(
      <Select label="Type" defaultValue="B">
        <option value="A">A</option>
        <option value="B">B</option>
      </Select>,
    );
    expect(screen.getByLabelText("Type")).toHaveValue("B");
  });
});

describe("EvidenceTag", () => {
  it("always shows the type as bracketed text, not colour alone", () => {
    render(<EvidenceTag type="AI_HYPOTHESIS" />);
    const tag = screen.getByText("[AI_HYPOTHESIS]");
    expect(tag).toHaveClass("evidence-tag--ai_hypothesis");
  });
});

describe("Tabs", () => {
  it("shows an optional count after the label", () => {
    render(
      <Tabs
        items={[
          { id: "a", label: "All", count: 3 },
          { id: "b", label: "Done" },
        ]}
        activeId="a"
        onChange={() => {}}
        aria-label="Filter"
      />,
    );
    expect(screen.getByRole("tab", { name: "All 3" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Done" })).toBeInTheDocument();
  });
});

describe("DataTable", () => {
  it("wraps the table so a wide table scrolls inside its card instead of widening the page", () => {
    const { container } = render(
      <DataTable
        columns={[{ key: "n", header: "Name", render: (r: { n: string }) => r.n }]}
        rows={[{ n: "x" }]}
        getRowKey={(r) => r.n}
      />,
    );
    expect(container.querySelector(".data-table-wrap > table.data-table")).not.toBeNull();
  });
});

describe("ReportPanel", () => {
  it("splits the report into paragraphs and shows the title", () => {
    render(<ReportPanel title="Opp A" meta="Generated report" text={"First paragraph.\n\nSecond paragraph."} />);
    expect(screen.getByText("Opp A")).toBeInTheDocument();
    expect(screen.getByText("First paragraph.")).toBeInTheDocument();
    expect(screen.getByText("Second paragraph.")).toBeInTheDocument();
  });

  it("copies the full text and confirms", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ReportPanel title="Opp A" text="Body text" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy text" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith("Body text");
  });

  it("says so when copying is not possible", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<ReportPanel title="Opp A" text="Body text" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy text" }));
    expect(await screen.findByRole("button", { name: "Copy failed" })).toBeInTheDocument();
  });
});

describe("AppShell phone menu", () => {
  it("toggles the navigation panel from the Menu button and closes it after following a link", () => {
    // The shell loads the company list as well as the health probe, so answer each with its own shape.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => (String(url).includes("/companies") ? [] : { status: "ok" }),
      })),
    );
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <AppShell onLogout={() => {}}>
          <p>content</p>
        </AppShell>
      </MemoryRouter>,
    );
    const toggle = screen.getByRole("button", { name: "Menu" });
    const panel = document.getElementById("app-sidebar-panel")!;
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).not.toHaveClass("app-sidebar__panel--open");

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Close" })).toHaveAttribute("aria-expanded", "true");
    expect(panel).toHaveClass("app-sidebar__panel--open");

    fireEvent.click(screen.getByRole("link", { name: /evidence explorer/i }));
    expect(screen.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
    expect(panel).not.toHaveClass("app-sidebar__panel--open");
  });
});
