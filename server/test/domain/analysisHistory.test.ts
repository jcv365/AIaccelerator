import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createCompaniesRouter } from "../../src/domain/companies.js";
import { createOpportunitiesRouter } from "../../src/domain/opportunities.js";
import { createEvidenceListRouter, createExperimentsListRouter } from "../../src/domain/crossLists.js";
import { createExportRouter, createReadinessRouter } from "../../src/scoring/routes.js";

const appWith = (prisma: unknown) => {
  const app = express();
  app.use(express.json());
  app.use("/companies", createCompaniesRouter(prisma as never));
  app.use("/opportunities", createOpportunitiesRouter(prisma as never));
  return app;
};

describe("GET /companies/:id/analyses", () => {
  const jobs = [
    { id: "j2", status: "SUCCEEDED", createdAt: new Date("2026-10-07T11:00:00Z"), startedAt: null, completedAt: new Date("2026-10-07T11:50:00Z"), errorCode: null, errorMessage: null },
    { id: "j1", status: "FAILED", createdAt: new Date("2026-10-06T08:00:00Z"), startedAt: null, completedAt: null, errorCode: "AI_UNREACHABLE", errorMessage: "Could not reach the conclave" },
  ];
  const prisma = () => ({
    company: { findUnique: vi.fn().mockResolvedValue({ id: "c1" }) },
    analysisJob: { findMany: vi.fn().mockResolvedValue(jobs) },
    opportunity: { groupBy: vi.fn().mockResolvedValue([{ analysisJobId: "j2", _count: { _all: 8 } }]) },
  });

  it("lists runs newest first with the date, outcome and how many opportunities each found", async () => {
    const p = prisma();
    const res = await request(appWith(p)).get("/companies/c1/analyses");
    expect(res.status).toBe(200);
    expect(p.analysisJob.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: "c1" }, orderBy: { createdAt: "desc" } }));
    expect(res.body.analyses).toEqual([
      expect.objectContaining({ id: "j2", status: "SUCCEEDED", createdAt: "2026-10-07T11:00:00.000Z", opportunities: 8, error: null }),
      expect.objectContaining({ id: "j1", status: "FAILED", opportunities: 0, error: { code: "AI_UNREACHABLE", message: "Could not reach the conclave" } }),
    ]);
  });

  it("404s for an unknown company", async () => {
    const p = prisma();
    p.company.findUnique.mockResolvedValue(null);
    expect((await request(appWith(p)).get("/companies/nope/analyses")).status).toBe(404);
  });
});

describe("GET /opportunities?analysisId=", () => {
  const prisma = () => ({ opportunity: { findMany: vi.fn().mockResolvedValue([]) } });

  it("filters to one run, combined with the company", async () => {
    const p = prisma();
    const res = await request(appWith(p)).get("/opportunities?companyId=c1&analysisId=j2");
    expect(res.status).toBe(200);
    expect(p.opportunity.findMany.mock.calls[0][0].where).toEqual({ companyId: "c1", analysisJobId: "j2" });
  });

  it("rejects anything but one short id, so a query operator cannot reach the database", async () => {
    const p = prisma();
    expect((await request(appWith(p)).get("/opportunities?analysisId[contains]=x")).status).toBe(400);
    expect((await request(appWith(p)).get(`/opportunities?analysisId=${"x".repeat(65)}`)).status).toBe(400);
    expect(p.opportunity.findMany).not.toHaveBeenCalled();
  });

  it("does not filter when no run is given", async () => {
    const p = prisma();
    await request(appWith(p)).get("/opportunities");
    expect(p.opportunity.findMany.mock.calls[0][0].where).toBeUndefined();
  });
});

describe("one analysis run scopes the other lists too", () => {
  const listApp = (prisma: unknown) => {
    const app = express();
    app.use(express.json());
    app.use("/evidence", createEvidenceListRouter(prisma as never));
    app.use("/experiments", createExperimentsListRouter(prisma as never));
    app.use("/exports", createExportRouter(prisma as never));
    return app;
  };

  it("filters evidence and experiments by the run through their opportunity", async () => {
    const prisma = { evidence: { findMany: vi.fn().mockResolvedValue([]) }, experiment: { findMany: vi.fn().mockResolvedValue([]) } };
    await request(listApp(prisma)).get("/evidence?companyId=c1&analysisId=j2");
    await request(listApp(prisma)).get("/experiments?companyId=c1&analysisId=j2");
    expect(prisma.evidence.findMany.mock.calls[0][0].where).toEqual({ opportunity: { companyId: "c1", analysisJobId: "j2" } });
    expect(prisma.experiment.findMany.mock.calls[0][0].where).toEqual({ opportunity: { companyId: "c1", analysisJobId: "j2" } });
  });

  it("rejects a malformed run id on the cross lists and the export", async () => {
    const prisma = { evidence: { findMany: vi.fn() }, experiment: { findMany: vi.fn() }, opportunity: { findMany: vi.fn() } };
    expect((await request(listApp(prisma)).get("/evidence?analysisId[a]=1")).status).toBe(400);
    expect((await request(listApp(prisma)).get("/exports/opportunities.csv?analysisId[a]=1")).status).toBe(400);
    expect(prisma.evidence.findMany).not.toHaveBeenCalled();
  });

  it("filters the CSV export by run", async () => {
    const prisma = { opportunity: { findMany: vi.fn().mockResolvedValue([]) } };
    const res = await request(listApp(prisma)).get("/exports/opportunities.csv?companyId=c1&analysisId=j2");
    expect(res.status).toBe(200);
    expect(prisma.opportunity.findMany.mock.calls[0][0].where).toEqual({ companyId: "c1", analysisJobId: "j2" });
  });

  it("assesses readiness over only the chosen run's opportunities", async () => {
    const prisma = {
      company: { findUnique: vi.fn().mockResolvedValue({ id: "c1" }) },
      opportunity: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const app = express();
    app.use(express.json());
    app.use("/readiness", createReadinessRouter(prisma as never, { quickAsk: vi.fn(), runSession: vi.fn() } as never));
    const res = await request(app).post("/readiness").send({ companyId: "c1", analysisId: "j2" });
    expect(res.status).toBe(409); // no opportunities in that run
    expect(prisma.opportunity.findMany.mock.calls[0][0].where).toEqual({ companyId: "c1", analysisJobId: "j2" });
    expect((await request(app).post("/readiness").send({ companyId: "c1", analysisId: 5 })).status).toBe(400);
  });
});
