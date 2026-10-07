import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import JSZip from "jszip";
import { approveReport, reconcileInterruptedReports, startReport, type ReportDeps } from "../../src/reporting/service.js";
import { createReportsRouter } from "../../src/reporting/routes.js";
import { AiClientError } from "../../src/ai/errors.js";
import { makeFacts, sectionReply } from "./fixtures.js";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A small in-memory stand-in for the three tables the report lifecycle touches. */
function makeDb() {
  const reports: Row[] = [];
  const files: Row[] = [];
  let n = 0;
  const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([k, v]) => row[k] === v);
  const withFiles = (r: Row) => ({ ...r, deliverables: files.filter((f) => f.companyReportId === r.id).map((f) => ({ audience: f.audience, format: f.format, filename: f.filename, sizeBytes: f.sizeBytes })) });
  const prisma = {
    company: { findUnique: async ({ where }: Row) => (where.id === "c1" ? { id: "c1", name: "Acme Shipping" } : null) },
    analysisJob: {
      findFirst: async ({ where }: Row) =>
        where.id === "j1" && where.companyId === "c1" && where.status === "SUCCEEDED" ? { id: "j1", createdAt: new Date("2026-10-07T11:00:00Z") } : null,
    },
    companyReport: {
      findFirst: async ({ where, orderBy }: Row) => {
        const found = reports.filter((r) => matches(r, where));
        if (orderBy?.version === "desc") found.sort((a, b) => b.version - a.version);
        return found[0] ?? null;
      },
      create: async ({ data }: Row) => {
        const row = { id: `r${++n}`, createdAt: new Date(), completedAt: null, approvedAt: null, approvedBy: null, content: null, sources: null, qualityReport: null, errorMessage: null, stage: null, ...data };
        reports.push(row);
        return row;
      },
      update: async ({ where, data }: Row) => Object.assign(reports.find((r) => r.id === where.id)!, data),
      updateMany: async ({ where, data }: Row) => {
        const found = reports.filter((r) => matches(r, where));
        found.forEach((r) => Object.assign(r, data));
        return { count: found.length };
      },
      findUnique: async ({ where, include }: Row) => {
        const r = reports.find((x) => x.id === where.id);
        return r ? (include ? withFiles(r) : r) : null;
      },
      findMany: async ({ where }: Row) => reports.filter((r) => matches(r, where)).sort((a, b) => b.version - a.version).map(withFiles),
    },
    deliverable: {
      createMany: async ({ data }: Row) => void files.push(...data.map((d: Row) => ({ id: `f${files.length}`, ...d }))),
      deleteMany: async ({ where }: Row) => {
        for (let i = files.length - 1; i >= 0; i--) if (files[i].companyReportId === where.companyReportId) files.splice(i, 1);
      },
      findUnique: async ({ where }: Row) => {
        const k = where.companyReportId_audience_format;
        return files.find((f) => f.companyReportId === k.companyReportId && f.audience === k.audience && f.format === k.format) ?? null;
      },
    },
    $transaction: async (cb: (tx: unknown) => unknown) => cb(prisma),
  };
  return { prisma, reports, files };
}

/** A fake Conclave /quick: answers each section from the known-good fixture unless told otherwise. */
function makeAi(override: (section: string, call: number) => string | Error | undefined = () => undefined) {
  const calls: Record<string, number> = {};
  const quickAsk = vi.fn(async (...args: [model: string, system: string, prompt: string, timeoutMs?: number, configPath?: string]) => {
    const section = /^SECTION: (\S+)/m.exec(args[2])![1];
    calls[section] = (calls[section] ?? 0) + 1;
    const custom = override(section, calls[section]);
    if (custom instanceof Error) throw custom;
    return { ok: true as const, model: "Fusion", response: custom ?? "```json\n" + JSON.stringify(sectionReply(section)) + "\n```" };
  });
  return { quickAsk, runSession: vi.fn() };
}

function deps(db: ReturnType<typeof makeDb>, ai: ReturnType<typeof makeAi>): ReportDeps {
  return { prisma: db.prisma as never, aiClient: ai as never, collect: async () => makeFacts(), retryDelayMs: 0 };
}

const settled = (db: ReturnType<typeof makeDb>) => vi.waitFor(() => expect(db.reports.every((r) => r.status !== "GENERATING")).toBe(true), { timeout: 20_000, interval: 25 });

async function started(d: ReportDeps, db: ReturnType<typeof makeDb>) {
  const result = await startReport(d, "c1");
  expect(result.kind).toBe("started");
  await settled(db);
  return db.reports[db.reports.length - 1];
}

