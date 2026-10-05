import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { ExperimentStatus } from "@prisma/client";
import { createOpportunitiesRouter } from "../../src/domain/opportunities.js";
import { EXPERIMENT_STATUSES } from "../../src/domain/experimentStatus.js";
// Drift guard: the client keeps its own copy of the list (it cannot import the Prisma enum).
import { EXPERIMENT_STATUSES as CLIENT_EXPERIMENT_STATUSES } from "../../../client/src/domain/experimentStatus";

function makePrisma(overrides: Record<string, unknown> = {}) {
  const prisma: Record<string, unknown> = {
    opportunity: { update: vi.fn().mockResolvedValue({ id: "o1" }), findUnique: vi.fn().mockResolvedValue({ id: "o1", status: "DISCOVERED" }) },
    experiment: {
      findFirst: vi.fn().mockResolvedValue({ id: "e1", opportunityId: "o1" }),
      update: vi.fn().mockResolvedValue({ id: "e1" }),
      delete: vi.fn().mockReturnValue(Promise.resolve({ id: "e1" })),
    },
    learning: {
      findFirst: vi.fn().mockResolvedValue({ id: "l1", experimentId: "e1" }),
      update: vi.fn().mockResolvedValue({ id: "l1", insight: "new" }),
      delete: vi.fn().mockResolvedValue({ id: "l1" }),
      deleteMany: vi.fn().mockReturnValue(Promise.resolve({ count: 2 })),
    },
    ...overrides,
  };
  prisma.$transaction = vi.fn((ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : (ops as (tx: unknown) => unknown)(prisma)));
  return prisma;
}

function appWith(prisma: unknown) {
  const app = express();
  app.use(express.json());
  app.use("/opportunities", createOpportunitiesRouter(prisma as never));
  return app;
}

const mock = (o: unknown, k: string, m: string) => ((o as Record<string, Record<string, ReturnType<typeof vi.fn>>>)[k])[m];

describe("experiment status single source of truth", () => {
  it("server list equals the Prisma enum", () => {
    expect([...EXPERIMENT_STATUSES].sort()).toEqual(Object.values(ExperimentStatus).sort());
  });

  it("client list equals the server list (fails if either side adds a status without the other)", () => {
    expect([...CLIENT_EXPERIMENT_STATUSES].sort()).toEqual([...EXPERIMENT_STATUSES].sort());
  });
});

describe("DELETE /opportunities/:id/experiments/:experimentId", () => {
  it("returns 404 and deletes nothing when the experiment is not under this opportunity", async () => {
    const prisma = makePrisma();
    mock(prisma, "experiment", "findFirst").mockResolvedValue(null);
    const res = await request(appWith(prisma)).delete("/opportunities/o1/experiments/e9");
    expect(res.status).toBe(404);
    expect(mock(prisma, "experiment", "findFirst")).toHaveBeenCalledWith({ where: { id: "e9", opportunityId: "o1" } });
    expect(mock(prisma, "experiment", "delete")).not.toHaveBeenCalled();
  });

  it("deletes the experiment's learnings and the experiment together, returning 204", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma)).delete("/opportunities/o1/experiments/e1");
    expect(res.status).toBe(204);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(mock(prisma, "learning", "deleteMany")).toHaveBeenCalledWith({ where: { experimentId: "e1" } });
    expect(mock(prisma, "experiment", "delete")).toHaveBeenCalledWith({ where: { id: "e1" } });
  });
});

describe("PATCH /opportunities/:id/experiments/:experimentId/learnings/:learningId", () => {
  it("scopes the lookup to this experiment AND opportunity, 404 when missing", async () => {
    const prisma = makePrisma();
    mock(prisma, "learning", "findFirst").mockResolvedValue(null);
    const res = await request(appWith(prisma))
      .patch("/opportunities/o1/experiments/e1/learnings/l9")
      .send({ insight: "x" });
    expect(res.status).toBe(404);
    expect(mock(prisma, "learning", "findFirst")).toHaveBeenCalledWith({
      where: { id: "l9", experimentId: "e1", experiment: { opportunityId: "o1" } },
    });
    expect(mock(prisma, "learning", "update")).not.toHaveBeenCalled();
  });

  it("rejects a blank or non-string insight with 400", async () => {
    const prisma = makePrisma();
    for (const insight of ["   ", 5, null, undefined]) {
      const res = await request(appWith(prisma))
        .patch("/opportunities/o1/experiments/e1/learnings/l1")
        .send({ insight });
      expect(res.status).toBe(400);
    }
    expect(mock(prisma, "learning", "update")).not.toHaveBeenCalled();
  });

  it("updates the insight and returns it", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma))
      .patch("/opportunities/o1/experiments/e1/learnings/l1")
      .send({ insight: "new" });
    expect(res.status).toBe(200);
    expect(mock(prisma, "learning", "update")).toHaveBeenCalledWith({ where: { id: "l1" }, data: { insight: "new" } });
  });
});

describe("DELETE /opportunities/:id/experiments/:experimentId/learnings/:learningId", () => {
  it("404s when the learning is not under this experiment/opportunity", async () => {
    const prisma = makePrisma();
    mock(prisma, "learning", "findFirst").mockResolvedValue(null);
    const res = await request(appWith(prisma)).delete("/opportunities/o1/experiments/e1/learnings/l9");
    expect(res.status).toBe(404);
    expect(mock(prisma, "learning", "delete")).not.toHaveBeenCalled();
  });

  it("deletes it and returns 204", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma)).delete("/opportunities/o1/experiments/e1/learnings/l1");
    expect(res.status).toBe(204);
    expect(mock(prisma, "learning", "delete")).toHaveBeenCalledWith({ where: { id: "l1" } });
  });
});

describe("clearing fields back to null", () => {
  it("lets PATCH experiment clear resultSummary, success and the dates with null", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma))
      .patch("/opportunities/o1/experiments/e1")
      .send({ resultSummary: null, success: null, startedAt: null, completedAt: null });
    expect(res.status).toBe(200);
    expect(mock(prisma, "experiment", "update")).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { resultSummary: null, success: null, startedAt: null, completedAt: null },
    });
  });

  it("still rejects wrong types for experiment fields", async () => {
    const prisma = makePrisma();
    for (const body of [{ resultSummary: 5 }, { success: "yes" }, { startedAt: 5 }, { title: null }, { method: null }]) {
      const res = await request(appWith(prisma)).patch("/opportunities/o1/experiments/e1").send(body);
      expect(res.status).toBe(400);
    }
  });

  it("lets PATCH opportunity clear optional text fields with null but never the title", async () => {
    const prisma = makePrisma();
    const ok = await request(appWith(prisma)).patch("/opportunities/o1").send({ description: null, risks: null });
    expect(ok.status).toBe(200);
    expect(mock(prisma, "opportunity", "update")).toHaveBeenCalledWith(
      expect.objectContaining({ data: { description: null, risks: null } })
    );

    const bad = await request(appWith(prisma)).patch("/opportunities/o1").send({ title: null });
    expect(bad.status).toBe(400);
  });
});
