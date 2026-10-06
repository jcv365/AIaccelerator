import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createOpportunitiesRouter } from "../../src/domain/opportunities.js";
import { createEvidenceListRouter, createExperimentsListRouter } from "../../src/domain/crossLists.js";
import { createAnalysisRouter, runAnalysisJob } from "../../src/domain/analysis.js";

type Mock = ReturnType<typeof vi.fn>;
const m = (o: unknown, k: string, fn: string) => (o as Record<string, Record<string, Mock>>)[k][fn];

function makePrisma(overrides: Record<string, unknown> = {}) {
  const prisma: Record<string, unknown> = {
    company: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "newco", website: null, createdAt: new Date(), ...data })),
    },
    opportunity: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "opp1" }),
    },
    evidence: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}) },
    experiment: { findMany: vi.fn().mockResolvedValue([]) },
    analysisJob: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "job1", status: "QUEUED" }),
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
  prisma.$transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

function appWith(prisma: unknown, aiClient?: unknown) {
  const app = express();
  app.use(express.json());
  app.use("/opportunities", createOpportunitiesRouter(prisma as never, aiClient as never));
  app.use("/evidence", createEvidenceListRouter(prisma as never));
  app.use("/experiments", createExperimentsListRouter(prisma as never));
  return app;
}

describe("company filter on the list endpoints", () => {
  it("GET /opportunities?companyId= filters by company; without it nothing is filtered", async () => {
    const prisma = makePrisma();
    await request(appWith(prisma)).get("/opportunities?companyId=c1");
    expect(m(prisma, "opportunity", "findMany")).toHaveBeenLastCalledWith(expect.objectContaining({ where: { companyId: "c1" } }));

    await request(appWith(prisma)).get("/opportunities");
    expect(m(prisma, "opportunity", "findMany").mock.calls.at(-1)![0].where).toBeUndefined();
  });

  it("GET /evidence?companyId= and GET /experiments?companyId= filter through the opportunity", async () => {
    const prisma = makePrisma();
    await request(appWith(prisma)).get("/evidence?companyId=c1");
    expect(m(prisma, "evidence", "findMany")).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { opportunity: { companyId: "c1" } } })
    );
    await request(appWith(prisma)).get("/experiments?companyId=c1");
    expect(m(prisma, "experiment", "findMany")).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { opportunity: { companyId: "c1" } } })
    );
  });

  it("rejects a malformed companyId with 400 on all three lists", async () => {
    const prisma = makePrisma();
    for (const path of ["/opportunities", "/evidence", "/experiments"]) {
      const res = await request(appWith(prisma)).get(`${path}?companyId=${"x".repeat(65)}`);
      expect(res.status, path).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    const arr = await request(appWith(prisma)).get("/opportunities?companyId=a&companyId=b");
    expect(arr.status).toBe(400);
  });
});

describe("POST /opportunities files the opportunity under a company", () => {
  it("stores companyId when the company exists", async () => {
    const prisma = makePrisma();
    m(prisma, "company", "findUnique").mockResolvedValue({ id: "c1", name: "Maersk" });
    const res = await request(appWith(prisma)).post("/opportunities").send({ title: "T", companyId: "c1" });
    expect(res.status).toBe(201);
    expect(m(prisma, "opportunity", "create")).toHaveBeenCalledWith({ data: { title: "T", companyId: "c1" } });
  });

  it("returns 400 for an unknown or non-string companyId and creates nothing", async () => {
    const prisma = makePrisma();
    for (const companyId of ["ghost", 5, {}]) {
      const res = await request(appWith(prisma)).post("/opportunities").send({ title: "T", companyId });
      expect(res.status).toBe(400);
    }
    expect(m(prisma, "opportunity", "create")).not.toHaveBeenCalled();
  });

  it("still works with no companyId (older clients)", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma)).post("/opportunities").send({ title: "T" });
    expect(res.status).toBe(201);
  });
});

describe("POST /opportunities/analyze files the analysis under a company", () => {
  const neverEnding = { runSession: vi.fn().mockReturnValue(new Promise(() => {})) };

  it("find-or-creates the company from companyName and stores its id on the job", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma, neverEnding)).post("/opportunities/analyze").send({ companyName: " New  Co " });
    expect(res.status).toBe(202);
    expect(m(prisma, "company", "create")).toHaveBeenCalledWith({ data: { name: "New Co", nameKey: "new co", website: undefined } });
    expect(m(prisma, "analysisJob", "create")).toHaveBeenCalledWith({ data: { companyName: "New Co", companyId: "newco" } });
    expect(res.body).toMatchObject({ jobId: "job1", companyId: "newco" });
  });

  it("reuses an existing company with the same name in any capitalisation", async () => {
    const prisma = makePrisma();
    m(prisma, "company", "findUnique").mockResolvedValue({ id: "c1", name: "Maersk", nameKey: "maersk" });
    const res = await request(appWith(prisma, neverEnding)).post("/opportunities/analyze").send({ companyName: "MAERSK" });
    expect(res.status).toBe(202);
    expect(m(prisma, "company", "create")).not.toHaveBeenCalled();
    expect(m(prisma, "analysisJob", "create")).toHaveBeenCalledWith({ data: { companyName: "Maersk", companyId: "c1" } });
  });

  it("uses the given companyId when it exists and its stored name", async () => {
    const prisma = makePrisma();
    m(prisma, "company", "findUnique").mockResolvedValue({ id: "c1", name: "Maersk" });
    const res = await request(appWith(prisma, neverEnding)).post("/opportunities/analyze").send({ companyId: "c1" });
    expect(res.status).toBe(202);
    expect(m(prisma, "analysisJob", "create")).toHaveBeenCalledWith({ data: { companyName: "Maersk", companyId: "c1" } });
  });

  it("returns 400 for an unknown companyId, and does not create a job", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma, neverEnding)).post("/opportunities/analyze").send({ companyId: "ghost" });
    expect(res.status).toBe(400);
    expect(m(prisma, "analysisJob", "create")).not.toHaveBeenCalled();
  });

  it("requires a company name or id", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma, neverEnding)).post("/opportunities/analyze").send({});
    expect(res.status).toBe(400);
  });
});

describe("runAnalysisJob files created opportunities under the company", () => {
  it("sets companyId on every opportunity it saves", async () => {
    const prisma = makePrisma();
    const synthesis = JSON.stringify({
      opportunities: [{ title: "A", description: "d", businessProblem: "b", evidence: [] }],
    });
    const aiClient = { runSession: vi.fn().mockResolvedValue({ ok: true, sessionId: "s", synthesis }) };
    await runAnalysisJob(prisma as never, aiClient as never, "job1", "Maersk", "c1");
    expect(m(prisma, "opportunity", "create")).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: "A", companyId: "c1" }),
    });
  });
});

describe("GET /opportunities/analyze/:jobId", () => {
  it("includes the company id", async () => {
    const prisma = makePrisma();
    (prisma.analysisJob as Record<string, Mock>).findUnique = vi.fn().mockResolvedValue({
      id: "job1", companyName: "Maersk", companyId: "c1", status: "SUCCEEDED", opportunityIds: [], errorCode: null, errorMessage: null,
      createdAt: new Date(), startedAt: null, completedAt: null,
    });
    const app = express();
    app.use(express.json());
    app.use("/opportunities/analyze", createAnalysisRouter(prisma as never, {} as never));
    const res = await request(app).get("/opportunities/analyze/job1");
    expect(res.body.companyId).toBe("c1");
  });
});
