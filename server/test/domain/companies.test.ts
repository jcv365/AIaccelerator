import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  createCompaniesRouter,
  findOrCreateCompany,
  normalizeNameKey,
  parseCompanyContextPatch,
  parseCompanyInput,
} from "../../src/domain/companies.js";

describe("normalizeNameKey", () => {
  it("trims, collapses whitespace and lower-cases so spelling variants are one company", () => {
    expect(normalizeNameKey("Maersk")).toBe("maersk");
    expect(normalizeNameKey("  MAERSK  ")).toBe("maersk");
    expect(normalizeNameKey("Acme   Manufacturing\tLtd")).toBe("acme manufacturing ltd");
  });
});

describe("parseCompanyInput", () => {
  it("accepts a name and cleans it up", () => {
    expect(parseCompanyInput({ name: "  Acme   Manufacturing " })).toEqual({
      ok: true,
      value: { name: "Acme Manufacturing", website: undefined },
    });
  });

  it("rejects a missing, blank, non-string or over-long name", () => {
    for (const name of [undefined, "", "   ", 5, "x".repeat(121)]) {
      expect(parseCompanyInput({ name })).toMatchObject({ ok: false });
    }
  });

  it("rejects control characters in the name", () => {
    expect(parseCompanyInput({ name: "Ac\u0000me" })).toMatchObject({ ok: false });
  });

  it("normalises a website: adds https, keeps only the origin, lower-cases the host", () => {
    expect(parseCompanyInput({ name: "A", website: "Maersk.com" })).toMatchObject({ ok: true, value: { website: "https://maersk.com" } });
    expect(parseCompanyInput({ name: "A", website: "https://www.maersk.com/about?x=1#y" })).toMatchObject({
      ok: true,
      value: { website: "https://www.maersk.com" },
    });
  });

  it("treats an empty website as not given", () => {
    expect(parseCompanyInput({ name: "A", website: "   " })).toMatchObject({ ok: true, value: { website: undefined } });
  });

  it("rejects unsafe or unusable websites (non-http schemes, credentials, localhost, IP addresses, no dot)", () => {
    for (const website of [
      "ftp://maersk.com",
      "javascript:alert(1)",
      "https://user:pass@maersk.com",
      "http://localhost:3000",
      "http://127.0.0.1",
      "http://192.168.1.10/admin",
      "http://[::1]/",
      "https://intranet",
      "not a url",
      5,
    ]) {
      expect(parseCompanyInput({ name: "A", website }), String(website)).toMatchObject({ ok: false });
    }
  });
});

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    company: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "c1",
        createdAt: new Date("2026-10-06T10:00:00Z"),
        website: null,
        ...data,
      })),
    },
    ...overrides,
  };
}

function appWith(prisma: unknown) {
  const app = express();
  app.use(express.json());
  app.use("/companies", createCompaniesRouter(prisma as never));
  return app;
}

describe("GET /companies", () => {
  it("lists companies alphabetically with how many opportunities each has", async () => {
    const prisma = makePrisma();
    prisma.company.findMany.mockResolvedValue([
      { id: "c1", name: "Maersk", website: null, createdAt: new Date("2026-10-06T10:00:00Z"), _count: { opportunities: 10 } },
    ]);
    const res = await request(appWith(prisma)).get("/companies");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: "c1", name: "Maersk", website: null, description: null, industry: null, focusAreas: [], notes: null,
        createdAt: "2026-10-06T10:00:00.000Z", opportunityCount: 10,
      },
    ]);
    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: "asc" }, include: { _count: { select: { opportunities: true } } } })
    );
  });
});

describe("POST /companies", () => {
  it("creates a new company and reports created:true", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma)).post("/companies").send({ name: "  Acme  Manufacturing ", website: "acme.com" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: true, company: { id: "c1", name: "Acme Manufacturing" } });
    expect(prisma.company.create).toHaveBeenCalledWith({
      data: { name: "Acme Manufacturing", nameKey: "acme manufacturing", website: "https://acme.com" },
    });
  });

  it("returns the existing company (created:false) for a duplicate name in any capitalisation, creating nothing", async () => {
    const prisma = makePrisma();
    prisma.company.findUnique.mockResolvedValue({ id: "c9", name: "Maersk", nameKey: "maersk", website: null });
    const res = await request(appWith(prisma)).post("/companies").send({ name: "MAERSK" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: false, company: { id: "c9", name: "Maersk" } });
    expect(prisma.company.findUnique).toHaveBeenCalledWith({ where: { nameKey: "maersk" } });
    expect(prisma.company.create).not.toHaveBeenCalled();
  });

  it("handles two simultaneous creations of the same name (unique violation) by returning the winner", async () => {
    const prisma = makePrisma();
    prisma.company.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "c2", name: "Acme", nameKey: "acme", website: null });
    prisma.company.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));

    const res = await request(appWith(prisma)).post("/companies").send({ name: "Acme" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: false, company: { id: "c2" } });
  });

  it("returns 400 VALIDATION_ERROR with a readable message for bad input", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma)).post("/companies").send({ name: "Ok", website: "http://localhost" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/website/i);
    expect(prisma.company.create).not.toHaveBeenCalled();
  });
});

