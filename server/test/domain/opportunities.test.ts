import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createOpportunitiesRouter } from "../../src/domain/opportunities.js";

function appWithPrisma(prisma: unknown) {
  const app = express();
  app.use(express.json());
  app.use("/opportunities", createOpportunitiesRouter(prisma as never));
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
    const found = { id: "1", title: "A", evidence: [], decisions: [] };
    const prisma = { opportunity: { findUnique: vi.fn().mockResolvedValue(found) } };
    const app = appWithPrisma(prisma);

    const res = await request(app).get("/opportunities/1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(found);
    expect(prisma.opportunity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "1" }, include: { evidence: true, decisions: true } })
    );
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
