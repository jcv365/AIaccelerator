import { renderDeck } from "./deck.js";
import { renderDoc } from "./doc.js";
import type { Audience, RenderInput } from "./common.js";

export type { Audience, RenderInput, RenderMeta } from "./common.js";

export interface RenderedFile {
  audience: Audience;
  format: "PPTX" | "DOCX";
  filename: string;
  content: Buffer;
}

/** A filename-safe slug of the company name, so downloads are recognisable and never contain path characters. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // accents fall away: "é" -> "e"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "company";
}

/** The four deliverables for one report version: C-level deck and proposal, technical deck and proposal. */
export async function renderDeliverables(input: RenderInput): Promise<RenderedFile[]> {
  const stem = `${slugify(input.content.company.name)}-v${input.meta.version}`;
  const files: RenderedFile[] = [];
  for (const audience of ["C_LEVEL", "TECHNICAL"] as const) {
    const label = audience === "C_LEVEL" ? "c-level" : "technical";
    files.push({ audience, format: "PPTX", filename: `${stem}-${label}-deck.pptx`, content: await renderDeck(input, audience) });
    files.push({ audience, format: "DOCX", filename: `${stem}-${label}-proposal.docx`, content: await renderDoc(input, audience) });
  }
  return files;
}
