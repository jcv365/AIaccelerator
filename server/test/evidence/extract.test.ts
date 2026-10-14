import { describe, it, expect } from "vitest";
import { extractEvidenceText, MAX_TEXT_CHARS } from "../../src/evidence/extract.js";
import { EvidenceError } from "../../src/evidence/errors.js";
import { makeDocx, makePdf, makeXlsx, makeZip, makeZipBomb } from "../helpers/evidenceFixtures.js";

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof EvidenceError) return err.code;
    throw err;
  }
  return "NO_ERROR";
}

describe("extractEvidenceText: plain text", () => {
  it("reads .txt and .md as UTF-8 and drops a BOM", async () => {
    const txt = await extractEvidenceText("notes.txt", Buffer.from("﻿Claims take 12 days.\nBacklog: 340 open."));
    expect(txt).toMatchObject({ kind: "text", truncated: false });
    expect(txt.text).toBe("Claims take 12 days.\nBacklog: 340 open.");
    const md = await extractEvidenceText("README.MD", Buffer.from("# Heading\nBody"));
    expect(md.kind).toBe("text");
    expect(md.text).toContain("Body");
  });

  it("turns CSV rows into pipe-separated lines, including quoted commas", async () => {
    const r = await extractEvidenceText("kpi.csv", Buffer.from('port,teu,note\nDurban,"2,700,000",busy\n'));
    expect(r.kind).toBe("csv");
    expect(r.text).toBe("port | teu | note\nDurban | 2,700,000 | busy");
  });

  it("refuses binary data pretending to be text", async () => {
    expect(await codeOf(extractEvidenceText("a.txt", Buffer.from([0x41, 0x00, 0x42, 0x00])))).toBe("UNSUPPORTED_TYPE");
  });

  it("reports empty text instead of storing nothing", async () => {
    expect(await codeOf(extractEvidenceText("a.txt", Buffer.from("  \n\t ")))).toBe("NO_TEXT");
  });
});

describe("extractEvidenceText: Office and PDF", () => {
  it("reads .docx paragraphs", async () => {
    const r = await extractEvidenceText("claims.docx", await makeDocx(["Claims triage takes 12 days.", "Backlog is 340."]));
    expect(r.kind).toBe("docx");
    expect(r.text).toContain("Claims triage takes 12 days.");
    expect(r.text).toContain("Backlog is 340.");
  });

  it("reads .xlsx sheets as labelled pipe tables", async () => {
    const r = await extractEvidenceText("kpi.xlsx", await makeXlsx("Ports", [["port", "teu"], ["Durban", "2700000"]]));
    expect(r.kind).toBe("xlsx");
    expect(r.text).toContain("Sheet: Ports");
    expect(r.text).toContain("port | teu");
    expect(r.text).toContain("Durban | 2700000");
  });

  it("reads .pdf text", async () => {
    const r = await extractEvidenceText("report.pdf", makePdf("Annual volume grew nine percent"));
    expect(r.kind).toBe("pdf");
    expect(r.text).toContain("Annual volume grew nine percent");
  });

  it("says so when a PDF has no text layer (scanned image)", async () => {
    expect(await codeOf(extractEvidenceText("scan.pdf", makePdf("")))).toBe("NO_TEXT");
  });
});

describe("extractEvidenceText: limits", () => {
  it("cuts long text at the limit and flags it", async () => {
    const r = await extractEvidenceText("big.txt", Buffer.from("a".repeat(MAX_TEXT_CHARS + 5000)));
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBe(MAX_TEXT_CHARS);
    expect(r.charCount).toBe(MAX_TEXT_CHARS);
  });

  it("rejects a zip bomb before unpacking it", async () => {
    const bomb = await makeZipBomb(110 * 1024 * 1024);
    expect(bomb.length).toBeLessThan(10 * 1024 * 1024);
    expect(await codeOf(extractEvidenceText("evil.docx", bomb))).toBe("UNREADABLE");
  }, 60_000); // building the 110 MB archive is slow when the whole suite runs in parallel

  it("rejects an archive with too many entries", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 2500; i++) files[`f${i}.xml`] = "x";
    expect(await codeOf(extractEvidenceText("many.xlsx", await makeZip(files)))).toBe("UNREADABLE");
  }, 30_000);
});

describe("extractEvidenceText: type checking", () => {
  it("rejects unsupported extensions", async () => {
    expect(await codeOf(extractEvidenceText("tool.exe", Buffer.from("MZ...")))).toBe("UNSUPPORTED_TYPE");
    expect(await codeOf(extractEvidenceText("noextension", Buffer.from("hello")))).toBe("UNSUPPORTED_TYPE");
  });

  it("rejects content that does not match the extension", async () => {
    expect(await codeOf(extractEvidenceText("fake.pdf", Buffer.from("just some text")))).toBe("UNSUPPORTED_TYPE");
    expect(await codeOf(extractEvidenceText("fake.docx", Buffer.from("just some text")))).toBe("UNSUPPORTED_TYPE");
    // an .xlsx renamed to .docx
    expect(await codeOf(extractEvidenceText("swap.docx", await makeXlsx("S", [["a"]])))).toBe("UNSUPPORTED_TYPE");
  });

  it("reports a corrupt Office file as unreadable, not as a crash", async () => {
    const corrupt = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("not really a zip file at all")]);
    expect(await codeOf(extractEvidenceText("bad.docx", corrupt))).toBe("UNREADABLE");
  });
});
