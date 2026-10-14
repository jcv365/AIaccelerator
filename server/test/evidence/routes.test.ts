import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createEvidenceDocumentsRouter, cleanFilename } from "../../src/evidence/routes.js";

type Mock = ReturnType<typeof vi.fn>;
const m = (o: unknown, k: string, fn: string) => (o as Record<string, Record<string, Mock>>)[k][fn];

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    company: { findUnique: vi.fn().mockResolvedValue({ id: "c1", name: "Maersk" }) },
    evidenceDocument: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: `d-${String(data.filename)}`,
        uploadedAt: new Date("2026-10-14T09:00:00Z"),
        deletedAt: null,
        ...data,
      })),
      update: vi.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: where.id,
        filename: "old.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
        charCount: 5,
        truncated: false,
        uploadedAt: new Date("2026-10-01T09:00:00Z"),
        ...data,
      })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  };
}

function appWith(prisma: unknown) {
  const app = express();
  app.use("/companies", createEvidenceDocumentsRouter(prisma as never));
  return app;
}

const text = (s: string) => Buffer.from(s);

describe("POST /companies/:id/evidence-documents", () => {
  it("stores the extracted text for each accepted file and never returns it", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma))
      .post("/companies/c1/evidence-documents")
      .attach("files", text("Claims take 12 days."), "claims.txt");
    expect(res.status).toBe(201);
    expect(res.body.rejected).toEqual([]);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0]).toMatchObject({ filename: "claims.txt", charCount: 20, truncated: false, duplicate: false });
    expect(res.body.documents[0]).not.toHaveProperty("extractedText");
    const data = m(prisma, "evidenceDocument", "create").mock.calls[0][0].data;
    expect(data).toMatchObject({ companyId: "c1", filename: "claims.txt", extractedText: "Claims take 12 days.", sizeBytes: 20 });
    expect(data.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("answers 404 for an unknown company without reading the upload", async () => {
    const prisma = makePrisma({ company: { findUnique: vi.fn().mockResolvedValue(null) } });
    const res = await request(appWith(prisma))
      .post("/companies/nope/evidence-documents")
      .attach("files", text("hello"), "a.txt");
    expect(res.status).toBe(404);
    expect(m(prisma, "evidenceDocument", "create")).not.toHaveBeenCalled();
  });

  it("treats the same file again as a duplicate: nothing new is stored", async () => {
    const prisma = makePrisma();
    m(prisma, "evidenceDocument", "findUnique").mockResolvedValue({
      id: "d1", filename: "claims.txt", mimeType: "text/plain", sizeBytes: 20, charCount: 20, truncated: false,
      uploadedAt: new Date("2026-10-01T09:00:00Z"), deletedAt: null,
    });
    const res = await request(appWith(prisma))
      .post("/companies/c1/evidence-documents")
      .attach("files", text("Claims take 12 days."), "again.txt");
    expect(res.status).toBe(201);
    expect(res.body.documents[0]).toMatchObject({ id: "d1", duplicate: true });
    expect(m(prisma, "evidenceDocument", "create")).not.toHaveBeenCalled();
    expect(m(prisma, "evidenceDocument", "update")).not.toHaveBeenCalled();
  });

  it("brings back a removed document when the same file is uploaded again", async () => {
    const prisma = makePrisma();
    m(prisma, "evidenceDocument", "findUnique").mockResolvedValue({ id: "d1", deletedAt: new Date("2026-10-02T00:00:00Z") });
    const res = await request(appWith(prisma))
      .post("/companies/c1/evidence-documents")
      .attach("files", text("Claims take 12 days."), "claims.txt");
    expect(res.status).toBe(201);
    expect(m(prisma, "evidenceDocument", "update")).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d1" }, data: expect.objectContaining({ deletedAt: null }) })
    );
  });

  it("accepts the good files and explains each rejected one", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma))
      .post("/companies/c1/evidence-documents")
      .attach("files", text("Real notes"), "notes.txt")
      .attach("files", text("MZ"), "tool.exe")
      .attach("files", text("   "), "empty.txt");
    expect(res.status).toBe(201);
    expect(res.body.documents.map((d: { filename: string }) => d.filename)).toEqual(["notes.txt"]);
    expect(res.body.rejected).toEqual([
      expect.objectContaining({ filename: "tool.exe", code: "UNSUPPORTED_TYPE" }),
      expect.objectContaining({ filename: "empty.txt", code: "NO_TEXT" }),
    ]);
  });

  it("answers 422 when every file is rejected", async () => {
    const res = await request(appWith(makePrisma()))
      .post("/companies/c1/evidence-documents")
      .attach("files", text("MZ"), "tool.exe");
    expect(res.status).toBe(422);
    expect(res.body.rejected[0].code).toBe("UNSUPPORTED_TYPE");
  });

  it("refuses a file over 10 MB with 413", async () => {
    const res = await request(appWith(makePrisma()))
      .post("/companies/c1/evidence-documents")
      .attach("files", Buffer.alloc(10 * 1024 * 1024 + 1, 97), "big.txt");
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("TOO_LARGE");
  });

  it("refuses more than 5 files at once", async () => {
    const req = request(appWith(makePrisma())).post("/companies/c1/evidence-documents");
    for (let i = 0; i < 6; i++) req.attach("files", text(`file ${i}`), `f${i}.txt`);
    const res = await req;
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("TOO_MANY_FILES");
  });

  it("refuses a request with no files, and a file in the wrong field", async () => {
    const none = await request(appWith(makePrisma())).post("/companies/c1/evidence-documents").field("x", "y");
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe("VALIDATION_ERROR");
    const wrong = await request(appWith(makePrisma()))
      .post("/companies/c1/evidence-documents")
      .attach("document", text("hello"), "a.txt");
    expect(wrong.status).toBe(400);
  });
});

