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
