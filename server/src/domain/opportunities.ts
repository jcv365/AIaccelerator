import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../asyncHandler.js";
import { isValidTransition, validTransitionsFrom, type OpportunityStatus } from "./stateMachine.js";
import type { AiClient } from "../ai/client.js";
import { AiClientError, aiErrorStatus } from "../ai/errors.js";
import { createAnalysisRouter } from "./analysis.js";
import { EXPERIMENT_STATUSES } from "./experimentStatus.js";
import { DATA_NOTICE, dataBlock } from "../ai/promptSafety.js";

// Bounds for text placed into the report prompt (keeps prompts small and limits what injected text can carry).
const REPORT_FIELD_CHARS = 2000;
const REPORT_ITEM_CHARS = 1000;
const REPORT_MAX_ITEMS = 50;

const EDITABLE_FIELDS = [
  "title",
  "description",
  "businessProblem",
  "potentialValue",
  "complexity",
  "dependencies",
  "aiSuitability",
  "risks",
  "owner",
  "hypothesis",
] as const;

function pickEditableFields(body: Record<string, unknown>): { data: Record<string, unknown>; error?: string } {
  const result: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      const value = body[field];
      // null clears an optional field back to empty; the title is required and can never be cleared.
      if (value === null) {
        if (field === "title") return { data: {}, error: "title cannot be cleared" };
      } else if (value !== undefined && typeof value !== "string") {
        return { data: {}, error: `${field} must be a string` };
      }
      result[field] = value;
    }
  }
  return { data: result };
}


function pickExperimentUpdateFields(body: Record<string, unknown>): { data: Record<string, unknown>; error?: string } {
  const result: Record<string, unknown> = {};
  if ("title" in body) {
    if (typeof body.title !== "string") return { data: {}, error: "title must be a string" };
    result.title = body.title;
  }
  if ("method" in body) {
    if (typeof body.method !== "string") return { data: {}, error: "method must be a string" };
    result.method = body.method;
  }
  if ("status" in body) {
    if (typeof body.status !== "string" || !EXPERIMENT_STATUSES.includes(body.status)) {
      return { data: {}, error: `status must be one of ${EXPERIMENT_STATUSES.join(", ")}` };
    }
    result.status = body.status;
  }
  // For the optional fields below, null clears the value back to empty.
  if ("resultSummary" in body) {
    if (body.resultSummary !== undefined && body.resultSummary !== null && typeof body.resultSummary !== "string") {
      return { data: {}, error: "resultSummary must be a string" };
    }
    result.resultSummary = body.resultSummary;
  }
  if ("success" in body) {
    if (body.success !== undefined && body.success !== null && typeof body.success !== "boolean") {
      return { data: {}, error: "success must be a boolean" };
    }
    result.success = body.success;
  }
  for (const field of ["startedAt", "completedAt"] as const) {
    if (!(field in body)) continue;
    const value = body[field];
    if (value === null) {
      result[field] = null;
      continue;
    }
    if (typeof value !== "string") return { data: {}, error: `${field} must be an ISO date string` };
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { data: {}, error: `${field} must be a valid ISO date string` };
    result[field] = date;
  }
  return { data: result };
}

