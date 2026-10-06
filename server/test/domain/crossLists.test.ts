import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createEvidenceListRouter, createExperimentsListRouter } from "../../src/domain/crossLists.js";

function appWith(prisma: unknown) {
  const app = express();
  app.use("/evidence", createEvidenceListRouter(prisma as never));
  app.use("/experiments", createExperimentsListRouter(prisma as never));
  return app;
}

describe("GET /evidence", () => {
  it("returns evidence across opportunities, newest first, with the source opportunity", async () => {
    const rows = [{ id: "e1", claim: "c", type: "FACT", opportunity: { id: "o1", title: "A" } }];
    const prisma = { evidence: { findMany: vi.fn().mockResolvedValue(rows) } };

    const res = await request(appWith(prisma)).get("/evidence");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(prisma.evidence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { capturedAt: "desc" },
        include: { opportunity: { select: { id: true, title: true } } },
      })
    );
  });
});

describe("GET /experiments", () => {
  it("returns experiments across opportunities with opportunity and learning count", async () => {
    const rows = [{ id: "x1", title: "t", status: "RUNNING", opportunity: { id: "o1", title: "A" }, _count: { learnings: 2 } }];
    const prisma = { experiment: { findMany: vi.fn().mockResolvedValue(rows) } };

    const res = await request(appWith(prisma)).get("/experiments");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(prisma.experiment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    );
  });

  it("asks for the opportunity's category so the pipeline cards can show it", async () => {
    const prisma = { experiment: { findMany: vi.fn().mockResolvedValue([]) } };

    await request(appWith(prisma)).get("/experiments");

    expect(prisma.experiment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ opportunity: { select: { id: true, title: true, category: true } } }),
      })
    );
  });
});
