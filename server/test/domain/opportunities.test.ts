import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createOpportunitiesRouter } from "../../src/domain/opportunities.js";
import { AiClientError } from "../../src/ai/errors.js";

function appWithPrisma(prisma: unknown) {
  const app = express();
  app.use(express.json());
  app.use("/opportunities", createOpportunitiesRouter(prisma as never));
  return app;
}

function appWithPrismaAndAi(prisma: unknown, aiClient?: unknown) {
  const app = express();
  app.use(express.json());
  app.use("/opportunities", createOpportunitiesRouter(prisma as never, aiClient as never));
  return app;
}

describe("GET /opportunities", () => {
  it("returns the list ordered newest first", async () => {
    const prisma = {
      opportunity: {
        findMany: vi.fn().mockResolvedValue([{ id: "1", title: "A" }]),
      },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).get("/opportunities");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "1", title: "A" }]);
    expect(prisma.opportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    );
  });
});

describe("POST /opportunities", () => {
  it("returns 400 VALIDATION_ERROR when title is missing", async () => {
    const prisma = { opportunity: { create: vi.fn() } };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.opportunity.create).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR when a field has the wrong type", async () => {
    const prisma = { opportunity: { create: vi.fn() } };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities").send({ title: "x", description: 42 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.opportunity.create).not.toHaveBeenCalled();
  });

  it("creates an opportunity and returns 201", async () => {
    const created = { id: "1", title: "New idea", status: "DISCOVERED" };
    const prisma = { opportunity: { create: vi.fn().mockResolvedValue(created) } };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities").send({ title: "New idea" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
  });
});

describe("GET /opportunities/:id", () => {
  it("returns 404 NOT_FOUND when the opportunity doesn't exist", async () => {
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(null) } };
    const app = appWithPrisma(prisma);

    const res = await request(app).get("/opportunities/nope");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns the opportunity with nested evidence/decisions", async () => {
    const found = { id: "1", title: "A", evidence: [], decisions: [], experiments: [] };
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(found) } };
    const app = appWithPrisma(prisma);

    const res = await request(app).get("/opportunities/1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(found);
    expect(prisma.opportunity.findUnique).toHaveBeenCalledWith({
      where: { id: "1" },
      include: {
        evidence: true,
        decisions: true,
        experiments: { orderBy: { createdAt: "asc" }, include: { learnings: { orderBy: { createdAt: "asc" } } } },
      },
    });
  });
});

describe("PATCH /opportunities/:id", () => {
  it("returns 404 NOT_FOUND when the opportunity doesn't exist", async () => {
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/nope").send({ title: "X" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it("updates and returns the opportunity", async () => {
    const updated = { id: "1", title: "Updated" };
    const prisma = {
      opportunity: {
        findUnique: vi.fn().mockResolvedValue({ id: "1", title: "Old" }),
        update: vi.fn().mockResolvedValue(updated),
      },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/1").send({ title: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
  });
});

describe("PATCH /opportunities/:id/status", () => {
  it("returns 404 NOT_FOUND when the opportunity doesn't exist", async () => {
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() } };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/nope/status").send({ status: "QUALIFIED" });

    expect(res.status).toBe(404);
  });

  it("returns 400 INVALID_TRANSITION for an illegal jump", async () => {
    const prisma = {
      opportunity: {
        findUnique: vi.fn().mockResolvedValue({ id: "1", status: "DISCOVERED" }),
        update: vi.fn(),
      },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/1/status").send({ status: "PROVEN" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it("applies a valid transition", async () => {
    const updated = { id: "1", status: "QUALIFIED" };
    const prisma = {
      opportunity: {
        findUnique: vi.fn().mockResolvedValue({ id: "1", status: "DISCOVERED" }),
        update: vi.fn().mockResolvedValue(updated),
      },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/1/status").send({ status: "QUALIFIED" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(prisma.opportunity.update).toHaveBeenCalledWith({
      where: { id: "1" },
      data: { status: "QUALIFIED" },
    });
  });
});

