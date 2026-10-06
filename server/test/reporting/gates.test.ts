import { describe, it, expect } from "vitest";
import { runQualityGates } from "../../src/reporting/gates.js";
import type { ReportContent } from "../../src/reporting/content.js";
import { makeFacts, makeValidContent } from "./fixtures.js";

const facts = makeFacts();

function failedIds(content: unknown): string[] {
  return runQualityGates(content, facts)
    .checks.filter((c) => !c.passed)
    .map((c) => c.id);
}

function mutated(change: (c: ReportContent) => void): ReportContent {
  const c = structuredClone(makeValidContent());
  change(c);
  return c;
}

describe("runQualityGates", () => {
  it("passes a valid, grounded report on every check", () => {
    const report = runQualityGates(makeValidContent(), facts);
    expect(report.checks.filter((c) => !c.passed)).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.checks.map((c) => c.id)).toEqual([
      "schema",
      "company",
      "opportunities",
      "evidenceCounts",
      "sources",
      "noPlaceholders",
      "numbersGrounded",
      "evidenceNote",
      "textFit",
    ]);
  });

  it("fails the schema check, with readable reasons, when a required section is missing", () => {
    const broken = makeValidContent() as unknown as Record<string, unknown>;
    delete broken.roadmap;
    const report = runQualityGates(broken, facts);
    expect(report.passed).toBe(false);
    const schema = report.checks.find((c) => c.id === "schema")!;
    expect(schema.passed).toBe(false);
    expect(schema.details.join(" ")).toMatch(/roadmap/i);
  });

  it("fails when the report is for a different company than the saved one", () => {
    expect(failedIds(mutated((c) => (c.company.name = "Some Other Corp")))).toContain("company");
  });

  it("fails when an opportunity id does not exist in the saved data", () => {
    expect(failedIds(mutated((c) => (c.opportunities[1].opportunityId = "ghost")))).toContain("opportunities");
  });

  it("fails on duplicate opportunities and on ranks that are not 1..n", () => {
    expect(failedIds(mutated((c) => (c.opportunities[1].opportunityId = "o1")))).toContain("opportunities");
    expect(failedIds(mutated((c) => (c.opportunities[1].rank = 5)))).toContain("opportunities");
  });

  it("fails when an architecture entry points at an unknown opportunity", () => {
    expect(failedIds(mutated((c) => (c.technical.architecture[0].opportunityId = "ghost")))).toContain("opportunities");
  });

  it("fails when evidence counts do not match the database (tampered or hallucinated)", () => {
    expect(failedIds(mutated((c) => (c.opportunities[0].evidence.facts = 9)))).toContain("evidenceCounts");
  });

  it("fails when a source id is not in the source register", () => {
    expect(failedIds(mutated((c) => (c.opportunities[0].sourceIds = ["S1", "S9"])))).toContain("sources");
    expect(failedIds(mutated((c) => (c.priorities[0].sourceIds = ["S7"])))).toContain("sources");
  });

  it("fails when a requirement claims public evidence but cites no source", () => {
    expect(failedIds(mutated((c) => (c.technical.dataRequirements[0].sourceIds = [])))).toContain("sources");
  });

  it("fails on leftover placeholders", () => {
    for (const bad of ["[Insert value here]", "TBD", "Lorem ipsum dolor", "XXX", "<company>", "To be determined"]) {
      expect(failedIds(mutated((c) => (c.executive.recommendation = `Start with ${bad} now.`))), bad).toContain("noPlaceholders");
    }
  });

  it("does not treat a source citation like [S1] as a placeholder", () => {
    expect(failedIds(mutated((c) => (c.executive.recommendation = "Start with a 14-day proof of value [S1].")))).not.toContain("noPlaceholders");
  });

  it("fails on a figure that is not in the saved facts (an invented number)", () => {
    const report = runQualityGates(mutated((c) => (c.opportunities[0].whyItMatters = "It could cut downtime costs by 30%.")), facts);
    const check = report.checks.find((c) => c.id === "numbersGrounded")!;
    expect(check.passed).toBe(false);
    expect(check.details.join(" ")).toMatch(/30%/);
    expect(check.details.join(" ")).toMatch(/opportunities\.0\.whyItMatters/);
  });

  it("allows figures that are in the saved facts and small counts", () => {
    expect(failedIds(mutated((c) => (c.executive.paragraphs[0] = "A fleet of 700 vessels and 3 phases of work.")))).not.toContain("numbersGrounded");
  });

  it("fails on invented money and magnitudes even when small", () => {
    expect(failedIds(mutated((c) => (c.executive.boardAsk = "Approve a budget of $2 million.")))).toContain("numbersGrounded");
  });

  it("requires the evidence note to admit limitations when public sources are few", () => {
    expect(failedIds(mutated((c) => (c.evidenceNote = "Everything is fully confirmed and complete.")))).toContain("evidenceNote");
  });

  it("fails when narrative contains raw URLs (they belong in the source register) or unbreakable overlong words", () => {
    expect(failedIds(mutated((c) => (c.executive.paragraphs[1] = "See https://www.acme-shipping.com/about for details.")))).toContain("textFit");
    expect(failedIds(mutated((c) => (c.executive.paragraphs[1] = `Look at ${"x".repeat(60)} for details.`)))).toContain("textFit");
  });

  it("reports every problem at once instead of stopping at the first", () => {
    const ids = failedIds(
      mutated((c) => {
        c.company.name = "Other";
        c.opportunities[0].evidence.facts = 9;
        c.executive.recommendation = "TBD";
      })
    );
    expect(ids).toEqual(expect.arrayContaining(["company", "evidenceCounts", "noPlaceholders"]));
  });
});
