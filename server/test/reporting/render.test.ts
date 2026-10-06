import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import { renderDeliverables, slugify, type RenderInput, type RenderedFile } from "../../src/reporting/render/index.js";
import { makeFacts, makeValidContent } from "./fixtures.js";

const facts = makeFacts();

function input(over: Partial<RenderInput["meta"]> = {}): RenderInput {
  return {
    content: makeValidContent(),
    sources: facts.sources,
    titles: Object.fromEntries(facts.opportunities.map((o) => [o.id, o.title])),
    meta: { version: 3, status: "DRAFT", generatedAt: new Date("2026-10-06T10:00:00Z"), author: "DotCloud Consulting", ...over },
  };
}

async function entries(file: RenderedFile): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(file.content);
  const out: Record<string, string> = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir && /\.(xml|rels)$/.test(name)) out[name] = await entry.async("string");
  }
  return out;
}
const allText = (e: Record<string, string>, pattern: RegExp) =>
  Object.entries(e)
    .filter(([name]) => pattern.test(name))
    .map(([, xml]) => xml)
    .join("\n");

describe("renderDeliverables", () => {
  let draft: RenderedFile[];
  beforeAll(async () => {
    draft = await renderDeliverables(input());
  });
  const pick = (files: RenderedFile[], audience: string, format: string) => files.find((f) => f.audience === audience && f.format === format)!;

  it("produces the four files, with safe versioned names", () => {
    expect(draft.map((f) => f.filename)).toEqual([
      "acme-shipping-v3-c-level-deck.pptx",
      "acme-shipping-v3-c-level-proposal.docx",
      "acme-shipping-v3-technical-deck.pptx",
      "acme-shipping-v3-technical-proposal.docx",
    ]);
    for (const f of draft) expect(f.content.subarray(0, 2).toString()).toBe("PK"); // a zip container
  });

  it("builds decks with a cover, body slides, speaker notes and file properties", async () => {
    const e = await entries(pick(draft, "C_LEVEL", "PPTX"));
    const slides = Object.keys(e).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    const notes = Object.keys(e).filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
    expect(slides.length).toBeGreaterThanOrEqual(12);
    expect(notes.length).toBeGreaterThanOrEqual(slides.length - 1); // every slide except the cover has notes
    const core = e["docProps/core.xml"];
    expect(core).toContain("Acme Shipping");
    expect(core).toContain("DotCloud Consulting");
    expect(allText(e, /^ppt\/slides\/slide1\.xml$/)).toContain("Acme Shipping: AI opportunity assessment");
  });

  it("marks every body slide as a draft in the footer and cites sources", async () => {
    const e = await entries(pick(draft, "C_LEVEL", "PPTX"));
    expect(allText(e, /^ppt\/slideLayouts\//)).toContain("DRAFT: AI-generated, verify before sharing");
    expect(allText(e, /^ppt\/slideLayouts\//)).toContain("Confidential");
    const slidesXml = allText(e, /^ppt\/slides\/slide\d+\.xml$/);
    expect(slidesXml).toContain("[S2]");
    expect(slidesXml).toContain("Source register");
  });

  it("replaces the draft mark with the approval line once approved", async () => {
    const approved = await renderDeliverables(input({ status: "APPROVED", approvedBy: "Jane Doe", approvedAt: new Date("2026-10-07T09:00:00Z") }));
    for (const file of approved) {
      const e = await entries(file);
      const xml = allText(e, /\.xml$/);
      expect(xml, file.filename).toContain("Approved by Jane Doe on 2026-10-07");
      expect(xml, file.filename).not.toContain("AI-generated, verify before sharing");
    }
  });

  it("includes a native chart with alt text in the decks", async () => {
    const e = await entries(pick(draft, "TECHNICAL", "PPTX"));
    expect(Object.keys(e).some((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))).toBe(true);
    expect(allText(e, /^ppt\/slides\/slide\d+\.xml$/)).toMatch(/descr="Stacked bar chart of evidence/);
  });

  it("gives the technical deck architecture, data and proof-of-value slides that the C-level deck omits", async () => {
    const tech = allText(await entries(pick(draft, "TECHNICAL", "PPTX")), /^ppt\/slides\/slide\d+\.xml$/);
    const exec = allText(await entries(pick(draft, "C_LEVEL", "PPTX")), /^ppt\/slides\/slide\d+\.xml$/);
    for (const text of ["Data sources", "Ingestion and storage", "How we would prove it works before scaling", "What data the work needs"]) {
      expect(tech).toContain(text);
      expect(exec).not.toContain(text);
    }
  });

  it("builds documents with document control, a linked contents list, appendices and a page-numbered footer", async () => {
    const e = await entries(pick(draft, "C_LEVEL", "DOCX"));
    const doc = e["word/document.xml"];
    for (const text of ["Document control", "Contents", "1. Executive summary", "Appendix A. Source register", "Appendix B. Glossary", "S1"]) {
      expect(doc, text).toContain(text);
    }
    expect(doc).toContain("w:anchor="); // contents entries link to their headings
    expect(doc).not.toContain("TOC \\"); // no field that is empty until a word processor refreshes it
    const footer = allText(e, /^word\/footer\d*\.xml$/);
    expect(footer).toContain("DRAFT: AI-generated, verify before sharing");
    expect(footer).toContain("Confidential");
    expect(footer).toMatch(/PAGE/);
    expect(footer).toMatch(/NUMPAGES/);
    expect(e["docProps/core.xml"]).toContain("DotCloud Consulting");
  });

  it("gives the technical proposal its architecture, data, integration, security and proof-of-value sections", async () => {
    const tech = (await entries(pick(draft, "TECHNICAL", "DOCX")))["word/document.xml"];
    const exec = (await entries(pick(draft, "C_LEVEL", "DOCX")))["word/document.xml"];
    for (const text of ["Architecture options", "Data requirements", "Integration", "Security and privacy", "Proof of value"]) {
      expect(tech, text).toContain(text);
    }
    expect(exec).not.toContain("Architecture options");
    expect(exec).toContain("Company context and priorities");
  });

  it("renders the same wording twice from the same input (reproducible)", async () => {
    const again = await renderDeliverables(input());
    const a = (await entries(pick(draft, "C_LEVEL", "DOCX")))["word/document.xml"];
    const b = (await entries(pick(again, "C_LEVEL", "DOCX")))["word/document.xml"];
    expect(a.replace(/w:id="\d+"/g, "")).toBe(b.replace(/w:id="\d+"/g, ""));
  });

  it("copes with no public sources and with a single opportunity", async () => {
    const one = input();
    one.sources = [];
    one.content = { ...one.content, opportunities: [{ ...one.content.opportunities[0], sourceIds: [] }], priorities: [{ priority: "Cut cost", sourceIds: [] }] };
    const files = await renderDeliverables(one);
    expect(files).toHaveLength(4);
    const doc = (await entries(pick(files, "C_LEVEL", "DOCX")))["word/document.xml"];
    expect(doc).toContain("No public sources were found");
  });
});

describe("slugify", () => {
  it("makes names safe for filenames", () => {
    expect(slugify("A.P. Møller – Maersk")).toBe("a-p-m-ller-maersk");
    expect(slugify("Café Zoë")).toBe("cafe-zoe");
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
    expect(slugify("日本")).toBe("company");
    expect(slugify("x".repeat(100)).length).toBe(40);
  });
});