describe("POST /opportunities/:id/evidence", () => {
  it("returns 404 NOT_FOUND when the opportunity doesn't exist", async () => {
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(null) }, evidence: { create: vi.fn() } };
    const app = appWithPrisma(prisma);

    const res = await request(app)
      .post("/opportunities/nope/evidence")
      .send({ claim: "x", type: "FACT" });

    expect(res.status).toBe(404);
  });

  it("returns 400 VALIDATION_ERROR for an invalid type", async () => {
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1" }) },
      evidence: { create: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app)
      .post("/opportunities/1/evidence")
      .send({ claim: "x", type: "NOT_A_TYPE" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.evidence.create).not.toHaveBeenCalled();
  });

  it("creates evidence and returns 201", async () => {
    const created = { id: "e1", claim: "x", type: "FACT" };
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1" }) },
      evidence: { create: vi.fn().mockResolvedValue(created) },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/1/evidence").send({ claim: "x", type: "FACT" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
  });
});

describe("POST /opportunities/:id/decisions", () => {
  it("returns 404 NOT_FOUND when the opportunity doesn't exist", async () => {
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(null) }, decision: { create: vi.fn() } };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/nope/decisions").send({ decision: "Proceed" });

    expect(res.status).toBe(404);
  });

  it("returns 400 VALIDATION_ERROR when decision text is missing", async () => {
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1" }) },
      decision: { create: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/1/decisions").send({});

    expect(res.status).toBe(400);
    expect(prisma.decision.create).not.toHaveBeenCalled();
  });

  it("creates a decision and returns 201", async () => {
    const created = { id: "d1", decision: "Proceed" };
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1" }) },
      decision: { create: vi.fn().mockResolvedValue(created) },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/1/decisions").send({ decision: "Proceed" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
  });
});

describe("POST /opportunities/:id/report", () => {
  it("returns 404 NOT_FOUND when the opportunity doesn't exist", async () => {
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(null) } };
    const app = appWithPrismaAndAi(prisma, { quickAsk: vi.fn() });

    const res = await request(app).post("/opportunities/nope/report").send({});

    expect(res.status).toBe(404);
  });

  it("returns 503 AI_NOT_CONFIGURED when no aiClient is provided", async () => {
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1", title: "X", evidence: [], decisions: [] }) },
    };
    const app = appWithPrismaAndAi(prisma, undefined);

    const res = await request(app).post("/opportunities/1/report").send({});

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("returns a generated report on success, including evidence/decisions in the prompt", async () => {
    const opportunity = {
      id: "1",
      title: "Contract renewals",
      description: "desc",
      businessProblem: "problem",
      status: "QUALIFIED",
      evidence: [{ type: "FACT", claim: "Volume is high" }],
      decisions: [{ decision: "Proceed", rationale: "Strong evidence" }],
    };
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(opportunity) } };
    const quickAsk = vi.fn().mockResolvedValue({ ok: true, model: "Claude", response: "A generated report." });
    const app = appWithPrismaAndAi(prisma, { quickAsk });

    const res = await request(app).post("/opportunities/1/report").send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ report: "A generated report." });
    expect(quickAsk).toHaveBeenCalledWith(
      "Fusion",
      expect.any(String),
      expect.stringContaining("Volume is high"),
      90_000
    );
  });

  it("maps an AiClientError to the matching HTTP status", async () => {
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1", title: "X", evidence: [], decisions: [] }) },
    };
    const quickAsk = vi.fn().mockRejectedValue(new AiClientError("AI_BUSY", "busy"));
    const app = appWithPrismaAndAi(prisma, { quickAsk });

    const res = await request(app).post("/opportunities/1/report").send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("AI_BUSY");
  });
});

describe("POST /opportunities/:id/experiments", () => {
  it("returns 404 NOT_FOUND when the opportunity doesn't exist", async () => {
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(null) } };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/nope/experiments").send({ title: "T", method: "M" });

    expect(res.status).toBe(404);
  });

  it("returns 400 VALIDATION_ERROR when title or method is missing", async () => {
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1" }) },
      experiment: { create: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/1/experiments").send({ title: "T" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.experiment.create).not.toHaveBeenCalled();
  });

  it("creates an experiment with status PLANNED", async () => {
    const created = { id: "e1", opportunityId: "1", title: "T", method: "M", status: "PLANNED" };
    const prisma = {
      opportunity: { findUnique: vi.fn().mockResolvedValue({ id: "1" }) },
      experiment: { create: vi.fn().mockResolvedValue(created) },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/1/experiments").send({ title: "T", method: "M" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(prisma.experiment.create).toHaveBeenCalledWith({
      data: { opportunityId: "1", title: "T", method: "M" },
    });
  });
});