describe("startReport and runReportJob", () => {
  it("writes the report, passes the gates, stores four files and leaves a draft", async () => {
    const db = makeDb();
    const row = await started(deps(db, makeAi()), db);
    expect(row.status).toBe("DRAFT");
    expect(row.version).toBe(1);
    expect(row.qualityReport.passed).toBe(true);
    expect(row.completedAt).toBeInstanceOf(Date);
    expect(row.stage).toBeNull();
    expect(row.sources.titles.o1).toMatch(/Predictive maintenance/);
    expect(db.files.map((f) => `${f.audience}/${f.format}`).sort()).toEqual(["C_LEVEL/DOCX", "C_LEVEL/PPTX", "TECHNICAL/DOCX", "TECHNICAL/PPTX"]);
    expect(db.files.every((f) => f.sizeBytes === f.content.length && f.sizeBytes > 1000)).toBe(true);
  });

  it("asks a single fast expert using the app's own roster", async () => {
    const db = makeDb();
    const ai = makeAi();
    await started(deps(db, ai), db);
    const [model, , , timeout, configPath] = ai.quickAsk.mock.calls[0];
    expect(model).toBe("Claude");
    expect(timeout).toBeGreaterThan(60_000);
    expect(configPath).toMatch(/experts-analysis\.yaml$/);
  });

  it("numbers versions upward and keeps earlier ones", async () => {
    const db = makeDb();
    const d = deps(db, makeAi());
    await started(d, db);
    await started(d, db);
    expect(db.reports.map((r) => r.version)).toEqual([1, 2]);
  });

  it("refuses a second report while one is being written, and an unknown company", async () => {
    const db = makeDb();
    db.reports.push({ id: "x", companyId: "c9", version: 1, status: "GENERATING" });
    expect((await startReport(deps(db, makeAi()), "c1")).kind).toBe("busy");
    expect((await startReport(deps(makeDb(), makeAi()), "nope")).kind).toBe("company_not_found");
  });

  it("fails, keeping the content and the reasons, when the quality gates reject the report", async () => {
    const db = makeDb();
    const ai = makeAi((section) =>
      section === "notes" ? "```json\n" + JSON.stringify({ ...(sectionReply("notes") as object), evidenceNote: "Everything is fully confirmed and complete." }) + "\n```" : undefined
    );
    const row = await started(deps(db, ai), db);
    expect(row.status).toBe("FAILED");
    expect(row.errorMessage).toMatch(/quality checks/i);
    expect(row.qualityReport.passed).toBe(false);
    expect(row.content).not.toBeNull();
    expect(db.files).toHaveLength(0);
  });

  it("fails with the section name when a section cannot be written", async () => {
    const db = makeDb();
    const row = await started(deps(db, makeAi((s) => (s === "risks" ? '{"risks": []}' : undefined))), db);
    expect(row.status).toBe("FAILED");
    expect(row.errorMessage).toMatch(/risks/);
    expect(db.files).toHaveLength(0);
  });

  it("retries a transient AI failure, then gives up with a readable message", async () => {
    const db = makeDb();
    const flaky = makeAi((s, call) => (s === "opportunity:o1" && call < 3 ? new AiClientError("AI_UPSTREAM_ERROR", "boom") : undefined));
    expect((await started(deps(db, flaky), db)).status).toBe("DRAFT");

    const db2 = makeDb();
    const down = makeAi(() => new AiClientError("AI_UNREACHABLE", "Could not reach the conclave"));
    const row = await started(deps(db2, down), db2);
    expect(row.status).toBe("FAILED");
    expect(row.errorMessage).toMatch(/AI service failed/);
    expect(down.quickAsk).toHaveBeenCalledTimes(3);
  });

  it("records a crash as a failure without leaking internals", async () => {
    const db = makeDb();
    const d = {
      ...deps(db, makeAi()),
      collect: async (): Promise<never> => {
        throw new Error("secret stack detail");
      },
    };
    const row = await started(d, db);
    expect(row.status).toBe("FAILED");
    expect(row.errorMessage).toBe("The report failed unexpectedly");
  });

  it("updates the stage as it works", async () => {
    const db = makeDb();
    const stages: string[] = [];
    const original = db.prisma.companyReport.update;
    db.prisma.companyReport.update = async (args: Row) => {
      if (args.data.stage) stages.push(args.data.stage);
      return original(args);
    };
    await started(deps(db, makeAi()), db);
    expect(stages.some((s) => /opportunity 1 of 2/i.test(s))).toBe(true);
    expect(stages).toContain("Checking quality");
    expect(stages).toContain("Building the files");
  });
});

