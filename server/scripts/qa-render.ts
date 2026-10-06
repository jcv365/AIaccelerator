// Developer tool for visual QA of the report files. Renders the four deliverables from either the synthetic test
// fixture or a saved report (a JSON file holding {content, sources, titles}) into an output folder, so they can be
// converted to PDF/PNG with LibreOffice and inspected page by page.
//
//   npx tsx scripts/qa-render.ts <outDir> [report.json]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderDeck } from "../src/reporting/render/deck.js";
import { renderDoc } from "../src/reporting/render/doc.js";
import type { RenderInput } from "../src/reporting/render/common.js";
import { makeFacts, makeValidContent } from "../test/reporting/fixtures.js";

const [outDir, reportPath] = process.argv.slice(2);
if (!outDir) {
  console.error("usage: tsx scripts/qa-render.ts <outDir> [report.json]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

let input: RenderInput;
if (reportPath) {
  const saved = JSON.parse(readFileSync(reportPath, "utf8")) as Pick<RenderInput, "content" | "sources" | "titles">;
  input = { ...saved, meta: { version: 1, status: "DRAFT", generatedAt: new Date(), author: "DotCloud Consulting" } };
} else {
  const facts = makeFacts();
  input = {
    content: makeValidContent(),
    sources: facts.sources,
    titles: Object.fromEntries(facts.opportunities.map((o) => [o.id, o.title])),
    meta: { version: 1, status: "DRAFT", generatedAt: new Date(), author: "DotCloud Consulting" },
  };
}

for (const audience of ["C_LEVEL", "TECHNICAL"] as const) {
  const stem = audience === "C_LEVEL" ? "c-level" : "technical";
  writeFileSync(join(outDir, `${stem}-deck.pptx`), await renderDeck(input, audience));
  writeFileSync(join(outDir, `${stem}-proposal.docx`), await renderDoc(input, audience));
  console.log(`rendered ${stem}`);
}
