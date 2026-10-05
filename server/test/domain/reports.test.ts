import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createOpportunitiesRouter } from "../../src/domain/opportunities.js";

const opportunity = { id: "o1", title: "T", description: "d", businessProblem: "b", status: "DISCOVERED", evidence: [], decisions: [] };

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    opportunity: { findUnique: vi.fn().mockResolvedValue(opportunity) },
    opportunityReport: {
      create: vi.fn().mockResolvedValue({ id: "r1", content: "A generated report.", model: "Fusion", createdAt: new Date("2026-10-05T10:00:00Z") }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  };
}

function appWith(prisma: unknown, quickAsk = vi.fn().mockResolvedValue({ ok: true, model: "Fusion", response: "A generated report." })) {
  const app = express();
  app.use(express.json());
  app.use("/opportunities", createOpportunitiesRouter(prisma as never, { quickAsk, runSession: vi.fn() } as never));
  return app;
}

const reportMock = (p: unknown, m: string) => (p as { opportunityReport: Record<string, ReturnType<typeof vi.fn>> }).opportunityReport[m];

describe("POST /opportunities/:id/report persistence", () => {
  it("saves the generated report and returns it with its timestamp", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma)).post("/opportunities/o1/report");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ report: "A generated report.", createdAt: "2026-10-05T10:00:00.000Z" });
    expect(reportMock(prisma, "create")).toHaveBeenCalledWith({
      data: { opportunityId: "o1", content: "A generated report.", model: "Fusion" },
    });
  });

  it("still returns the report (unsaved) if saving it fails, so a database hiccup never loses an expensive AI answer", async () => {
    const prisma = makePrisma();
    reportMock(prisma, "create").mockRejectedValue(new Error("db down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(appWith(prisma)).post("/opportunities/o1/report");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ report: "A generated report.", createdAt: null });
    error.mockRestore();
  });

  it("does not save anything when the AI call fails", async () => {
    const prisma = makePrisma();
    const quickAsk = vi.fn().mockRejectedValue(new Error("boom"));
    const res = await request(appWith(prisma, quickAsk)).post("/opportunities/o1/report");

    expect(res.status).toBe(500);
    expect(reportMock(prisma, "create")).not.toHaveBeenCalled();
  });
});

describe("GET /opportunities/:id/report", () => {
  it("returns 404 when the opportunity has no saved report", async () => {
    const res = await request(appWith(makePrisma())).get("/opportunities/o1/report");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns the newest saved report, looked up for this opportunity only", async () => {
    const prisma = makePrisma();
    reportMock(prisma, "findFirst").mockResolvedValue({
      id: "r2",
      content: "Saved report",
      model: "Fusion",
      createdAt: new Date("2026-10-05T11:00:00Z"),
    });

    const res = await request(appWith(prisma)).get("/opportunities/o1/report");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ report: "Saved report", model: "Fusion", createdAt: "2026-10-05T11:00:00.000Z" });
    expect(reportMock(prisma, "findFirst")).toHaveBeenCalledWith({
      where: { opportunityId: "o1" },
      orderBy: { createdAt: "desc" },
    });
  });
});