describe("cleanFilename", () => {
  it("keeps only the base name and removes control characters", () => {
    expect(cleanFilename("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(cleanFilename("C:\\Users\\x\\Budget 2025.xlsx")).toBe("Budget 2025.xlsx");
    expect(cleanFilename("bad\u0000na\nme.txt")).toBe("badname.txt");
    expect(cleanFilename("   ")).toBe("document");
    expect(cleanFilename("a".repeat(300) + ".txt").length).toBeLessThanOrEqual(120);
  });

  it("repairs UTF-8 names that arrive decoded as Latin-1", () => {
    const garbled = Buffer.from("Café-notes.txt", "utf8").toString("latin1");
    expect(cleanFilename(garbled)).toBe("Café-notes.txt");
    expect(cleanFilename("Café-notes.txt")).toBe("Café-notes.txt");
  });
});

describe("GET /companies/:id/evidence-documents", () => {
  it("lists the company's documents, newest first, without their text", async () => {
    const prisma = makePrisma();
    m(prisma, "evidenceDocument", "findMany").mockResolvedValue([
      { id: "d2", filename: "b.pdf", mimeType: "application/pdf", sizeBytes: 9, charCount: 4, truncated: true, uploadedAt: new Date("2026-10-12T00:00:00Z") },
    ]);
    const res = await request(appWith(prisma)).get("/companies/c1/evidence-documents");
    expect(res.status).toBe(200);
    expect(res.body.documents).toEqual([
      { id: "d2", filename: "b.pdf", mimeType: "application/pdf", sizeBytes: 9, charCount: 4, truncated: true, uploadedAt: "2026-10-12T00:00:00.000Z" },
    ]);
    const args = m(prisma, "evidenceDocument", "findMany").mock.calls[0][0];
    expect(args.where).toEqual({ companyId: "c1", deletedAt: null });
    expect(args.orderBy).toEqual({ uploadedAt: "desc" });
    expect(args.select).not.toHaveProperty("extractedText");
  });

  it("answers 404 for an unknown company", async () => {
    const prisma = makePrisma({ company: { findUnique: vi.fn().mockResolvedValue(null) } });
    expect((await request(appWith(prisma)).get("/companies/nope/evidence-documents")).status).toBe(404);
  });
});

describe("DELETE /companies/:id/evidence-documents/:docId", () => {
  it("hides the document from future scans, only within that company", async () => {
    const prisma = makePrisma();
    const res = await request(appWith(prisma)).delete("/companies/c1/evidence-documents/d1");
    expect(res.status).toBe(204);
    expect(m(prisma, "evidenceDocument", "updateMany")).toHaveBeenCalledWith({
      where: { id: "d1", companyId: "c1", deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("answers 404 when it is not this company's document, or is already removed", async () => {
    const prisma = makePrisma();
    m(prisma, "evidenceDocument", "updateMany").mockResolvedValue({ count: 0 });
    expect((await request(appWith(prisma)).delete("/companies/c1/evidence-documents/other")).status).toBe(404);
  });
});
