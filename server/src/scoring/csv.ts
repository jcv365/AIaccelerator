// Minimal CSV writer for the data export. Besides RFC 4180 quoting it neutralises spreadsheet formula
// injection: a cell that starts with = + - @ (or a tab/CR) is prefixed with an apostrophe so Excel and
// Sheets show it as text instead of running it. Values here include AI- and web-sourced text.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  return lines.join("\r\n") + "\r\n";
}
