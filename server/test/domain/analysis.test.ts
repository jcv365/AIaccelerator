import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createAnalysisRouter, runAnalysisJob, reconcileInterruptedJobs } from "../../src/domain/analysis.js";
import { AiClientError } from "../../src/ai/errors.js";

const GOOD_SYNTHESIS = JSON.stringify({
  opportunities: [
    {
      title: "Predictive maintenance",
      description: "Predict vessel engine failures",
      businessProblem: "Unplanned downtime",
      evidence: [
        { claim: "Fleet of 700 vessels", type: "FACT", confidence: 0.9, source: "https://example.com" },
        { claim: "Bad type", type: "NOPE", confidence: 0.5 },
      ],
    },
    { title: "Missing fields" },
  ],
});

function makePrisma(overrides: Record<string, unknown> = {}) {
  const prisma: Record<string, unknown> = {
    analysisJob: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "job1", status: "QUEUED", companyName: "Maersk" }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    opportunity: { create: vi.fn().mockResolvedValue({ id: "opp1" }) },
    evidence: { create: vi.fn().mockResolvedValue({}) },
    ...overrides,
  };
  prisma.$transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

function jobUpdates(prisma: ReturnType<typeof makePrisma>) {
  return (prisma.analysisJob as { update: ReturnType<typeof vi.fn> }).update.mock.calls.map((c) => c[0].data);
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
    const app = appWith(makePrisma(), { runSession: vi.fn() });
    for (const body of [{}, { companyName: "   " }, { companyName: 5 }, { companyName: "x".repeat(201) }]) {
      const res = await request(app).post("/opportunities/analyze").send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 409 when another analysis is already queued or running", async () => {
    const prisma = makePrisma();
    (prisma.analysisJob as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({ id: "other" });
    const res = await request(appWith(prisma, { runSession: vi.fn() }))
      .post("/opportunities/analyze")
      .send({ companyName: "Maersk" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ANALYSIS_IN_PROGRESS");
    expect((prisma.analysisJob as { create: ReturnType<typeof vi.fn> }).create).not.toHaveBeenCalled();
  });

  it("creates a job and returns 202 immediately without waiting for the AI", async () => {
    const prisma = makePrisma();
    const aiClient = { runSession: vi.fn().mockReturnValue(new Promise(() => {})) }; // never resolves
    const res = await request(appWith(prisma, aiClient)).post("/opportunities/analyze").send({ companyName: " Maersk " });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: "job1", status: "QUEUED" });
    expect((prisma.analysisJob as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledWith({
      data: { companyName: "Maersk" },
    });
  });
});

describe("GET /opportunities/analyze/:jobId", () => {
  it("returns 404 for an unknown job", async () => {
    const res = await request(appWith(makePrisma(), { runSession: vi.fn() })).get("/opportunities/analyze/nope");
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
    const res = await request(appWith(prisma, { runSession: vi.fn() })).get("/opportunities/analyze/job1");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "job1", status: "SUCCEEDED", opportunitiesFound: 2, opportunityIds: ["a", "b"] });
  });
});

