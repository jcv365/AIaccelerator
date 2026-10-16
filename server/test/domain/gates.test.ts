import { describe, it, expect } from "vitest";
import { evaluateHypothesisGate, type GateOpportunity } from "../../src/domain/gates.js";
import {
  GATED_MOVES,
  REASON_REQUIRED_STATUSES,
  isGatedMove,
  requiresReason,
  stageCatalog,
} from "../../src/domain/stateMachine.js";

const complete: GateOpportunity = {
  businessProblem: "Claims triage is manual and takes twelve days on average, which delays settlements.",
  owner: "Thandi M.",
  potentialValue: "Faster settlements and fewer complaints",
  estimatedAnnualValue: null,
  hypothesis: "We believe automated triage will cut claim time by 30%, measured by days to settle.",
  dependencies: "Claims history, policy data",
  aiSuitability: "Text classification fits this well",
  risks: "Data quality in older claims",
  aiDraftFields: [],
};
const factFromDocument = [{ type: "FACT", documentId: "d1" }];

const unmet = (opp: GateOpportunity, evidence = factFromDocument) =>
  evaluateHypothesisGate(opp, evidence).criteria.filter((c) => !c.met).map((c) => c.key);

describe("evaluateHypothesisGate", () => {
  it("is met when all eight criteria hold", () => {
    const gate = evaluateHypothesisGate(complete, factFromDocument);
    expect(gate.to).toBe("HYPOTHESIS");
    expect(gate.met).toBe(true);
    expect(gate.criteria).toHaveLength(8);
    expect(gate.criteria.every((c) => c.met)).toBe(true);
  });

  it("needs a business problem of at least 40 characters", () => {
    expect(unmet({ ...complete, businessProblem: "Too short" })).toEqual(["problem"]);
    expect(unmet({ ...complete, businessProblem: null })).toEqual(["problem"]);
  });

  it("needs a named owner", () => {
    expect(unmet({ ...complete, owner: "   " })).toEqual(["owner"]);
    expect(unmet({ ...complete, owner: null })).toEqual(["owner"]);
  });

  it("needs a value, either in words or as a rand figure", () => {
    expect(unmet({ ...complete, potentialValue: null })).toEqual(["value"]);
    expect(unmet({ ...complete, potentialValue: null, estimatedAnnualValue: 6_500_000 })).toEqual([]);
    expect(unmet({ ...complete, potentialValue: null, estimatedAnnualValue: 0 })).toEqual([]);
  });

  it("needs a hypothesis that names how success is measured", () => {
    expect(unmet({ ...complete, hypothesis: "We believe AI will help with claims." })).toEqual(["hypothesis"]);
    expect(unmet({ ...complete, hypothesis: null })).toEqual(["hypothesis"]);
    for (const ok of [
      "We believe triage will help, measured by days to settle",
      "Triage will help. KPI: days to settle",
      "Triage will help. Metric: days to settle",
    ]) {
      expect(unmet({ ...complete, hypothesis: ok })).toEqual([]);
    }
  });

  it("needs the data it depends on, an AI suitability view and the risks", () => {
    expect(unmet({ ...complete, dependencies: "" })).toEqual(["data"]);
    expect(unmet({ ...complete, aiSuitability: null })).toEqual(["suitability"]);
    expect(unmet({ ...complete, risks: " " })).toEqual(["risks"]);
  });

  it("needs at least one fact that is backed by an uploaded document", () => {
    expect(unmet(complete, [])).toEqual(["evidence"]);
    expect(unmet(complete, [{ type: "FACT", documentId: null }])).toEqual(["evidence"]);
    expect(unmet(complete, [{ type: "INFERENCE", documentId: "d1" }])).toEqual(["evidence"]);
    expect(unmet(complete, [{ type: "INFERENCE", documentId: "d1" }, { type: "FACT", documentId: "d2" }])).toEqual([]);
  });

  it("does not count a field the AI drafted until a person has saved it", () => {
    const gate = evaluateHypothesisGate({ ...complete, aiDraftFields: ["hypothesis", "risks"] }, factFromDocument);
    expect(gate.met).toBe(false);
    const byKey = Object.fromEntries(gate.criteria.map((c) => [c.key, c]));
    expect(byKey.hypothesis.met).toBe(false);
    expect(byKey.hypothesis.reason).toMatch(/AI draft/i);
    expect(byKey.risks.met).toBe(false);
    expect(byKey.owner.met).toBe(true);
  });

  it("accepts the value when either the words or the figure are confirmed", () => {
    const both = { ...complete, estimatedAnnualValue: 1_000_000 };
    expect(unmet({ ...both, aiDraftFields: ["potentialValue"] })).toEqual([]);
    expect(unmet({ ...both, aiDraftFields: ["potentialValue", "estimatedAnnualValue"] })).toEqual(["value"]);
  });

  it("says where each gap is fixed and why it is a gap", () => {
    const gate = evaluateHypothesisGate(
      { ...complete, hypothesis: null, dependencies: null, owner: null },
      []
    );
    const byKey = Object.fromEntries(gate.criteria.map((c) => [c.key, c]));
    expect(byKey.hypothesis).toMatchObject({ met: false, fix: "reasoning" });
    expect(byKey.data).toMatchObject({ met: false, fix: "overview" });
    expect(byKey.owner).toMatchObject({ met: false, fix: "overview" });
    expect(byKey.evidence).toMatchObject({ met: false, fix: "evidence" });
    for (const c of gate.criteria.filter((c) => !c.met)) expect(c.reason).toBeTruthy();
    expect(byKey.problem.reason).toBeUndefined();
  });
});

describe("stage rules", () => {
  it("gates only the move from Qualified to Hypothesis", () => {
    expect(GATED_MOVES).toEqual([{ from: "QUALIFIED", to: "HYPOTHESIS" }]);
    expect(isGatedMove("QUALIFIED", "HYPOTHESIS")).toBe(true);
    expect(isGatedMove("QUALIFIED", "REJECTED")).toBe(false);
    expect(isGatedMove("HYPOTHESIS", "EXPERIMENT")).toBe(false);
  });

  it("asks for a reason before the final moves", () => {
    expect(REASON_REQUIRED_STATUSES).toEqual(["REJECTED", "NO_AI", "PROVEN"]);
    expect(requiresReason("REJECTED")).toBe(true);
    expect(requiresReason("DEFERRED")).toBe(false);
  });

  it("publishes the stages with readable labels and what each can move to", () => {
    const catalog = stageCatalog();
    expect(catalog.map((s) => s.status)).toEqual([
      "DISCOVERED", "QUALIFIED", "HYPOTHESIS", "EXPERIMENT", "PROVING", "PROVEN", "REJECTED", "DEFERRED", "NO_AI",
    ]);
    const qualified = catalog.find((s) => s.status === "QUALIFIED")!;
    expect(qualified.label).toBe("Qualified");
    expect(qualified.terminal).toBe(false);
    expect(qualified.next).toEqual([
      { status: "HYPOTHESIS", label: "Hypothesis", requiresReason: false, gated: true },
      { status: "NO_AI", label: "No AI needed", requiresReason: true, gated: false },
      { status: "REJECTED", label: "Rejected", requiresReason: true, gated: false },
      { status: "DEFERRED", label: "Deferred", requiresReason: false, gated: false },
    ]);
    expect(catalog.find((s) => s.status === "REJECTED")).toMatchObject({ terminal: true, next: [] });
    expect(catalog.find((s) => s.status === "DEFERRED")!.terminal).toBe(false);
  });
});
