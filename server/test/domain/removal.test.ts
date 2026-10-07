import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createCompaniesRouter } from "../../src/domain/companies.js";
import { createOpportunitiesRouter } from "../../src/domain/opportunities.js";
import { removeCompany, removeOpportunity } from "../../src/domain/removal.js";

const many = () => ({ deleteMany: vi.fn().mockResolvedValue({ count: 1 }) });

function makePrisma(over: Record<string, unknown> = {}) {
  const prisma: Record<string, any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
    learning: many(),
    experiment: many(),
    decision: many(),
    evidence: many(),
    opportunityAssessment: many(),
    opportunityReport: many(),
    opportunity: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }), findMany: vi.fn().mockResolvedValue([{ id: "o1" }, { id: "o2" }]) },
    companyReport: { ...many(), findFirst: vi.fn().mockResolvedValue(null) },
    readinessAssessment: many(),
    analysisJob: { ...many(), findFirst: vi.fn().mockResolvedValue(null) },
    company: {
      findUnique: vi.fn().mockResolvedValue({ id: "c1", name: "Momentum", website: "https://www.momentum.co.za", nameKey: "momentum" }),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "c1", createdAt: new Date(), ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    ...over,
  };
  prisma.$transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

const appWith = (prisma: unknown) => {
  const app = express();
  app.use(express.json());
  app.use("/companies", createCompaniesRouter(prisma as never));
  app.use("/opportunities", createOpportunitiesRouter(prisma as never));
  return app;
};

describe("removeOpportunity", () => {
  it("removes children before the opportunity, all in one transaction", async () => {
    const prisma = makePrisma({ opportunity: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } });
    expect(await removeOpportunity(prisma as never, "o1")).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    for (const t of ["learning", "experiment", "decision", "evidence", "opportunityAssessment", "opportunityReport"]) {
      expect(prisma[t].deleteMany, t).toHaveBeenCalled();
    }
    const order = [prisma.evidence.deleteMany, prisma.opportunity.deleteMany].map((f) => f.mock.invocationCallOrder[0]);
    expect(order[0]).toBeLessThan(order[1]);
  });

  it("reports false when nothing matched", async () => {
    const prisma = makePrisma({ opportunity: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } });
    expect(await removeOpportunity(prisma as never, "nope")).toBe(false);
  });
});

describe("removeCompany", () => {
  it("removes the company with its opportunities, reports, readiness and jobs", async () => {
    const prisma = makePrisma();
    expect(await removeCompany(prisma as never, "c1")).toEqual({ removed: true, opportunities: 2 });
    expect(prisma.companyReport.deleteMany).toHaveBeenCalledWith({ where: { companyId: "c1" } });
    expect(prisma.readinessAssessment.deleteMany).toHaveBeenCalled();
    expect(prisma.analysisJob.deleteMany).toHaveBeenCalled();
    expect(prisma.company.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("refuses while an analysis or a report is running, deleting nothing", async () => {
    const running = makePrisma({ analysisJob: { ...many(), findFirst: vi.fn().mockResolvedValue({ id: "j" }) } });
    expect(await removeCompany(running as never, "c1")).toEqual({ removed: false, reason: "busy" });
    expect(running.company.delete).not.toHaveBeenCalled();
    const writing = makePrisma({ companyReport: { ...many(), findFirst: vi.fn().mockResolvedValue({ id: "r" }) } });
    expect((await removeCompany(writing as never, "c1")).removed).toBe(false);
  });
});

describe("DELETE /opportunities/:id", () => {
  it("returns 204, or 404 for an unknown opportunity", async () => {
    expect((await request(appWith(makePrisma({ opportunity: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } }))).delete("/opportunities/o1")).status).toBe(204);
    expect((await request(appWith(makePrisma({ opportunity: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } }))).delete("/opportunities/x")).status).toBe(404);
  });
});

describe("PATCH /companies/:id", () => {
  it("renames and changes the website, keeping the lookup key in step", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma)).patch("/companies/c1").send({ name: "Momentum Group", website: "momentum.co.za" });
    expect(res.status).toBe(200);
    expect(prisma.company.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { name: "Momentum Group", nameKey: "momentum group", website: "https://momentum.co.za" } });
  });

  it("keeps the current website when only the name is sent, and clears it with an empty string", async () => {
    const prisma = makePrisma();
    await request(appWith(prisma)).patch("/companies/c1").send({ name: "Momentum" });
    expect(prisma.company.update.mock.calls[0][0].data.website).toBe("https://www.momentum.co.za");
    await request(appWith(prisma)).patch("/companies/c1").send({ website: "" });
    expect(prisma.company.update.mock.calls[1][0].data.website).toBeNull();
  });

  it("rejects a bad website or empty name (400), a name already used (409) and an unknown company (404)", async () => {
    const prisma = makePrisma();
    expect((await request(appWith(prisma)).patch("/companies/c1").send({ website: "http://10.0.0.1" })).status).toBe(400);
    expect((await request(appWith(prisma)).patch("/companies/c1").send({ name: "  " })).status).toBe(400);
    prisma.company.update.mockRejectedValueOnce({ code: "P2002" });
    const taken = await request(appWith(prisma)).patch("/companies/c1").send({ name: "Maersk" });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("NAME_TAKEN");
    prisma.company.findUnique.mockResolvedValueOnce(null);
    expect((await request(appWith(prisma)).patch("/companies/zzz").send({ name: "X" })).status).toBe(404);
  });
});

describe("DELETE /companies/:id", () => {
  it("requires the exact company name as confirmation", async () => {
    const prisma = makePrisma();
    const none = await request(appWith(prisma)).delete("/companies/c1");
    expect(none.status).toBe(400);
    expect((await request(appWith(prisma)).delete("/companies/c1?confirmName=momentum")).status).toBe(400);
    expect(prisma.company.delete).not.toHaveBeenCalled();
  });

  it("deletes with the right confirmation and reports how many opportunities went", async () => {
    const res = await request(appWith(makePrisma())).delete("/companies/c1?confirmName=Momentum");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true, opportunities: 2 });
  });

  it("answers 409 while work is running and 404 for an unknown company", async () => {
    const busy = makePrisma({ analysisJob: { ...many(), findFirst: vi.fn().mockResolvedValue({ id: "j" }) } });
    expect((await request(appWith(busy)).delete("/companies/c1?confirmName=Momentum")).status).toBe(409);
    const prisma = makePrisma();
    prisma.company.findUnique.mockResolvedValueOnce(null);
    expect((await request(appWith(prisma)).delete("/companies/zzz?confirmName=X")).status).toBe(404);
  });
});