export function createOpportunitiesRouter(prisma: PrismaClient, aiClient?: AiClient): Router {
  const router = Router();

  // Mounted first so "/analyze" is never captured by the "/:id" routes below.
  router.use("/analyze", createAnalysisRouter(prisma, aiClient));

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const opportunities = await prisma.opportunity.findMany({
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { evidence: true, decisions: true } } },
      });
      res.status(200).json(opportunities);
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.title !== "string" || body.title.trim() === "") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "title is required" } });
        return;
      }
      const picked = pickEditableFields(body);
      if (picked.error) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: picked.error } });
        return;
      }
      const opportunity = await prisma.opportunity.create({
        data: picked.data as { title: string },
      });
      res.status(201).json(opportunity);
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: req.params.id },
        include: {
          evidence: true,
          decisions: true,
          experiments: { orderBy: { createdAt: "asc" }, include: { learnings: { orderBy: { createdAt: "asc" } } } },
        },
      });
      if (!opportunity) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
        return;
      }
      res.status(200).json(opportunity);
    })
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const existing = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const picked = pickEditableFields(body);
      if (picked.error) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: picked.error } });
        return;
      }
      const updated = await prisma.opportunity.update({
        where: { id: req.params.id },
        data: picked.data,
      });
      res.status(200).json(updated);
    })
  );

  router.patch(
    "/:id/status",
    asyncHandler(async (req, res) => {
      const existing = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
        return;
      }
      const { status } = (req.body ?? {}) as { status?: unknown };
      const currentStatus = existing.status as OpportunityStatus;
      if (typeof status !== "string" || !isValidTransition(currentStatus, status as OpportunityStatus)) {
        const valid = validTransitionsFrom(currentStatus);
        res.status(400).json({
          error: {
            code: "INVALID_TRANSITION",
            message: `Cannot transition from ${currentStatus} to ${String(status)}. Valid: ${
              valid.join(", ") || "none (terminal)"
            }`,
          },
        });
        return;
      }
      const updated = await prisma.opportunity.update({
        where: { id: req.params.id },
        data: { status: status as OpportunityStatus },
      });
      res.status(200).json(updated);
    })
  );

  const EVIDENCE_TYPES = ["FACT", "INFERENCE", "ASSUMPTION", "AI_HYPOTHESIS"];

  router.post(
    "/:id/evidence",
    asyncHandler(async (req, res) => {
      const existing = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.claim !== "string" || body.claim.trim() === "" || !EVIDENCE_TYPES.includes(body.type as string)) {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "claim is required and type must be one of FACT, INFERENCE, ASSUMPTION, AI_HYPOTHESIS",
          },
        });
        return;
      }
      if (body.confidence !== undefined && typeof body.confidence !== "number") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "confidence must be a number" } });
        return;
      }
      const evidence = await prisma.evidence.create({
        data: {
          opportunityId: req.params.id,
          claim: body.claim,
          type: body.type as string,
          confidence: body.confidence as number | undefined,
          source: body.source as string | undefined,
          location: body.location as string | undefined,
          excerpt: body.excerpt as string | undefined,
        } as never,
      });
      res.status(201).json(evidence);
    })
  );

  router.post(
    "/:id/decisions",
    asyncHandler(async (req, res) => {
      const existing = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.decision !== "string" || body.decision.trim() === "") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "decision is required" } });
        return;
      }
      if (body.confidence !== undefined && typeof body.confidence !== "number") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "confidence must be a number" } });
        return;
      }
      const decision = await prisma.decision.create({
        data: {
          opportunityId: req.params.id,
          decision: body.decision,
          rationale: body.rationale as string | undefined,
          assumptions: body.assumptions as string | undefined,
          confidence: body.confidence as number | undefined,
          alternativesConsidered: body.alternativesConsidered as string | undefined,
          risks: body.risks as string | undefined,
          owner: body.owner as string | undefined,
        } as never,
      });
      res.status(201).json(decision);
    })
  );

  router.post(
    "/:id/report",
    asyncHandler(async (req, res, next) => {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: req.params.id },
        include: { evidence: true, decisions: true },
      });
      if (!opportunity) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
        return;
      }
      if (!aiClient) {
        res.status(503).json({ error: { code: "AI_NOT_CONFIGURED", message: "AI backend is not configured" } });
        return;
      }
      const system = `You are a business analyst producing a concise report on an AI opportunity. Base your report only on the information given below. Clearly distinguish established facts from inferences or assumptions. Do not invent information not present in the input. ${DATA_NOTICE}`;
      // Every user-entered or web-collected field is bounded and fenced (see ai/promptSafety.ts).
      const evidenceLines = opportunity.evidence.length
        ? opportunity.evidence
            .slice(0, REPORT_MAX_ITEMS)
            .map((e: { type: string; claim: string }) => dataBlock(`evidence ${e.type}`, e.claim, REPORT_ITEM_CHARS))
            .join("\n")
        : "(none)";
      const decisionLines = opportunity.decisions.length
        ? opportunity.decisions
            .slice(0, REPORT_MAX_ITEMS)
            .map((d: { decision: string; rationale: string | null }) =>
              dataBlock("decision", `${d.decision}${d.rationale ? ` — ${d.rationale}` : ""}`, REPORT_ITEM_CHARS)
            )
            .join("\n")
        : "(none)";
      const prompt = `Opportunity:
${dataBlock("title", opportunity.title, 300)}
${dataBlock("description", opportunity.description ?? "—", REPORT_FIELD_CHARS)}
${dataBlock("business problem", opportunity.businessProblem ?? "—", REPORT_FIELD_CHARS)}
Status: ${opportunity.status}

Evidence:
${evidenceLines}

Decisions:
${decisionLines}

Write a concise report (3-5 paragraphs) summarizing the opportunity, the strength of the evidence, and the decisions made so far.`;
      try {
        const result = await aiClient.quickAsk("Fusion", system, prompt, 90_000);
        res.status(200).json({ report: result.response });
      } catch (err) {
        if (err instanceof AiClientError) {
          res.status(aiErrorStatus(err.code)).json({ error: { code: err.code, message: err.message } });
          return;
        }
        next(err);
      }
    })
  );

  router.post(
    "/:id/experiments",
    asyncHandler(async (req, res) => {
      const existing = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Opportunity not found" } });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.title !== "string" || body.title.trim() === "" || typeof body.method !== "string" || body.method.trim() === "") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "title and method are required" } });
        return;
      }
      const experiment = await prisma.experiment.create({
        data: { opportunityId: req.params.id, title: body.title, method: body.method },
      });
      res.status(201).json(experiment);
    })
  );

  router.patch(
    "/:id/experiments/:experimentId",
    asyncHandler(async (req, res) => {
      const existing = await prisma.experiment.findFirst({
        where: { id: req.params.experimentId, opportunityId: req.params.id },
      });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Experiment not found" } });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const picked = pickExperimentUpdateFields(body);
      if (picked.error) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: picked.error } });
        return;
      }
      const updated = await prisma.experiment.update({
        where: { id: req.params.experimentId },
        data: picked.data,
      });
      res.status(200).json(updated);
    })
  );

  router.post(
    "/:id/experiments/:experimentId/learnings",
    asyncHandler(async (req, res) => {
      const experiment = await prisma.experiment.findFirst({
        where: { id: req.params.experimentId, opportunityId: req.params.id },
      });
      if (!experiment) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Experiment not found" } });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.insight !== "string" || body.insight.trim() === "") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "insight is required" } });
        return;
      }
      const learning = await prisma.learning.create({
        data: { experimentId: req.params.experimentId, insight: body.insight },
      });
      res.status(201).json(learning);
    })
  );

  router.delete(
    "/:id/experiments/:experimentId",
    asyncHandler(async (req, res) => {
      const existing = await prisma.experiment.findFirst({
        where: { id: req.params.experimentId, opportunityId: req.params.id },
      });
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Experiment not found" } });
        return;
      }
      // Learnings reference the experiment, so they go with it - atomically, never leaving orphans.
      await prisma.$transaction([
        prisma.learning.deleteMany({ where: { experimentId: req.params.experimentId } }),
        prisma.experiment.delete({ where: { id: req.params.experimentId } }),
      ]);
      res.status(204).end();
    })
  );

  // The learning lookup is scoped to the experiment AND its opportunity, so ids from another
  // opportunity can never be edited or deleted through this URL.
  const findScopedLearning = (req: { params: Record<string, string> }) =>
    prisma.learning.findFirst({
      where: {
        id: req.params.learningId,
        experimentId: req.params.experimentId,
        experiment: { opportunityId: req.params.id },
      },
    });

  router.patch(
    "/:id/experiments/:experimentId/learnings/:learningId",
    asyncHandler(async (req, res) => {
      const existing = await findScopedLearning(req);
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Learning not found" } });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.insight !== "string" || body.insight.trim() === "") {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "insight is required" } });
        return;
      }
      const updated = await prisma.learning.update({
        where: { id: req.params.learningId },
        data: { insight: body.insight },
      });
      res.status(200).json(updated);
    })
  );

  router.delete(
    "/:id/experiments/:experimentId/learnings/:learningId",
    asyncHandler(async (req, res) => {
      const existing = await findScopedLearning(req);
      if (!existing) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Learning not found" } });
        return;
      }
      await prisma.learning.delete({ where: { id: req.params.learningId } });
      res.status(204).end();
    })
  );

  return router;
}
