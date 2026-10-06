import { describe, it, expect } from "vitest";
import { generateReportContent, ReportGenerationError, type Ask } from "../../src/reporting/generate.js";
import { runQualityGates } from "../../src/reporting/gates.js";
import { makeFacts, sectionReply } from "./fixtures.js";

const facts = makeFacts();

/** Answers each section call from the known-good fixture; `override` can replace a section's reply. */
function fakeAsk(override: (section: string, attempt: number, prompt: string) => string | undefined = () => undefined) {
  const attempts: Record<string, number> = {};
  const prompts: Array<{ section: string; prompt: string }> = [];
  const ask: Ask = async (_system, prompt) => {
    const section = /^SECTION: (\S+)/m.exec(prompt)![1];
    attempts[section] = (attempts[section] ?? 0) + 1;
    prompts.push({ section, prompt });
    const custom = override(section, attempts[section], prompt);
    if (custom !== undefined) return custom;
    return "```json\n" + JSON.stringify(sectionReply(section)) + "\n```";
  };
  return { ask, attempts, prompts };
}

describe("generateReportContent", () => {
  it("assembles a report that passes every quality gate", async () => {
    const { ask } = fakeAsk();
    const content = await generateReportContent(facts, ask);
    const report = runQualityGates(content, facts);
    expect(report.checks.filter((c) => !c.passed)).toEqual([]);
  });

  it("makes one call per opportunity and one per other section", async () => {
    const { ask, attempts } = fakeAsk();
    await generateReportContent(facts, ask);
    expect(Object.keys(attempts).sort()).toEqual(
      ["company", "executive", "notes", "opportunity:o1", "opportunity:o2", "priorities", "risks", "roadmap", "technical"].sort()
    );
    expect(Object.values(attempts).every((n) => n === 1)).toBe(true);
  });

  it("sets identity, counts, sources and rank in code, ignoring what the model claims", async () => {
    const { ask } = fakeAsk();
    const content = await generateReportContent(facts, ask);
    const o1 = content.opportunities.find((o) => o.opportunityId === "o1")!;
    expect(o1.evidence).toEqual({ facts: 2, inferences: 1, assumptions: 0, hypotheses: 1 });
    expect(o1.sourceIds).toEqual(["S1", "S2"]);
    expect(content.company.name).toBe("Acme Shipping");
    expect(content.company.website).toBe("https://www.acme-shipping.com");
  });

  it("ranks opportunities from their ratings, best first", async () => {
    const { ask } = fakeAsk();
    const content = await generateReportContent(facts, ask);
    expect(content.opportunities.map((o) => [o.opportunityId, o.rank])).toEqual([
      ["o1", 1],
      ["o2", 2],
    ]);
  });

  it("repeats a failed section once, telling the model what was wrong", async () => {
    const { ask, attempts, prompts } = fakeAsk((section, attempt) => (section === "risks" && attempt === 1 ? '{"risks": []}' : undefined));
    const content = await generateReportContent(facts, ask);
    expect(attempts.risks).toBe(2);
    expect(content.risks.length).toBeGreaterThanOrEqual(3);
    const retry = prompts.filter((p) => p.section === "risks")[1].prompt;
    expect(retry).toMatch(/previous answer was rejected/i);
    expect(retry).toMatch(/risks/);
  });

  it("repeats a section whose reply is not JSON", async () => {
    const { ask, attempts } = fakeAsk((section, attempt) => (section === "company" && attempt === 1 ? "Sorry, here is some prose." : undefined));
    await generateReportContent(facts, ask);
    expect(attempts.company).toBe(2);
  });

  it("rejects a source id that is not in the register, so the model can fix it", async () => {
    const { ask, attempts } = fakeAsk((section, attempt) =>
      section === "priorities" && attempt === 1 ? JSON.stringify({ priorities: [{ priority: "Cut costs", sourceIds: ["S9"] }] }) : undefined
    );
    await generateReportContent(facts, ask);
    expect(attempts.priorities).toBe(2);
  });

  it("fails with the section name after two bad answers", async () => {
    const { ask } = fakeAsk((section) => (section === "executive" ? '{"headline": "x"}' : undefined));
    await expect(generateReportContent(facts, ask)).rejects.toThrow(ReportGenerationError);
    await expect(generateReportContent(facts, ask)).rejects.toThrow(/executive/);
  });

  it("does not swallow errors from the AI call itself", async () => {
    const ask: Ask = async () => {
      throw new Error("Conclave is busy");
    };
    await expect(generateReportContent(facts, ask)).rejects.toThrow(/busy/);
  });

  it("reports progress by stage name", async () => {
    const { ask } = fakeAsk();
    const stages: string[] = [];
    await generateReportContent(facts, ask, { onStage: (s) => void stages.push(s) });
    expect(stages[0]).toMatch(/opportunit/i);
    expect(stages.length).toBeGreaterThanOrEqual(7);
  });

  it("gives the model the saved facts as untrusted data and the source register", async () => {
    const { ask, prompts } = fakeAsk();
    await generateReportContent(facts, ask);
    const p = prompts.find((x) => x.section === "opportunity:o1")!.prompt;
    expect(p).toContain("<data>");
    expect(p).toContain("Operates a fleet of 700 vessels");
    expect(p).toContain("S1");
  });

  it("refuses to run with no opportunities", async () => {
    const { ask } = fakeAsk();
    await expect(generateReportContent({ ...facts, opportunities: [], totals: { ...facts.totals, opportunities: 0 } }, ask)).rejects.toThrow(/no opportunities/i);
  });
});
