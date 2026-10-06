import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../asyncHandler.js";
import { parseCompanyIdQuery } from "./companies.js";

const BAD_COMPANY = { error: { code: "VALIDATION_ERROR", message: "companyId must be a single id" } };

/**
 * Read-only cross-opportunity lists backing the Evidence Explorer and PoV Pipeline screens.
 * Both accept an optional ?companyId= so the screens can show only the selected company's rows.
 */
export function createEvidenceListRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const company = parseCompanyIdQuery(req.query.companyId);
      if (!company.ok) {
        res.status(400).json(BAD_COMPANY);
        return;
      }
      const evidence = await prisma.evidence.findMany({
        where: company.id ? { opportunity: { companyId: company.id } } : undefined,
        orderBy: { capturedAt: "desc" },
        include: { opportunity: { select: { id: true, title: true } } },
      });
      res.status(200).json(evidence);
    })
  );
  return router;
}

export function createExperimentsListRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const company = parseCompanyIdQuery(req.query.companyId);
      if (!company.ok) {
        res.status(400).json(BAD_COMPANY);
        return;
      }
      const experiments = await prisma.experiment.findMany({
        where: company.id ? { opportunity: { companyId: company.id } } : undefined,
        orderBy: { createdAt: "desc" },
        include: {
          opportunity: { select: { id: true, title: true } },
          _count: { select: { learnings: true } },
        },
      });
      res.status(200).json(experiments);
    })
  );
  return router;
}
