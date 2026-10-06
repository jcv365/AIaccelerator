import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AiClient } from "../ai/client.js";
import { asyncHandler } from "../asyncHandler.js";
import type { QualityReport } from "./gates.js";
import { approveReport, startReport, type ReportDeps } from "./service.js";

// Company-level report API. Mounted behind requireAuth. Listing never loads file bytes; downloads stream one file.

const MIME = {
  PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
const AUDIENCES = ["C_LEVEL", "TECHNICAL"] as const;
const FORMATS = ["PPTX", "DOCX"] as const;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const error = (code: string, message: string) => ({ error: { code, message } });

type ReportRow = Prisma.CompanyReportGetPayload<{
  include: { deliverables: { select: { audience: true; format: true; filename: true; sizeBytes: true } } };
}>;

function view(r: ReportRow) {
  const quality = r.qualityReport as QualityReport | null;
  const content = r.content as { executive?: { headline?: string }; opportunities?: unknown[] } | null;
  const saved = r.sources as { sources?: unknown[] } | null;
  return {
    id: r.id,
    companyId: r.companyId,
    version: r.version,
    status: r.status,
    stage: r.stage,
    error: r.errorMessage,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    approvedAt: r.approvedAt,
    approvedBy: r.approvedBy,
    summary: content?.executive?.headline ? { headline: content.executive.headline, opportunities: content.opportunities?.length ?? 0, sources: saved?.sources?.length ?? 0 } : null,
    quality: quality ? { passed: quality.passed, checks: quality.checks.map((c) => ({ id: c.id, name: c.name, passed: c.passed, details: c.passed ? [] : c.details.slice(0, 8) })) } : null,
    files: r.deliverables.map((d) => ({ audience: d.audience, format: d.format, filename: d.filename, sizeBytes: d.sizeBytes })),
  };
}

const INCLUDE = { deliverables: { select: { audience: true, format: true, filename: true, sizeBytes: true }, orderBy: [{ audience: "asc" as const }, { format: "asc" as const }] } };

export function createReportsRouter(prisma: PrismaClient, aiClient: AiClient | undefined, opts: { approver: string; retryDelayMs?: number }): Router {
  const router = Router();

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      if (!aiClient) {
        res.status(503).json(error("AI_NOT_CONFIGURED", "AI backend is not configured"));
        return;
      }
      const companyId = (req.body ?? {}).companyId;
      if (typeof companyId !== "string" || !ID.test(companyId)) {
        res.status(400).json(error("VALIDATION_ERROR", "companyId must be an existing company"));
        return;
      }
      const deps: ReportDeps = { prisma, aiClient, retryDelayMs: opts.retryDelayMs };
      const result = await startReport(deps, companyId);
      if (result.kind === "company_not_found") {
        res.status(400).json(error("VALIDATION_ERROR", "companyId must be an existing company"));
      } else if (result.kind === "busy") {
        res.status(409).json(error("REPORT_IN_PROGRESS", "A report is already being written. Try again when it finishes."));
      } else {
        res.status(202).json({ reportId: result.reportId, version: result.version, status: "GENERATING" });
      }
    })
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const companyId = req.query.companyId;
      if (typeof companyId !== "string" || !ID.test(companyId)) {
        res.status(400).json(error("VALIDATION_ERROR", "companyId is required"));
        return;
      }
      const rows = await prisma.companyReport.findMany({ where: { companyId }, orderBy: { version: "desc" }, take: 50, include: INCLUDE });
      res.json({ reports: rows.map(view) });
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const row = ID.test(req.params.id) ? await prisma.companyReport.findUnique({ where: { id: req.params.id }, include: INCLUDE }) : null;
      if (!row) {
        res.status(404).json(error("NOT_FOUND", "Report not found"));
        return;
      }
      res.json(view(row));
    })
  );

  router.post(
    "/:id/approve",
    asyncHandler(async (req, res) => {
      if (!ID.test(req.params.id)) {
        res.status(404).json(error("NOT_FOUND", "Report not found"));
        return;
      }
      const result = await approveReport(prisma, req.params.id, opts.approver);
      if (result.kind === "not_found") res.status(404).json(error("NOT_FOUND", "Report not found"));
      else if (result.kind === "not_draft") res.status(409).json(error("NOT_DRAFT", "Only a finished draft can be approved"));
      else if (result.kind === "unreadable") res.status(500).json(error("REPORT_UNREADABLE", "The saved report could not be read"));
      else {
        const row = await prisma.companyReport.findUnique({ where: { id: req.params.id }, include: INCLUDE });
        res.json(row ? view(row) : { id: req.params.id, status: "APPROVED" });
      }
    })
  );

  router.get(
    "/:id/files/:audience/:format",
    asyncHandler(async (req, res) => {
      const { id, audience, format } = req.params;
      if (!ID.test(id) || !(AUDIENCES as readonly string[]).includes(audience) || !(FORMATS as readonly string[]).includes(format)) {
        res.status(404).json(error("NOT_FOUND", "File not found"));
        return;
      }
      const file = await prisma.deliverable.findUnique({
        where: { companyReportId_audience_format: { companyReportId: id, audience: audience as (typeof AUDIENCES)[number], format: format as (typeof FORMATS)[number] } },
      });
      if (!file) {
        res.status(404).json(error("NOT_FOUND", "File not found"));
        return;
      }
      res.setHeader("Content-Type", MIME[file.format]);
      res.setHeader("Content-Disposition", `attachment; filename="${file.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(Buffer.from(file.content));
    })
  );

  return router;
}
