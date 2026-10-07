import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createAnalysisRouter } from "../../src/domain/analysis.js";

function makePrisma(overrides: Record<string, unknown> = {}) {
  const prisma: Record<string, unknown> = {
    analysisJob: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "job1", status: "QUEUED", companyName: "Maersk" }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(1),
    },
    company: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "co1", ...data })),
    },
    opportunity: { create: vi.fn().mockResolvedValue({ id: "opp1" }) },
    evidence: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
  prisma.$transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

function appWith(prisma: unknown, aiClient?: unknown) {
  const app = express();
  app.use(express.json());
  app.use("/opportunities/analyze", createAnalysisRouter(prisma as never, aiClient as never));
  return app;
}

describe("POST /opportunities/analyze", () => {
  it("returns 503 when no AI client is configured", async () => {
    const res = await request(appWith(makePrisma())).post("/opportunities/analyze").send({ companyName: "Maersk" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("returns 400 for a missing, blank or oversized company name", async () => {
    const app = appWith(makePrisma(), { startSession: vi.fn() });
    for (const body of [{}, { companyName: "   " }, { companyName: 5 }, { companyName: "x".repeat(201) }]) {
      const res = await request(app).post("/opportunities/analyze").send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 409 with the existing job id when the same company already has an analysis queued or running", async () => {
    const prisma = makePrisma({
      company: { findUnique: vi.fn().mockResolvedValue({ id: "co1", name: "Maersk" }), create: vi.fn() },
    });
    (prisma.analysisJob as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({ id: "active1" });
    const res = await request(appWith(prisma, { startSession: vi.fn() }))
      .post("/opportunities/analyze")
      .send({ companyName: "Maersk" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "ANALYSIS_IN_PROGRESS", jobId: "active1" });
    expect((prisma.analysisJob as { create: ReturnType<typeof vi.fn> }).create).not.toHaveBeenCalled();
    expect((prisma.analysisJob as { findFirst: ReturnType<typeof vi.fn> }).findFirst).toHaveBeenCalledWith({
      where: { companyId: "co1", status: { in: ["QUEUED", "RUNNING"] } },
    });
  });

  it("queues instead of refusing when a different company's analysis is running", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma, { startSession: vi.fn() }))
      .post("/opportunities/analyze")
      .send({ companyName: "Cassava" });
    expect(res.status).toBe(202);
    expect((prisma.analysisJob as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalled();
  });

  it("queues a job and returns 202 with its queue position, without contacting the AI", async () => {
    const prisma = makePrisma();
    const aiClient = { startSession: vi.fn(), getSession: vi.fn() };
    const res = await request(appWith(prisma, aiClient)).post("/opportunities/analyze").send({ companyName: " Maersk " });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: "job1", status: "QUEUED", companyId: "co1", queuePosition: 1 });
    expect((prisma.analysisJob as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledWith({
      data: { companyName: "Maersk", companyId: "co1" },
    });
    expect(aiClient.startSession).not.toHaveBeenCalled();
  });

  it("snapshots the company's stored context onto the job", async () => {
    const stored = { id: "co1", name: "Cassava", website: "https://cassava.com", description: "Pan-African group", industry: null, focusAreas: ["Operations"], notes: null };
    const prisma = makePrisma({
      company: { findUnique: vi.fn().mockResolvedValue(stored), create: vi.fn() },
    });
    const res = await request(appWith(prisma, { startSession: vi.fn() }))
      .post("/opportunities/analyze")
      .send({ companyId: "co1" });
    expect(res.status).toBe(202);
    expect((prisma.analysisJob as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledWith({
      data: {
        companyName: "Cassava",
        companyId: "co1",
        context: { website: "https://cassava.com", description: "Pan-African group", focusAreas: ["Operations"] },
      },
    });
  });

  it("uses an explicit context from the request instead of the company's stored fields", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma, { startSession: vi.fn() }))
      .post("/opportunities/analyze")
      .send({ companyName: "Cassava", context: { industry: "Telecoms", notes: "Churn is the pain point" } });
    expect(res.status).toBe(202);
    expect((prisma.analysisJob as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledWith({
      data: { companyName: "Cassava", companyId: "co1", context: { industry: "Telecoms", notes: "Churn is the pain point" } },
    });
  });

  it("returns 400 for an invalid context and creates nothing", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma, { startSession: vi.fn() }))
      .post("/opportunities/analyze")
      .send({ companyName: "Cassava", context: { industry: "x".repeat(101) } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect((prisma.analysisJob as { create: ReturnType<typeof vi.fn> }).create).not.toHaveBeenCalled();
  });
});

describe("GET /opportunities/analyze/:jobId", () => {
  it("returns 404 for an unknown job", async () => {
    const res = await request(appWith(makePrisma(), { startSession: vi.fn() })).get("/opportunities/analyze/nope");
    expect(res.status).toBe(404);
  });

  it("returns the job status with an opportunitiesFound count", async () => {
    const prisma = makePrisma();
    (prisma.analysisJob as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValue({
      id: "job1",
      companyName: "Maersk",
      status: "SUCCEEDED",
      opportunityIds: ["a", "b"],
      errorCode: null,
      errorMessage: null,
      createdAt: new Date("2026-10-04T10:00:00Z"),
      startedAt: new Date("2026-10-04T10:00:01Z"),
      completedAt: new Date("2026-10-04T10:05:00Z"),
    });
    const res = await request(appWith(prisma, { startSession: vi.fn() })).get("/opportunities/analyze/job1");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "job1", status: "SUCCEEDED", opportunitiesFound: 2, opportunityIds: ["a", "b"] });
  });

  it("returns the stage, progress and elapsed time of a running job", async () => {
    const prisma = makePrisma();
    (prisma.analysisJob as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValue({
      id: "job1", companyName: "Cassava", status: "RUNNING", opportunityIds: [], errorCode: null, errorMessage: null,
      createdAt: new Date("2026-10-07T08:00:00Z"), startedAt: new Date(Date.now() - 90_000), completedAt: null,
      stage: "critiques", progress: { expected: ["A"], responded: ["A"], missing: [], elapsedSeconds: 88 },
      councilSessionId: "s1", companyId: "co1",
    });
    const res = await request(appWith(prisma, { startSession: vi.fn() })).get("/opportunities/analyze/job1");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "RUNNING", stage: "critiques", councilSessionId: "s1", queuePosition: null });
    expect(res.body.progress).toMatchObject({ responded: ["A"] });
    expect(res.body.elapsedSeconds).toBeGreaterThanOrEqual(89);
  });

  it("returns the queue position of a queued job", async () => {
    const prisma = makePrisma();
    (prisma.analysisJob as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValue({
      id: "job2", companyName: "Cassava", status: "QUEUED", opportunityIds: [], errorCode: null, errorMessage: null,
      createdAt: new Date("2026-10-07T08:05:00Z"), startedAt: null, completedAt: null, stage: "queued", progress: null,
      councilSessionId: null, companyId: "co1",
    });
    (prisma.analysisJob as { count: ReturnType<typeof vi.fn> }).count.mockResolvedValue(2);
    const res = await request(appWith(prisma, { startSession: vi.fn() })).get("/opportunities/analyze/job2");
    expect(res.body).toMatchObject({ status: "QUEUED", queuePosition: 2, elapsedSeconds: null });
  });
});
