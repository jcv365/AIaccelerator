import { describe, it, expect } from "vitest";
import { buildSourceRegister } from "../../src/reporting/sources.js";

describe("buildSourceRegister", () => {
  it("numbers distinct sources S1, S2... in the order first seen", () => {
    const { sources, idFor } = buildSourceRegister([
      { source: "https://www.maersk.com/about" },
      { source: "https://www.sec.gov/Archives/edgar/data/123/10k.htm" },
    ]);
    expect(sources.map((s) => s.id)).toEqual(["S1", "S2"]);
    expect(idFor("https://www.sec.gov/Archives/edgar/data/123/10k.htm")).toBe("S2");
  });

  it("treats the same page written differently (www, trailing slash, fragment, case of host) as one source", () => {
    const { sources, idFor } = buildSourceRegister([
      { source: "https://www.Maersk.com/about/" },
      { source: "https://maersk.com/about#team" },
      { source: "HTTPS://MAERSK.COM/about" },
    ]);
    expect(sources).toHaveLength(1);
    expect(idFor("https://maersk.com/about/")).toBe("S1");
  });

  it("keeps different query strings and different paths apart", () => {
    const { sources } = buildSourceRegister([
      { source: "https://example.com/report?year=2024" },
      { source: "https://example.com/report?year=2025" },
      { source: "https://example.com/other" },
    ]);
    expect(sources).toHaveLength(3);
  });

  it("classifies filings, social pages and ordinary web pages", () => {
    const { sources } = buildSourceRegister([
      { source: "https://www.sec.gov/cgi-bin/browse-edgar" },
      { source: "https://www.linkedin.com/company/maersk" },
      { source: "https://x.com/maersk" },
      { source: "https://www.reuters.com/article/1" },
    ]);
    expect(sources.map((s) => s.kind)).toEqual(["SEC filing", "Social media", "Social media", "Web"]);
  });

  it("registers a non-URL reference (such as a document name) as a document, once", () => {
    const { sources, idFor } = buildSourceRegister([{ source: "Annual Report 2025, p. 12" }, { source: "annual report 2025, p. 12" }]);
    expect(sources).toEqual([{ id: "S1", kind: "Document", url: null, title: "Annual Report 2025, p. 12" }]);
    expect(idFor("ANNUAL REPORT 2025, P. 12")).toBe("S1");
  });

  it("ignores empty and missing sources and returns undefined for them", () => {
    const { sources, idFor } = buildSourceRegister([{ source: null }, { source: undefined }, { source: "   " }]);
    expect(sources).toEqual([]);
    expect(idFor(null)).toBeUndefined();
    expect(idFor("never seen")).toBeUndefined();
  });

  it("gives web sources a readable title (the host without www) and keeps the URL", () => {
    const { sources } = buildSourceRegister([{ source: "https://www.maersk.com/about" }]);
    expect(sources[0]).toMatchObject({ url: "https://www.maersk.com/about", title: "maersk.com", kind: "Web" });
  });
});