describe("findOrCreateCompany", () => {
  it("finds an existing company by name key without creating", async () => {
    const prisma = makePrisma();
    prisma.company.findUnique.mockResolvedValue({ id: "c9", name: "Maersk", nameKey: "maersk" });
    const result = await findOrCreateCompany(prisma as never, { name: " maersk " });
    expect(result).toMatchObject({ created: false, company: { id: "c9" } });
    expect(prisma.company.create).not.toHaveBeenCalled();
  });

  it("creates it when missing", async () => {
    const prisma = makePrisma();
    const result = await findOrCreateCompany(prisma as never, { name: "New Co" });
    expect(result).toMatchObject({ created: true, company: { name: "New Co" } });
  });
});

describe("parseCompanyContextPatch", () => {
  it("accepts any subset of the context fields", () => {
    expect(parseCompanyContextPatch({ industry: " Telecoms ", focusAreas: ["Operations"] })).toEqual({
      ok: true,
      data: { industry: "Telecoms", focusAreas: ["Operations"] },
    });
  });

  it("clears a field when it is empty or null, and a list when it is empty", () => {
    expect(parseCompanyContextPatch({ notes: "", industry: null, focusAreas: [], description: "   " })).toEqual({
      ok: true,
      data: { notes: null, industry: null, focusAreas: [], description: null },
    });
  });

  it("enforces the context caps and ignores name and website (the existing PATCH handles those)", () => {
    expect(parseCompanyContextPatch({ description: "x".repeat(1001) })).toMatchObject({ ok: false });
    expect(parseCompanyContextPatch({ name: "Renamed", website: "cassava.com" })).toEqual({ ok: true, data: {} });
  });
});

describe("PATCH /companies/:id with context fields", () => {
  it("updates the context fields and returns the bare company", async () => {
    const stored = { id: "c1", name: "Cassava", website: "https://cassava.com", description: null, industry: null, focusAreas: [], notes: null, createdAt: new Date("2026-10-07T08:00:00Z") };
    const prisma = {
      company: {
        findUnique: vi.fn().mockResolvedValue(stored),
        update: vi.fn().mockResolvedValue({ ...stored, description: "Pan-African group", focusAreas: ["Operations"] }),
      },
    };
    const res = await request(appWith(prisma as never)).patch("/companies/c1").send({ description: "Pan-African group", focusAreas: ["Operations"] });
    expect(res.status).toBe(200);
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({ description: "Pan-African group", focusAreas: ["Operations"] }),
    });
    expect(res.body).toMatchObject({ id: "c1", description: "Pan-African group", focusAreas: ["Operations"] });
  });

  it("rejects an invalid context field with 400 and writes nothing", async () => {
    const prisma = { company: { findUnique: vi.fn().mockResolvedValue({ id: "c1", name: "Cassava", website: null }), update: vi.fn() } };
    expect((await request(appWith(prisma as never)).patch("/companies/c1").send({ industry: 5 })).status).toBe(400);
    expect(prisma.company.update).not.toHaveBeenCalled();
  });
});

describe("GET /companies/:id/analysis-jobs", () => {
  it("lists the company's jobs, newest first, without the council session internals", async () => {
    const prisma = {
      analysisJob: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "j2", status: "RUNNING", stage: "voting", opportunityIds: [], errorCode: null, errorMessage: null,
            createdAt: new Date("2026-10-07T10:00:00Z"), startedAt: new Date("2026-10-07T10:00:05Z"), completedAt: null,
          },
          {
            id: "j1", status: "FAILED", stage: "done", opportunityIds: [], errorCode: "COUNCIL_SESSION_LOST", errorMessage: "restarted",
            createdAt: new Date("2026-10-07T08:00:00Z"), startedAt: new Date("2026-10-07T08:00:05Z"), completedAt: new Date("2026-10-07T08:29:00Z"),
          },
        ]),
      },
    };
    const res = await request(appWith(prisma as never)).get("/companies/c1/analysis-jobs");
    expect(res.status).toBe(200);
    expect(prisma.analysisJob.findMany).toHaveBeenCalledWith({ where: { companyId: "c1" }, orderBy: { createdAt: "desc" }, take: 20 });
    expect(res.body[0]).toMatchObject({ id: "j2", status: "RUNNING", stage: "voting", opportunitiesFound: 0, error: null });
    expect(res.body[1]).toMatchObject({ id: "j1", error: { code: "COUNCIL_SESSION_LOST", message: "restarted" } });
    expect(res.body[0]).not.toHaveProperty("councilSessionId");
  });
});