describe("runAnalysisJob", () => {
  it("runs the conclave with web research, the analysis roster and a long timeout, then stores results", async () => {
    const prisma = makePrisma();
    const aiClient = { runSession: vi.fn().mockResolvedValue({ ok: true, sessionId: "s", synthesis: GOOD_SYNTHESIS }) };

    await runAnalysisJob(prisma as never, aiClient as never, "job1", "Maersk");

    const [goal, web, opts] = aiClient.runSession.mock.calls[0];
    expect(goal).toContain('"Maersk"');
    expect(web).toBe(true);
    expect(opts.configPath).toContain("experts-analysis.yaml");
    expect(opts.timeoutMs).toBeGreaterThanOrEqual(30 * 60_000);

    const updates = jobUpdates(prisma);
    expect(updates[0]).toMatchObject({ status: "RUNNING" });
    expect(updates[updates.length - 1]).toMatchObject({ status: "SUCCEEDED", opportunityIds: ["opp1"] });
    // only the valid opportunity and the valid evidence row are stored
    expect((prisma.opportunity as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledTimes(1);
    expect((prisma.evidence as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction as ReturnType<typeof vi.fn>).toHaveBeenCalled();
  });

  it("extracts JSON wrapped in markdown fences", async () => {
    const prisma = makePrisma();
    const aiClient = {
      runSession: vi.fn().mockResolvedValue({ ok: true, sessionId: "s", synthesis: "```json\n" + GOOD_SYNTHESIS + "\n```" }),
    };
    await runAnalysisJob(prisma as never, aiClient as never, "job1", "Maersk");
    expect(jobUpdates(prisma).pop()).toMatchObject({ status: "SUCCEEDED" });
  });

  it("parses the fenced JSON when the conclave appends notes (with braces) after it", async () => {
    const prisma = makePrisma();
    const withNotes =
      "```json\n" + GOOD_SYNTHESIS + "\n```\n\n---\n_Disputed: 1 of 3 experts disagreed. Dissent: Claude: \"has {braces} here\"_";
    const aiClient = { runSession: vi.fn().mockResolvedValue({ ok: true, sessionId: "s", synthesis: withNotes }) };
    await runAnalysisJob(prisma as never, aiClient as never, "job1", "Maersk");
    expect(jobUpdates(prisma).pop()).toMatchObject({ status: "SUCCEEDED", opportunityIds: ["opp1"] });
  });

  it("marks the job FAILED when the AI answer is truncated JSON", async () => {
    const prisma = makePrisma();
    const aiClient = {
      runSession: vi.fn().mockResolvedValue({ ok: true, sessionId: "s", synthesis: '```json\n{ "opportunities": [ { "title": "Gemini AI-' }),
    };
    await runAnalysisJob(prisma as never, aiClient as never, "job1", "Maersk");
    expect(jobUpdates(prisma).pop()).toMatchObject({ status: "FAILED", errorCode: "AI_UPSTREAM_ERROR" });
  });

  it("marks the job FAILED when the AI answer is unparseable and stores nothing", async () => {
    const prisma = makePrisma();
    const aiClient = { runSession: vi.fn().mockResolvedValue({ ok: true, sessionId: "s", synthesis: "not json" }) };
    await runAnalysisJob(prisma as never, aiClient as never, "job1", "Maersk");
    expect(jobUpdates(prisma).pop()).toMatchObject({ status: "FAILED", errorCode: "AI_UPSTREAM_ERROR" });
    expect((prisma.opportunity as { create: ReturnType<typeof vi.fn> }).create).not.toHaveBeenCalled();
  });

  it("marks the job FAILED when no opportunity in the answer is valid", async () => {
    const prisma = makePrisma();
    const aiClient = {
      runSession: vi.fn().mockResolvedValue({ ok: true, sessionId: "s", synthesis: JSON.stringify({ opportunities: [{ title: "x" }] }) }),
    };
    await runAnalysisJob(prisma as never, aiClient as never, "job1", "Maersk");
    expect(jobUpdates(prisma).pop()).toMatchObject({ status: "FAILED", errorCode: "AI_UPSTREAM_ERROR" });
  });

  it("records an AiClientError's code and message on the job", async () => {
    const prisma = makePrisma();
    const aiClient = { runSession: vi.fn().mockRejectedValue(new AiClientError("AI_BUSY", "Conclave is busy")) };
    await runAnalysisJob(prisma as never, aiClient as never, "job1", "Maersk");
    expect(jobUpdates(prisma).pop()).toMatchObject({ status: "FAILED", errorCode: "AI_BUSY", errorMessage: "Conclave is busy" });
  });

  it("never rejects, even on an unexpected error (no unhandled rejection from the fire-and-forget call)", async () => {
    const prisma = makePrisma();
    const aiClient = { runSession: vi.fn().mockRejectedValue(new Error("boom")) };
    await expect(runAnalysisJob(prisma as never, aiClient as never, "job1", "Maersk")).resolves.toBeUndefined();
    expect(jobUpdates(prisma).pop()).toMatchObject({ status: "FAILED", errorCode: "INTERNAL_ERROR" });
  });
});

describe("runAnalysisJob logging", () => {
  function captured(spy: ReturnType<typeof vi.spyOn>) {
    return spy.mock.calls.map((c) => JSON.parse(String(c[0])));
  }

  it("logs a start line and a finish line with job id, count and duration on success", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const prisma = makePrisma();
    const aiClient = { runSession: vi.fn().mockResolvedValue({ ok: true, sessionId: "s", synthesis: GOOD_SYNTHESIS }) };

    await runAnalysisJob(prisma as never, aiClient as never, "job1", "Maersk");

    const lines = captured(log);
    expect(lines[0]).toMatchObject({ level: "info", msg: "analysis started", jobId: "job1" });
    expect(lines[lines.length - 1]).toMatchObject({
      level: "info",
      msg: "analysis succeeded",
      jobId: "job1",
      opportunities: 1,
      durationMs: expect.any(Number),
    });
    log.mockRestore();
  });

  it("logs an error line with the error code when the job fails", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const prisma = makePrisma();
    const aiClient = { runSession: vi.fn().mockRejectedValue(new AiClientError("AI_BUSY", "Conclave is busy")) };

    await runAnalysisJob(prisma as never, aiClient as never, "job1", "Maersk");

    expect(captured(error)[0]).toMatchObject({ level: "error", msg: "analysis failed", jobId: "job1", errorCode: "AI_BUSY" });
    log.mockRestore();
    error.mockRestore();
  });
});

describe("reconcileInterruptedJobs", () => {
  it("marks QUEUED/RUNNING jobs FAILED/INTERRUPTED at boot", async () => {
    const prisma = makePrisma();
    (prisma.analysisJob as { updateMany: ReturnType<typeof vi.fn> }).updateMany.mockResolvedValue({ count: 2 });
    const count = await reconcileInterruptedJobs(prisma as never);
    expect(count).toBe(2);
    expect((prisma.analysisJob as { updateMany: ReturnType<typeof vi.fn> }).updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ["QUEUED", "RUNNING"] } },
        data: expect.objectContaining({ status: "FAILED", errorCode: "INTERRUPTED" }),
      })
    );
  });
});
