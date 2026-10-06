import { reportContentSchema, type ReportContent } from "./content.js";
import type { Facts } from "./facts.js";
import { extractNumberTokens, isGroundedNumber } from "./numbers.js";

// Automatic quality gates: a generated report is only offered for download if every check passes. Each check
// reports ALL of its problems (not just the first) with a path to where each one is, so a failed report
// explains itself. Nothing here calls an AI: the gates are deterministic and cheap to run.

export interface GateResult {
  id: string;
  name: string;
  passed: boolean;
  details: string[];
}

export interface QualityReport {
  passed: boolean;
  checks: GateResult[];
}

// Fields that are identifiers or links, not prose: excluded from the text checks.
const NON_PROSE_KEYS = new Set(["opportunityId", "sourceIds", "website"]);

const PLACEHOLDERS: Array<[RegExp, string]> = [
  [/\[(?!S\d+\])[^\]]{2,}\]/, "square-bracket placeholder"],
  [/\b(?:TBD|TODO|FIXME|lorem ipsum|to be determined|placeholder)\b/i, "unfinished marker"],
  [/\binsert\s+[a-z ]+\s+here\b/i, "insert-here marker"],
  [/\bX{3,}\b/, "XXX filler"],
  [/<[a-z][^>]*>/i, "angle-bracket placeholder"],
];

const LIMITATION_WORDS = /\b(limited|thin|not found|no public|gap|gaps|scarce|few|sparse|missing)\b/i;
const MAX_WORD_LENGTH = 45;

function collectProse(value: unknown, path: string, out: Array<{ path: string; text: string }>): void {
  if (typeof value === "string") {
    out.push({ path, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectProse(v, `${path}.${i}`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (!NON_PROSE_KEYS.has(k)) collectProse(v, path ? `${path}.${k}` : k, out);
    }
  }
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function runQualityGates(input: unknown, facts: Facts): QualityReport {
  const parsed = reportContentSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return { passed: false, checks: [{ id: "schema", name: "Report has every required section in the right shape", passed: false, details }] };
  }
  const content: ReportContent = parsed.data;
  const checks: GateResult[] = [{ id: "schema", name: "Report has every required section in the right shape", passed: true, details: [] }];
  const add = (id: string, name: string, details: string[]) => checks.push({ id, name, passed: details.length === 0, details });

  // company
  add("company", "Report is about the saved company", norm(content.company.name) === norm(facts.company.name) ? [] : [`company.name is "${content.company.name}", expected "${facts.company.name}"`]);

  // opportunities
  const knownIds = new Set(facts.opportunities.map((o) => o.id));
  const oppProblems: string[] = [];
  const seen = new Set<string>();
  for (const [i, o] of content.opportunities.entries()) {
    if (!knownIds.has(o.opportunityId)) oppProblems.push(`opportunities.${i}: unknown opportunity "${o.opportunityId}"`);
    if (seen.has(o.opportunityId)) oppProblems.push(`opportunities.${i}: "${o.opportunityId}" appears more than once`);
    seen.add(o.opportunityId);
  }
  const ranks = content.opportunities.map((o) => o.rank).sort((a, b) => a - b);
  if (ranks.some((r, i) => r !== i + 1)) oppProblems.push(`ranks must be 1..${ranks.length} with no gaps or repeats (got ${ranks.join(",")})`);
  for (const [i, a] of content.technical.architecture.entries()) {
    if (!knownIds.has(a.opportunityId)) oppProblems.push(`technical.architecture.${i}: unknown opportunity "${a.opportunityId}"`);
  }
  add("opportunities", "Opportunities exist, are unique and ranked 1..n", oppProblems);

  // evidence counts (written by code; must equal the database)
  const countProblems: string[] = [];
  for (const [i, o] of content.opportunities.entries()) {
    const real = facts.opportunities.find((f) => f.id === o.opportunityId);
    if (real && JSON.stringify(o.evidence) !== JSON.stringify(real.counts)) {
      countProblems.push(`opportunities.${i}.evidence is ${JSON.stringify(o.evidence)}, database says ${JSON.stringify(real.counts)}`);
    }
  }
  add("evidenceCounts", "Evidence counts match the database", countProblems);

  // sources
  const knownSources = new Set(facts.sources.map((s) => s.id));
  const sourceProblems: string[] = [];
  const checkIds = (ids: string[], path: string) => {
    for (const id of ids) if (!knownSources.has(id)) sourceProblems.push(`${path}: source "${id}" is not in the source register`);
  };
  content.opportunities.forEach((o, i) => checkIds(o.sourceIds, `opportunities.${i}.sourceIds`));
  content.priorities.forEach((p, i) => checkIds(p.sourceIds, `priorities.${i}.sourceIds`));
  content.technical.dataRequirements.forEach((d, i) => {
    checkIds(d.sourceIds, `technical.dataRequirements.${i}.sourceIds`);
    if (d.status === "PUBLIC_EVIDENCE" && d.sourceIds.length === 0) {
      sourceProblems.push(`technical.dataRequirements.${i}: marked PUBLIC_EVIDENCE but cites no source`);
    }
  });
  add("sources", "Every cited source exists; public-evidence claims cite one", sourceProblems);

  // prose checks
  const prose: Array<{ path: string; text: string }> = [];
  collectProse(content, "", prose);

  const placeholderProblems: string[] = [];
  for (const { path, text } of prose) {
    for (const [re, label] of PLACEHOLDERS) if (re.test(text)) placeholderProblems.push(`${path}: ${label} in "${text.slice(0, 60)}"`);
  }
  add("noPlaceholders", "No placeholders or unfinished text", placeholderProblems);

  const numberProblems: string[] = [];
  for (const { path, text } of prose) {
    for (const token of new Set(extractNumberTokens(text))) {
      if (!isGroundedNumber(token, facts.allowedNumbers)) numberProblems.push(`${token} in ${path} is not in the saved facts`);
    }
  }
  add("numbersGrounded", "Every figure comes from the saved facts (no invented numbers)", numberProblems);

  const limited = facts.totals.sources < 3;
  add("evidenceNote", "Evidence note admits limitations when public sources are few", limited && !LIMITATION_WORDS.test(content.evidenceNote) ? [`only ${facts.totals.sources} public source(s) were found but evidenceNote does not mention the limitation`] : []);

  const fitProblems: string[] = [];
  for (const { path, text } of prose) {
    if (/https?:\/\//i.test(text)) fitProblems.push(`${path}: raw URL in prose (put it in the source register)`);
    const long = text.split(/\s+/).find((w) => w.length > MAX_WORD_LENGTH);
    if (long) fitProblems.push(`${path}: unbreakable word of ${long.length} characters`);
  }
  add("textFit", "Text will fit: no raw URLs or unbreakable words", fitProblems);

  return { passed: checks.every((c) => c.passed), checks };
}