describe("PATCH /opportunities/:id/experiments/:experimentId", () => {
  it("returns 404 NOT_FOUND when the experiment doesn't exist or doesn't belong to the opportunity", async () => {
    const prisma = {
      experiment: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/1/experiments/nope").send({ status: "RUNNING" });

    expect(res.status).toBe(404);
    expect(prisma.experiment.update).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR for an invalid status value", async () => {
    const prisma = {
      experiment: { findFirst: vi.fn().mockResolvedValue({ id: "e1", opportunityId: "1" }), update: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/1/experiments/e1").send({ status: "NOT_A_STATUS" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.experiment.update).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR when success is not a boolean", async () => {
    const prisma = {
      experiment: { findFirst: vi.fn().mockResolvedValue({ id: "e1", opportunityId: "1" }), update: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/1/experiments/e1").send({ success: "yes" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.experiment.update).not.toHaveBeenCalled();
  });

  it("updates the experiment with valid fields", async () => {
    const updated = { id: "e1", opportunityId: "1", status: "COMPLETE", resultSummary: "Worked", success: true };
    const prisma = {
      experiment: {
        findFirst: vi.fn().mockResolvedValue({ id: "e1", opportunityId: "1" }),
        update: vi.fn().mockResolvedValue(updated),
      },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app)
      .patch("/opportunities/1/experiments/e1")
      .send({ status: "COMPLETE", resultSummary: "Worked", success: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(prisma.experiment.findFirst).toHaveBeenCalledWith({
      where: { id: "e1", opportunityId: "1" },
    });
    expect(prisma.experiment.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { status: "COMPLETE", resultSummary: "Worked", success: true },
    });
  });

  it("returns 400 VALIDATION_ERROR when startedAt is not a parseable date", async () => {
    const prisma = {
      experiment: { findFirst: vi.fn().mockResolvedValue({ id: "e1", opportunityId: "1" }), update: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).patch("/opportunities/1/experiments/e1").send({ startedAt: "not-a-date" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.experiment.update).not.toHaveBeenCalled();
  });
});

describe("POST /opportunities/:id/experiments/:experimentId/learnings", () => {
  it("returns 404 NOT_FOUND when the experiment doesn't exist or doesn't belong to the opportunity", async () => {
    const prisma = {
      experiment: { findFirst: vi.fn().mockResolvedValue(null) },
      learning: { create: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app)
      .post("/opportunities/1/experiments/nope/learnings")
      .send({ insight: "Something" });

    expect(res.status).toBe(404);
    expect(prisma.learning.create).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR when insight is missing", async () => {
    const prisma = {
      experiment: { findFirst: vi.fn().mockResolvedValue({ id: "e1", opportunityId: "1" }) },
      learning: { create: vi.fn() },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app).post("/opportunities/1/experiments/e1/learnings").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prisma.learning.create).not.toHaveBeenCalled();
  });

  it("creates a learning linked to the experiment", async () => {
    const created = { id: "l1", experimentId: "e1", insight: "It worked" };
    const prisma = {
      experiment: { findFirst: vi.fn().mockResolvedValue({ id: "e1", opportunityId: "1" }) },
      learning: { create: vi.fn().mockResolvedValue(created) },
    };
    const app = appWithPrisma(prisma);

    const res = await request(app)
      .post("/opportunities/1/experiments/e1/learnings")
      .send({ insight: "It worked" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(created);
    expect(prisma.experiment.findFirst).toHaveBeenCalledWith({
      where: { id: "e1", opportunityId: "1" },
    });
    expect(prisma.learning.create).toHaveBeenCalledWith({ data: { experimentId: "e1", insight: "It worked" } });
  });
});

describe("GET /opportunities/:id (experiments include)", () => {
  it("includes experiments with nested learnings", async () => {
    const opportunity = {
      id: "1",
      title: "X",
      evidence: [],
      decisions: [],
      experiments: [{ id: "e1", title: "T", learnings: [{ id: "l1", insight: "It worked" }] }],
    };
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(opportunity) } };
    const app = appWithPrisma(prisma);

    const res = await request(app).get("/opportunities/1");

    expect(res.status).toBe(200);
    expect(res.body.experiments).toEqual(opportunity.experiments);
    expect(prisma.opportunity.findUnique).toHaveBeenCalledWith({
      where: { id: "1" },
      include: {
        evidence: true,
        decisions: true,
        experiments: { orderBy: { createdAt: "asc" }, include: { learnings: { orderBy: { createdAt: "asc" } } } },
      },
    });
  });
});
