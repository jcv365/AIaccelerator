import { describe, it, expect, vi } from "vitest";
import { collectFacts } from "../../src/reporting/facts.js";

function prismaWith(opportunities: unknown[], company: unknown = { id: "c1", name: "Maersk", website: "https://maersk.com" }) {
  return {
    company: { findUnique: vi.fn().mockResolvedValue(company) },
    opportunity: { findMany: vi.fn().mockResolvedValue(opportunities) },
  };
}

const opp = (id: string, title: string, evidence: unknown[], extra: Record<string, unknown> = {}) => ({
  id,
  title,
  description: `${title} description`,
  businessProblem: "Slow manual work",
  status: "DISCOVERED",
  hypothesis: null,
  evidence,
  decisions: [],
  experiments: [],
  ...extra,
});

const ev = (type: string, claim: string, source: string | null, extra: Record<string, unknown> = {}) => ({
  claim,
  type,
  confidence: 0.8,
  source,
  excerpt: null,
  ...extra,
});

describe("collectFacts", () => {
  it("reads the company's opportunities with their evidence, decisions and experiments", async () => {
    const prisma = prismaWith([opp("o1", "Predictive maintenance", [])]);
    const facts = await collectFacts(prisma as never, "c1");

    expect(prisma.opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: "c1" }, include: { evidence: true, decisions: true, experiments: true } })
    );
    expect(facts.company).toEqual({ id: "c1", name: "Maersk", website: "https://maersk.com" });
    expect(facts.opportunities.map((o) => o.title)).toEqual(["Predictive maintenance"]);
  });

  it("derives exact evidence counts per type from the data (never from a model)", async () => {
    const prisma = prismaWith([
      opp("o1", "A", [
        ev("FACT", "f1", null),
        ev("FACT", "f2", null),
        ev("INFERENCE", "i1", null),
        ev("ASSUMPTION", "a1", null),
        ev("AI_HYPOTHESIS", "h1", null),
        ev("AI_HYPOTHESIS", "h2", null),
      ]),
    ]);
    const facts = await collectFacts(prisma as never, "c1");
    expect(facts.opportunities[0].counts).toEqual({ facts: 2, inferences: 1, assumptions: 1, hypotheses: 2 });
  });

  it("builds one source register across all opportunities and tags each evidence row with its source id", async () => {
    const prisma = prismaWith([
      opp("o1", "A", [ev("FACT", "x", "https://www.maersk.com/about"), ev("FACT", "y", "https://www.sec.gov/10k")]),
      opp("o2", "B", [ev("FACT", "z", "https://maersk.com/about/"), ev("INFERENCE", "w", null)]),
    ]);
    const facts = await collectFacts(prisma as never, "c1");

    expect(facts.sources.map((s) => s.id)).toEqual(["S1", "S2"]);
    expect(facts.opportunities[0].evidence.map((e) => e.sourceId)).toEqual(["S1", "S2"]);
    expect(facts.opportunities[1].evidence.map((e) => e.sourceId)).toEqual(["S1", undefined]);
  });

  it("collects every figure in the saved text as allowed, plus counts computed from the data", async () => {
    const evidence = Array.from({ length: 25 }, (_, i) => ev("FACT", i === 0 ? "Fleet of 700 vessels in 130 countries" : `claim ${i}`, null));
    const facts = await collectFacts(prismaWith([opp("o1", "A", evidence)]) as never, "c1");

    expect(facts.allowedNumbers.has("700")).toBe(true);
    expect(facts.allowedNumbers.has("130")).toBe(true);
    expect(facts.allowedNumbers.has("25")).toBe(true); // evidence count, computed
    expect(facts.allowedNumbers.has("999")).toBe(false);
  });

  it("includes decisions, experiments and the company's name text in the allowed figures", async () => {
    const prisma = prismaWith(
      [
        opp("o1", "A", [], {
          decisions: [{ decision: "Proceed", rationale: "Pilot cost capped at 40000" }],
          experiments: [{ title: "Test", status: "COMPLETE", resultSummary: "Cut 35% of delays", success: true }],
        }),
      ],
      { id: "c1", name: "Acme 360", website: null }
    );
    const facts = await collectFacts(prisma as never, "c1");
    expect(facts.allowedNumbers.has("40000")).toBe(true);
    expect(facts.allowedNumbers.has("35%")).toBe(true);
    expect(facts.allowedNumbers.has("360")).toBe(true);
  });

  it("throws a clear error when the company does not exist", async () => {
    const prisma = prismaWith([], null);
    await expect(collectFacts(prisma as never, "ghost")).rejects.toThrow(/company not found/i);
  });

  it("reports totals for the evidence-quality note", async () => {
    const prisma = prismaWith([opp("o1", "A", [ev("FACT", "f", "https://a.com/x")]), opp("o2", "B", [])]);
    const facts = await collectFacts(prisma as never, "c1");
    expect(facts.totals).toEqual({ opportunities: 2, evidence: 1, sources: 1 });
  });
});
