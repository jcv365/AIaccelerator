// The optional fields the scan may fill in for an opportunity, validated one by one: a value the AI got wrong
// (wrong type, out of range, unknown priority) is dropped, never allowed to fail the whole run.

const MAX_TEXT = 2000;
const MAX_CATEGORY = 80;
const MAX_ANNUAL_VALUE = 1_000_000_000_000;
const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];

const TEXT_FIELDS = ["hypothesis", "potentialValue", "complexity", "dependencies", "aiSuitability", "risks"] as const;

export interface DraftFields {
  /** Only the fields that passed validation. */
  data: Record<string, string | number>;
  /** The names of those fields: stored on the opportunity so the UI can show them as an AI draft until edited. */
  fields: string[];
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  return text === "" ? undefined : text.slice(0, max);
}

export function parseDraftFields(raw: Record<string, unknown>): DraftFields {
  const data: Record<string, string | number> = {};

  for (const field of TEXT_FIELDS) {
    const text = cleanText(raw[field], MAX_TEXT);
    if (text) data[field] = text;
  }

  const category = cleanText(raw.category, Number.MAX_SAFE_INTEGER);
  if (category && category.length <= MAX_CATEGORY) data.category = category;

  if (typeof raw.priority === "string") {
    const priority = raw.priority.trim().toUpperCase();
    if (PRIORITIES.includes(priority)) data.priority = priority;
  }

  const value = raw.estimatedAnnualValue;
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (rounded >= 0 && rounded <= MAX_ANNUAL_VALUE) data.estimatedAnnualValue = rounded;
  }

  return { data, fields: Object.keys(data) };
}