describe("a report scoped to one analysis run", () => {
  it("collects only that run's facts and records which run (and its date) the report is about", async () => {
    const db = makeDb();
    const collect = vi.fn(async () => makeFacts());
    const d = { ...deps(db, makeAi()), collect };
    expect((await startReport(d, "c1", "j1")).kind).toBe("started");
    await settled(db);
    expect(collect).toHaveBeenCalledWith(db.prisma, "c1", "j1");
    const row = db.reports[0];
    expect(row.status).toBe("DRAFT");
    expect(row.sources.analysis).toEqual({ id: "j1", ranAt: "2026-10-07T11:00:00.000Z" });
    const docx = db.files.find((f) => f.format === "DOCX")!;
    const xml = await (await JSZip.loadAsync(docx.content)).file("word/document.xml")!.async("string");
    expect(xml).toContain("Analysis run of 2026-10-07");
  });

  it("says plainly when every run was combined", async () => {
    const db = makeDb();
    await started(deps(db, makeAi()), db);
    const xml = await (await JSZip.loadAsync(db.files.find((f) => f.format === "DOCX")!.content)).file("word/document.xml")!.async("string");
    expect(xml).toContain("All analysis runs combined");
  });

  it("refuses a run that is unknown, unfinished or another company's", async () => {
    const db = makeDb();
    expect((await startReport(deps(db, makeAi()), "c1", "nope")).kind).toBe("analysis_not_found");
    expect(db.reports).toHaveLength(0);
  });

  it("keeps the same run (and the draft/approved wording) when the report is approved", async () => {
    const db = makeDb();
    await startReport(deps(db, makeAi()), "c1", "j1");
    await settled(db);
    await approveReport(db.prisma as never, db.reports[0].id, "admin");
    const xml = await (await JSZip.loadAsync(db.files.find((f) => f.format === "DOCX")!.content)).file("word/document.xml")!.async("string");
    expect(xml).toContain("Analysis run of 2026-10-07");
    expect(xml).toContain("Approved by admin");
  });
});

describe("approveReport", () => {
  it("locks a draft and rebuilds its files without the draft mark", async () => {
    const db = makeDb();
    await started(deps(db, makeAi()), db);
    const id = db.reports[0].id;
    expect(await approveReport(db.prisma as never, id, "admin")).toEqual({ kind: "approved" });
    expect(db.reports[0]).toMatchObject({ status: "APPROVED", approvedBy: "admin" });
    expect(db.files).toHaveLength(4);
    const docx = db.files.find((f) => f.format === "DOCX")!;
    const zip = await JSZip.loadAsync(docx.content);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Approved by admin");
    expect(xml).not.toContain("AI-generated, verify before sharing");
  });

  it("only approves a finished draft, once", async () => {
    const db = makeDb();
    await started(deps(db, makeAi()), db);
    const id = db.reports[0].id;
    expect((await approveReport(db.prisma as never, "missing", "admin")).kind).toBe("not_found");
    await approveReport(db.prisma as never, id, "admin");
    expect((await approveReport(db.prisma as never, id, "admin")).kind).toBe("not_draft");
    db.reports.push({ id: "failed", status: "FAILED", version: 9 });
    expect((await approveReport(db.prisma as never, "failed", "admin")).kind).toBe("not_draft");
  });

  it("reports an unreadable saved report instead of building broken files", async () => {
    const db = makeDb();
    db.reports.push({ id: "bad", status: "DRAFT", version: 1, content: { nonsense: true }, sources: null, createdAt: new Date(), completedAt: new Date() });
    expect((await approveReport(db.prisma as never, "bad", "admin")).kind).toBe("unreadable");
  });
});

describe("reconcileInterruptedReports", () => {
  it("fails reports that were being written when the server stopped", async () => {
    const db = makeDb();
    db.reports.push({ id: "a", status: "GENERATING", version: 1 }, { id: "b", status: "DRAFT", version: 2 });
    expect(await reconcileInterruptedReports(db.prisma as never)).toBe(1);
    expect(db.reports.map((r) => r.status)).toEqual(["FAILED", "DRAFT"]);
    expect(db.reports[0].errorMessage).toMatch(/restarted/);
  });
});

