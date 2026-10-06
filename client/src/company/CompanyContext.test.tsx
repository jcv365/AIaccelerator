import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CompanyProvider, useCompany, useCompanyPath } from "./CompanyContext";

const STORAGE_KEY = "aiaccelerator_company";

const maersk = { id: "c1", name: "Maersk", website: null, opportunityCount: 10 };
const acme = { id: "c2", name: "Acme", website: null, opportunityCount: 0 };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function stubApi(handlers: Record<string, (init?: RequestInit) => unknown>) {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url.replace(/^\/api/, "")}`;
    const handler = handlers[key];
    if (!handler) return Promise.resolve(jsonResponse({}, 404));
    return Promise.resolve(handler(init));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function Probe() {
  const c = useCompany();
  const path = useCompanyPath("/opportunities");
  return (
    <div>
      <div data-testid="ready">{String(c.ready)}</div>
      <div data-testid="scoped">{String(c.scoped)}</div>
      <div data-testid="current">{c.current?.name ?? "none"}</div>
      <div data-testid="count">{c.companies.length}</div>
      <div data-testid="path">{String(path)}</div>
      <button onClick={() => c.select("c2")}>pick-acme</button>
      <button onClick={() => void c.createCompany({ name: "Newco", website: "newco.com" }).then((r) => ((window as unknown as Record<string, unknown>).__result = r))}>create</button>
      <button onClick={() => void c.createCompany({ name: "MAERSK" }).then((r) => ((window as unknown as Record<string, unknown>).__result = r))}>create-dup</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  (window as unknown as Record<string, unknown>).__result = undefined;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CompanyProvider", () => {
  it("loads the companies and selects the first when nothing was remembered", async () => {
    stubApi({ "GET /companies": () => jsonResponse([maersk, acme]) });
    render(<CompanyProvider><Probe /></CompanyProvider>);

    expect(screen.getByTestId("ready")).toHaveTextContent("false");
    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("true"));
    expect(screen.getByTestId("current")).toHaveTextContent("Maersk");
    expect(screen.getByTestId("count")).toHaveTextContent("2");
    expect(screen.getByTestId("scoped")).toHaveTextContent("true");
  });

  it("remembers the selection across reloads, and falls back to the first if the remembered company is gone", async () => {
    stubApi({ "GET /companies": () => jsonResponse([maersk, acme]) });
    const first = render(<CompanyProvider><Probe /></CompanyProvider>);
    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("true"));
    fireEvent.click(screen.getByText("pick-acme"));
    expect(screen.getByTestId("current")).toHaveTextContent("Acme");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("c2");
    first.unmount();

    render(<CompanyProvider><Probe /></CompanyProvider>);
    await waitFor(() => expect(screen.getByTestId("current")).toHaveTextContent("Acme"));
    cleanup();

    localStorage.setItem(STORAGE_KEY, "deleted-company");
    render(<CompanyProvider><Probe /></CompanyProvider>);
    await waitFor(() => expect(screen.getByTestId("current")).toHaveTextContent("Maersk"));
  });

  it("has no current company (not the made-up one) when there are none yet", async () => {
    stubApi({ "GET /companies": () => jsonResponse([]) });
    render(<CompanyProvider><Probe /></CompanyProvider>);
    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("true"));
    expect(screen.getByTestId("current")).toHaveTextContent("none");
    expect(screen.getByTestId("path")).toHaveTextContent("null");
  });

  it("creates a company, then selects it", async () => {
    let list: Array<{ id: string; name: string; website: string | null; opportunityCount: number }> = [maersk];
    stubApi({
      "GET /companies": () => jsonResponse(list),
      "POST /companies": (init) => {
        expect(JSON.parse(String(init?.body))).toEqual({ name: "Newco", website: "newco.com" });
        const created = { id: "c3", name: "Newco", website: "https://newco.com", opportunityCount: 0 };
        list = [maersk, created];
        return jsonResponse({ created: true, company: created }, 201);
      },
    });
    render(<CompanyProvider><Probe /></CompanyProvider>);
    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("true"));

    fireEvent.click(screen.getByText("create"));
    await waitFor(() => expect(screen.getByTestId("current")).toHaveTextContent("Newco"));
    expect((window as unknown as Record<string, { created: boolean }>).__result.created).toBe(true);
  });

  it("selects the existing company when the name is a duplicate", async () => {
    stubApi({
      "GET /companies": () => jsonResponse([maersk, acme]),
      "POST /companies": () => jsonResponse({ created: false, company: { id: "c1", name: "Maersk", website: null } }),
    });
    render(<CompanyProvider><Probe /></CompanyProvider>);
    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("true"));
    fireEvent.click(screen.getByText("pick-acme"));
    expect(screen.getByTestId("current")).toHaveTextContent("Acme");

    fireEvent.click(screen.getByText("create-dup"));
    await waitFor(() => expect(screen.getByTestId("current")).toHaveTextContent("Maersk"));
    expect((window as unknown as Record<string, { created: boolean }>).__result.created).toBe(false);
  });

  it("surfaces the server's message when creating fails", async () => {
    stubApi({
      "GET /companies": () => jsonResponse([maersk]),
      "POST /companies": () => jsonResponse({ error: { code: "VALIDATION_ERROR", message: "name is required" } }, 400),
    });
    let caught = "";
    function Failing() {
      const c = useCompany();
      return <button onClick={() => c.createCompany({ name: "" }).catch((e: Error) => (caught = e.message))}>go</button>;
    }
    render(<CompanyProvider><Failing /></CompanyProvider>);
    await act(async () => {
      fireEvent.click(await screen.findByText("go"));
    });
    await waitFor(() => expect(caught).toBe("name is required"));
  });
});

describe("useCompanyPath", () => {
  it("is undefined until the companies have loaded, then adds the selected company", async () => {
    stubApi({ "GET /companies": () => jsonResponse([maersk]) });
    render(<CompanyProvider><Probe /></CompanyProvider>);
    expect(screen.getByTestId("path")).toHaveTextContent("undefined");
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/opportunities?companyId=c1"));
  });

  it("changes with the selected company", async () => {
    stubApi({ "GET /companies": () => jsonResponse([maersk, acme]) });
    render(<CompanyProvider><Probe /></CompanyProvider>);
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("companyId=c1"));
    fireEvent.click(screen.getByText("pick-acme"));
    expect(screen.getByTestId("path")).toHaveTextContent("companyId=c2");
  });

  it("without a provider (isolated pages, older tests) leaves the path unfiltered", () => {
    render(<Probe />);
    expect(screen.getByTestId("scoped")).toHaveTextContent("false");
    expect(screen.getByTestId("path")).toHaveTextContent("/opportunities");
    expect(screen.getByTestId("path")).not.toHaveTextContent("companyId");
  });
});
