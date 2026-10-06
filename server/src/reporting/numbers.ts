// "Never invent numbers" made checkable. Every figure in generated narrative must either appear in the saved
// facts (the company's evidence, opportunities, decisions...) or be a small whole number used as a count or
// ordinal ("3 phases", "the 14-day proof of value"). Anything else - a percentage, a currency amount, a
// magnitude ("2m"), a decimal or a larger number that the facts never mention - is treated as invented.

// Optional currency prefix, digits with thousands separators, optional decimals, optional unit/magnitude.
const NUMBER = /(?:[$€£]|\bR\s?)?\d[\d,]*(?:\.\d+)?\s?(?:%|percent\b|(?:million|billion|thousand|bn)\b|[kmb]\b)?/gi;

function normalise(raw: string): string {
  return raw.toLowerCase().replace(/[\s,]/g, "").replace(/percent$/, "%");
}

/** The comparable (lower-cased, separator-free) numeric tokens in a piece of text. */
export function extractNumberTokens(text: string): string[] {
  return (text.match(NUMBER) ?? []).map(normalise);
}

/** Every figure appearing in the given strings, plus any extra structural numbers (e.g. counts computed in code). */
export function buildAllowedNumbers(strings: string[], extra: Array<string | number> = []): Set<string> {
  const allowed = new Set<string>();
  for (const s of strings) for (const token of extractNumberTokens(s)) allowed.add(token);
  for (const e of extra) allowed.add(normalise(String(e)));
  return allowed;
}

const SMALL_COUNT = /^\d{1,2}$/;

export function isGroundedNumber(token: string, allowed: Set<string>): boolean {
  if (allowed.has(token)) return true;
  // A bare whole number up to 20 is a count or ordinal; with %, currency, a magnitude or decimals it is a claim.
  return SMALL_COUNT.test(token) && Number(token) <= 20;
}
