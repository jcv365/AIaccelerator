// Helpers for turning an LLM answer into validated data. The model is asked for strict JSON, but its
// output is untrusted: it is parsed defensively, every field is checked, numbers are clamped and
// unknown enum values are rejected. Callers save nothing unless validation passes.

/** Parse the first JSON object in the text (tolerating a ```json fence or prose around it), else null. */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function clampNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

export function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, maxLength);
}

/** An array of short non-empty strings, at most maxItems; null if it is not an array of strings at all. */
export function stringList(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, maxLength))
    .filter((v) => v !== "");
  return items.slice(0, maxItems);
}

export const BAD_AI_OUTPUT = {
  error: { code: "AI_BAD_OUTPUT", message: "The AI returned an answer that could not be used. Nothing was saved; try again." },
};
