import path from "node:path";
import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import readXlsxFile from "read-excel-file/node";
import { parse as parseCsv } from "csv-parse/sync";
import { EvidenceError } from "./errors.js";
import { inspectZip, looksLikeZip } from "./zipGuard.js";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_CHARS = 200_000;
const MAX_PDF_PAGES = 200;
const MAX_TABLE_ROWS = 20_000;

export type EvidenceKind = "pdf" | "docx" | "xlsx" | "csv" | "text";

export interface ExtractedEvidence {
  kind: EvidenceKind;
  text: string;
  /** True when the document had more text than we keep. */
  truncated: boolean;
  /** Length of the stored text. */
  charCount: number;
}

const unreadable = () => new EvidenceError("UNREADABLE", "The file could not be read. It may be damaged or password-protected.");
const wrongType = (what: string) => new EvidenceError("UNSUPPORTED_TYPE", `The file does not look like a real ${what}.`);

const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

function decodeText(data: Buffer): string {
  // A NUL byte means binary data; real text files never contain one.
  if (data.includes(0)) throw new EvidenceError("UNSUPPORTED_TYPE", "The file contains binary data, not text.");
  return data.toString("utf8");
}

function tableToText(rows: unknown[][]): string {
  return rows
    .slice(0, MAX_TABLE_ROWS)
    .map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim())))
    .filter((cells) => cells.some((c) => c !== ""))
    .map((cells) => cells.join(" | "))
    .join("\n");
}

async function extractPdf(data: Buffer): Promise<string> {
  if (!data.subarray(0, 1024).toString("latin1").includes("%PDF-")) throw wrongType("PDF");
  try {
    return (await pdfParse(data, { max: MAX_PDF_PAGES })).text;
  } catch {
    throw unreadable();
  }
}

async function extractDocx(data: Buffer): Promise<string> {
  if (!looksLikeZip(data)) throw wrongType("Word document");
  if (!inspectZip(data).names.includes("word/document.xml")) throw wrongType("Word document");
  try {
    return (await mammoth.extractRawText({ buffer: data })).value;
  } catch {
    throw unreadable();
  }
}

async function extractXlsx(data: Buffer): Promise<string> {
  if (!looksLikeZip(data)) throw wrongType("Excel workbook");
  if (!inspectZip(data).names.includes("xl/workbook.xml")) throw wrongType("Excel workbook");
  try {
    const sheets = await readXlsxFile(data);
    return sheets
      .map((s) => `Sheet: ${s.sheet}\n${tableToText(s.data as unknown[][])}`)
      .join("\n\n");
  } catch {
    throw unreadable();
  }
}

function extractCsv(data: Buffer): string {
  try {
    const rows = parseCsv(stripBom(decodeText(data)), {
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
    }) as string[][];
    return tableToText(rows);
  } catch (err) {
    if (err instanceof EvidenceError) throw err;
    throw unreadable();
  }
}

/**
 * Turns an uploaded file into plain text. The type is decided from the extension AND the file's own bytes, so a
 * renamed file is refused rather than guessed at. Throws EvidenceError for anything a user can fix.
 */
export async function extractEvidenceText(filename: string, data: Buffer): Promise<ExtractedEvidence> {
  if (data.length > MAX_FILE_BYTES) throw new EvidenceError("TOO_LARGE", "The file is larger than 10 MB.");
  const ext = path.extname(filename).toLowerCase();

  let kind: EvidenceKind;
  let raw: string;
  switch (ext) {
    case ".pdf":
      kind = "pdf";
      raw = await extractPdf(data);
      break;
    case ".docx":
      kind = "docx";
      raw = await extractDocx(data);
      break;
    case ".xlsx":
      kind = "xlsx";
      raw = await extractXlsx(data);
      break;
    case ".csv":
      kind = "csv";
      raw = extractCsv(data);
      break;
    case ".txt":
    case ".md":
      kind = "text";
      raw = decodeText(data);
      break;
    default:
      throw new EvidenceError("UNSUPPORTED_TYPE", "Use a PDF, Word (.docx), Excel (.xlsx), CSV, text or Markdown file.");
  }

  const cleaned = stripBom(raw)
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (cleaned === "") {
    throw new EvidenceError("NO_TEXT", "No readable text was found. If this is a scan or a photo, upload a text version.");
  }
  const truncated = cleaned.length > MAX_TEXT_CHARS;
  const text = truncated ? cleaned.slice(0, MAX_TEXT_CHARS) : cleaned;
  return { kind, text, truncated, charCount: text.length };
}