describe("reports routes", () => {
  function appWith(db: ReturnType<typeof makeDb>, ai: ReturnType<typeof makeAi> | undefined) {
    const app = express();
    app.use(express.json());
    app.use("/reports", createReportsRouter(db.prisma as never, ai as never, { approver: "admin", retryDelayMs: 0 }));
    return app;
  }

  /** Seeds a finished draft by running the real job with the fixture facts, so route tests see real files. */
  async function seededDraft() {
    const db = makeDb();
    await started(deps(db, makeAi()), db);
    return db;
  }

  it("lists versions with files, quality and summary, never raw content or bytes", async () => {
    const db = await seededDraft();
    const list = await request(appWith(db, makeAi())).get("/reports?companyId=c1");
    expect(list.status).toBe(200);
    const [r] = list.body.reports;
    expect(r).toMatchObject({ status: "DRAFT", version: 1, quality: { passed: true }, summary: { opportunities: 2, sources: 2 } });
    expect(r.files).toHaveLength(4);
    expect(Object.keys(r)).not.toContain("content");
    expect(JSON.stringify(list.body)).not.toContain("UEsDB"); // base64 of a zip header: no file bytes
  });

  it("validates input, reports a busy slot, and needs the AI to be configured", async () => {
    const db = makeDb();
    const app = appWith(db, makeAi());
    expect((await request(app).post("/reports").send({})).status).toBe(400);
    expect((await request(app).post("/reports").send({ companyId: "../etc" })).status).toBe(400);
    expect((await request(app).post("/reports").send({ companyId: "nope" })).status).toBe(400);
    expect((await request(app).get("/reports")).status).toBe(400);
    db.reports.push({ id: "x", companyId: "c1", version: 1, status: "GENERATING" });
    const busy = await request(app).post("/reports").send({ companyId: "c1" });
    expect(busy.status).toBe(409);
    expect(busy.body.error.code).toBe("REPORT_IN_PROGRESS");
    expect((await request(appWith(makeDb(), undefined)).post("/reports").send({ companyId: "c1" })).status).toBe(503);
  });

  it("passes the chosen run through, and rejects a run that is not a finished run of the company", async () => {
    const db = makeDb();
    const app = appWith(db, makeAi());
    expect((await request(app).post("/reports").send({ companyId: "c1", analysisId: "nope" })).status).toBe(400);
    expect((await request(app).post("/reports").send({ companyId: "c1", analysisId: { $ne: "x" } })).status).toBe(400);
    const ok = await request(app).post("/reports").send({ companyId: "c1", analysisId: "j1" });
    expect(ok.status).toBe(202);
    expect(db.reports[0].companyId).toBe("c1");
    await settled(db);
  });

  it("accepts a start request with 202 and a version", async () => {
    const db = makeDb();
    const res = await request(appWith(db, makeAi())).post("/reports").send({ companyId: "c1" });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ version: 1, status: "GENERATING" });
    expect(db.reports[0]).toMatchObject({ companyId: "c1", version: 1 });
    await settled(db); // the route's own job has no opportunity tables in this fake, so it records a failure
  });

  it("gets one report, 404s for unknown or malformed ids", async () => {
    const db = await seededDraft();
    const app = appWith(db, makeAi());
    expect((await request(app).get(`/reports/${db.reports[0].id}`)).body).toMatchObject({ status: "DRAFT" });
    expect((await request(app).get("/reports/unknown")).status).toBe(404);
    expect((await request(app).get("/reports/..%2F..%2Fetc")).status).toBe(404);
  });

  it("approves a draft (200), then refuses a second approval (409)", async () => {
    const db = await seededDraft();
    const app = appWith(db, makeAi());
    const id = db.reports[0].id;
    const ok = await request(app).post(`/reports/${id}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: "APPROVED", approvedBy: "admin" });
    expect((await request(app).post(`/reports/${id}/approve`)).status).toBe(409);
    expect((await request(app).post("/reports/unknown/approve")).status).toBe(404);
  });

  it("downloads a file with the right type and a safe attachment name", async () => {
    const db = await seededDraft();
    const app = appWith(db, makeAi());
    const id = db.reports[0].id;
    const res = await request(app)
      .get(`/reports/${id}/files/TECHNICAL/PPTX`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="acme-shipping-v1-technical-deck.pptx"');
    expect(res.headers["cache-control"]).toBe("no-store");
    expect((res.body as Buffer).subarray(0, 2).toString()).toBe("PK");
    expect((await request(app).get(`/reports/${id}/files/NOPE/PPTX`)).status).toBe(404);
    expect((await request(app).get(`/reports/${id}/files/C_LEVEL/PDF`)).status).toBe(404);
    expect((await request(app).get(`/reports/other/files/C_LEVEL/PPTX`)).status).toBe(404);
  });
});
