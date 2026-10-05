import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../asyncHandler.js";

/** Read-only cross-opportunity lists backing the Evidence Explorer and PoV Pipeline screens. */
export function createEvidenceListRouter(prisma: PrismaClient): Router {
  const router = Router();
  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const evidence = await prisma.evidence.findMany({
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
    asyncHandler(async (_req, res) => {
      const experiments = await prisma.experiment.findMany({
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
