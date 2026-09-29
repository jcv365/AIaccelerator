import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../asyncHandler.js";
import { isValidTransition, validTransitionsFrom, type OpportunityStatus } from "./stateMachine.js";
import type { AiClient } from "../ai/client.js";
import { AiClientError, aiErrorStatus } from "../ai/errors.js";

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
      if (value !== undefined && typeof value !== "string") {
        return { data: {}, error: `${field} must be a string` };
      }
      result[field] = value;
    }
  }
  return { data: result };
}

export function createOpportunitiesRouter(prisma: PrismaClient, aiClient?: AiClient): Router {
  const router = Router();

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
        include: { evidence: true, decisions: true },
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
      const system =
        "You are a business analyst producing a concise report on an AI opportunity. Base your report only on the information given below. Clearly distinguish established facts from inferences or assumptions. Do not invent information not present in the input.";
      const evidenceLines = opportunity.evidence.length
        ? opportunity.evidence.map((e: { type: string; claim: string }) => `- [${e.type}] ${e.claim}`).join("\n")
        : "(none)";
      const decisionLines = opportunity.decisions.length
        ? opportunity.decisions
            .map((d: { decision: string; rationale: string | null }) => `- ${d.decision}${d.rationale ? ` — ${d.rationale}` : ""}`)
            .join("\n")
        : "(none)";
      const prompt = `Opportunity: ${opportunity.title}
Description: ${opportunity.description ?? "—"}
Business problem: ${opportunity.businessProblem ?? "—"}
Status: ${opportunity.status}

Evidence:
${evidenceLines}

Decisions:
${decisionLines}

Write a concise report (3-5 paragraphs) summarizing the opportunity, the strength of the evidence, and the decisions made so far.`;
      try {
        const result = await aiClient.quickAsk("Claude", system, prompt, 90_000);
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

  return router;
}
