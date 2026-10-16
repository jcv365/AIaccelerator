import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createOpportunitiesRouter } from "../../src/domain/opportunities.js";

type Mock = ReturnType<typeof vi.fn>;

const completeQualified = {
  id: "o1",
  title: "Claims triage",
  status: "QUALIFIED",
  businessProblem: "Claims triage is manual and takes twelve days on average, which delays settlements.",
  owner: "Thandi M.",
  potentialValue: "Faster settlements",
  estimatedAnnualValue: null,
  hypothesis: "We believe triage will cut claim time, measured by days to settle.",
  dependencies: "Claims history",
  aiSuitability: "Text classification fits",
  risks: "Data quality",
  aiDraftFields: [] as string[],
};
const factFromDocument = [{ type: "FACT", documentId: "d1" }];

function setup(opp: Record<string, unknown> | null, evidence: unknown[] = factFromDocument) {
  const update = vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...opp, ...data }));
  const decisionCreate = vi.fn().mockResolvedValue({ id: "dec1" });
  const evidenceFindMany = vi.fn().mockResolvedValue(evidence);
  const prisma: Record<string, unknown> = {
    opportunity: { findUnique: vi.fn().mockResolvedValue(opp), update },
    evidence: { findMany: evidenceFindMany },
    decision: { create: decisionCreate },
  };
  prisma.$transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  const app = express();
  app.use(express.json());
  app.use("/opportunities", createOpportunitiesRouter(prisma as never));
  return { app, update: update as Mock, decisionCreate: decisionCreate as Mock, evidenceFindMany: evidenceFindMany as Mock };
}

describe("GET /opportunities/stages", () => {
  it("publishes the stages so the client does not keep its own copy", async () => {
    const res = await request(setup(null).app).get("/opportunities/stages");
    expect(res.status).toBe(200);
    expect(res.body.stages).toHaveLength(9);
    const qualified = res.body.stages.find((s: { status: string }) => s.status === "QUALIFIED");
    expect(qualified.next).toContainEqual({ status: "HYPOTHESIS", label: "Hypothesis", requiresReason: false, gated: true });
    expect(qualified.next).toContainEqual(expect.objectContaining({ status: "REJECTED", requiresReason: true }));
  });
});

describe("GET /opportunities/:id/gate", () => {
  it("returns the checklist for the move a Qualified opportunity is waiting on", async () => {
    const res = await request(setup(completeQualified).app).get("/opportunities/o1/gate");
    expect(res.status).toBe(200);
    expect(res.body.gate).toMatchObject({ to: "HYPOTHESIS", met: true });
    expect(res.body.gate.criteria).toHaveLength(8);
  });

  it("lists what is missing", async () => {
    const res = await request(setup({ ...completeQualified, owner: null }, []).app).get("/opportunities/o1/gate");
    expect(res.body.gate.met).toBe(false);
    expect(res.body.gate.criteria.filter((c: { met: boolean }) => !c.met).map((c: { key: string }) => c.key)).toEqual(["owner", "evidence"]);
  });

  it("returns no gate for an opportunity that is not waiting on one", async () => {
    const res = await request(setup({ ...completeQualified, status: "HYPOTHESIS" }).app).get("/opportunities/o1/gate");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ gate: null });
  });

  it("answers 404 for an unknown opportunity", async () => {
    expect((await request(setup(null).app).get("/opportunities/nope/gate")).status).toBe(404);
  });
});

describe("PATCH /opportunities/:id/status: the Hypothesis gate", () => {
  it("refuses the move with the checklist when the gate is not met", async () => {
    const { app, update } = setup({ ...completeQualified, dependencies: null }, []);
    const res = await request(app).patch("/opportunities/o1/status").send({ status: "HYPOTHESIS" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("GATE_UNMET");
    expect(res.body.error.criteria.filter((c: { met: boolean }) => !c.met).map((c: { key: string }) => c.key)).toEqual(["data", "evidence"]);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a gate that is only met by an AI draft nobody has saved", async () => {
    const { app, update } = setup({ ...completeQualified, aiDraftFields: ["risks"] });
    const res = await request(app).patch("/opportunities/o1/status").send({ status: "HYPOTHESIS" });
    expect(res.status).toBe(422);
    expect(update).not.toHaveBeenCalled();
  });

  it("makes the move when the gate is met", async () => {
    const { app, update } = setup(completeQualified);
    const res = await request(app).patch("/opportunities/o1/status").send({ status: "HYPOTHESIS" });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "HYPOTHESIS" } });
  });

  it("does not look at evidence for moves that have no gate", async () => {
    const { app, evidenceFindMany } = setup({ ...completeQualified, status: "DISCOVERED" });
    const res = await request(app).patch("/opportunities/o1/status").send({ status: "QUALIFIED" });
    expect(res.status).toBe(200);
    expect(evidenceFindMany).not.toHaveBeenCalled();
  });

  it("still reports an impossible move as INVALID_TRANSITION before anything else", async () => {
    const { app } = setup({ ...completeQualified, status: "DISCOVERED" });
    const res = await request(app).patch("/opportunities/o1/status").send({ status: "PROVEN", reason: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });
});

describe("PATCH /opportunities/:id/status: reasons", () => {
  it.each(["REJECTED", "NO_AI"])("requires a reason to move to %s", async (status) => {
    const { app, update } = setup(completeQualified);
    for (const body of [{ status }, { status, reason: "   " }, { status, reason: 7 }]) {
      const res = await request(app).patch("/opportunities/o1/status").send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(update).not.toHaveBeenCalled();
  });

  it("requires a reason to prove an opportunity", async () => {
    const { app, update } = setup({ ...completeQualified, status: "PROVING" });
    expect((await request(app).patch("/opportunities/o1/status").send({ status: "PROVEN" })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("saves the reason as a decision together with the move", async () => {
    const { app, update, decisionCreate } = setup(completeQualified);
    const res = await request(app).patch("/opportunities/o1/status").send({ status: "REJECTED", reason: "  No usable data  " });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "REJECTED" } });
    expect(decisionCreate).toHaveBeenCalledWith({
      data: { opportunityId: "o1", decision: "Moved to Rejected", rationale: "No usable data" },
    });
  });

  it("also records a reason given for a move that does not need one", async () => {
    const { app, decisionCreate } = setup(completeQualified);
    await request(app).patch("/opportunities/o1/status").send({ status: "DEFERRED", reason: "Waiting for budget" });
    expect(decisionCreate).toHaveBeenCalledWith({
      data: { opportunityId: "o1", decision: "Moved to Deferred", rationale: "Waiting for budget" },
    });
  });

  it("makes no decision record when no reason is given for an ordinary move", async () => {
    const { app, decisionCreate } = setup({ ...completeQualified, status: "DISCOVERED" });
    await request(app).patch("/opportunities/o1/status").send({ status: "QUALIFIED" });
    expect(decisionCreate).not.toHaveBeenCalled();
  });

  it("limits the reason to 1000 characters", async () => {
    const { app } = setup(completeQualified);
    const res = await request(app).patch("/opportunities/o1/status").send({ status: "REJECTED", reason: "r".repeat(1001) });
    expect(res.status).toBe(400);
  });
});
