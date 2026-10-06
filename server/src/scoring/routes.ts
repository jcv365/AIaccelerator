import { Router, type Response, type NextFunction } from "express";
import type { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../asyncHandler.js";
import type { AiClient } from "../ai/client.js";
import { AiClientError, aiErrorStatus } from "../ai/errors.js";
import { DATA_NOTICE, dataBlock } from "../ai/promptSafety.js";
import { logJson } from "../logger.js";
import { parseCompanyIdQuery } from "../domain/companies.js";
import {
  BAD_AI_OUTPUT,
  boundedString,
  clampNumber,
  extractJsonObject,
  pickEnum,
  stringList,
} from "./aiJson.js";
import { computeEvidenceScore } from "./evidenceScore.js";
import { toCsv } from "./csv.js";

const MODEL = "Fusion";
const AI_TIMEOUT_MS = 90_000;
const FIELD_CHARS = 1500;
const ITEM_CHARS = 600;
const MAX_ITEMS = 40;

const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
const LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;
const RECOMMENDATIONS = ["PROCEED_TO_POV", "INVESTIGATE", "STOP", "NO_AI"] as const;

export const READINESS_DIMENSIONS = [
  { key: "strategy_governance", label: "Strategy & Governance" },
  { key: "data_infrastructure", label: "Data & Infrastructure" },
  { key: "people_skills", label: "People & Skills" },
  { key: "risk_compliance", label: "Risk & Compliance" },
  { key: "change_adoption", label: "Change & Adoption" },
] as const;

export const STANDARD_REPORT_TYPES = ["executive-summary", "portfolio", "evidence", "pov-results", "roi"] as const;
type StandardReportType = (typeof STANDARD_REPORT_TYPES)[number];

const NOT_CONFIGURED = { error: { code: "AI_NOT_CONFIGURED", message: "AI backend is not configured" } };
const NOT_FOUND_OPP = { error: { code: "NOT_FOUND", message: "Opportunity not found" } };

function handleAiError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof AiClientError) {
    res.status(aiErrorStatus(err.code)).json({ error: { code: err.code, message: err.message } });
    return;
  }
  next(err);
}

/** Ask the model for strict JSON. */
async function askJson(aiClient: AiClient, system: string, prompt: string) {
  const result = await aiClient.quickAsk(MODEL, system, prompt, AI_TIMEOUT_MS);
  return { model: result.model, json: extractJsonObject(result.response) };
}

// ---------------------------------------------------------------------------------------------
// Per-opportunity: AI assessment and evidence quality. Mounted at /opportunities BEFORE the main
// opportunities router; paths it does not handle fall through to that router.
// ---------------------------------------------------------------------------------------------
export function createOpportunityScoringRouter(prisma: PrismaClient, aiClient?: AiClient): Router {
  const router = Router();

  router.get(
    "/:id/assessment",
    asyncHandler(async (req, res) => {
      const latest = await prisma.opportunityAssessment.findFirst({
        where: { opportunityId: req.params.id },
        orderBy: { createdAt: "desc" },
      });
      if (!latest) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "No assessment has been run yet" } });
        return;
      }
      res.status(200).json(latest);
    })
  );

  router.post(
    "/:id/assessment",
    asyncHandler(async (req, res, next) => {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: req.params.id },
        include: { evidence: true, decisions: true },
      });
      if (!opportunity) {
        res.status(404).json(NOT_FOUND_OPP);
        return;
      }
      if (!aiClient) {
        res.status(503).json(NOT_CONFIGURED);
        return;
      }
      const system =
        "You are an AI-opportunity analyst. Assess ONE opportunity using only the information given. " +
        "Do not invent facts or figures. If the input does not support a value estimate, set estimatedAnnualValue to null. " +
        "Reply with a single JSON object and nothing else. " +
        DATA_NOTICE;
      const evidence = opportunity.evidence
        .slice(0, MAX_ITEMS)
        .map((e: { type: string; claim: string }) => dataBlock(`evidence ${e.type}`, e.claim, ITEM_CHARS))
        .join("\n");
      const decisions = opportunity.decisions
        .slice(0, MAX_ITEMS)
        .map((d: { decision: string; rationale: string | null }) =>
          dataBlock("decision", `${d.decision}${d.rationale ? ` - ${d.rationale}` : ""}`, ITEM_CHARS)
        )
        .join("\n");
      const prompt = `Opportunity:
${dataBlock("title", opportunity.title, 300)}
${dataBlock("description", opportunity.description ?? "-", FIELD_CHARS)}
${dataBlock("business problem", opportunity.businessProblem ?? "-", FIELD_CHARS)}
${dataBlock("potential value (user text)", opportunity.potentialValue ?? "-", 300)}
Status: ${opportunity.status}

Evidence:
${evidence || "(none)"}

Decisions:
${decisions || "(none)"}

Return JSON with exactly these keys:
{
  "category": short business area such as "Finance", "Operations", "Sales" (string),
  "estimatedAnnualValue": whole South African rand per year, or null if not supported by the input (number|null),
  "priority": "HIGH" | "MEDIUM" | "LOW",
  "recommendation": "PROCEED_TO_POV" | "INVESTIGATE" | "STOP" | "NO_AI",
  "confidence": 0 to 1 (number),
  "effort": "HIGH" | "MEDIUM" | "LOW",
  "risk": "HIGH" | "MEDIUM" | "LOW",
  "whyBelieve": up to 5 short reasons grounded in the evidence (string[]),
  "couldDisprove": up to 5 short things that would show this is wrong (string[]),
  "rationale": 2-3 sentences naming what the recommendation rests on (string)
}
Use NO_AI when the problem is better solved without AI.`;
      try {
        const { model, json } = await askJson(aiClient, system, prompt);
        const category = boundedString(json?.category, 80);
        const priority = pickEnum(json?.priority, PRIORITIES);
        const recommendation = pickEnum(json?.recommendation, RECOMMENDATIONS);
        const confidence = clampNumber(json?.confidence, 0, 1);
        const effort = pickEnum(json?.effort, LEVELS);
        const risk = pickEnum(json?.risk, LEVELS);
        const whyBelieve = stringList(json?.whyBelieve, 5, 300);
        const couldDisprove = stringList(json?.couldDisprove, 5, 300);
        const rationale = boundedString(json?.rationale, 1200);
        const rawValue = json?.estimatedAnnualValue;
        const value = rawValue === null ? null : clampNumber(rawValue, 0, 1_000_000_000_000);
        if (
          !json || !category || !priority || !recommendation || confidence === null || !effort || !risk ||
          !whyBelieve || !couldDisprove || !rationale || (rawValue !== null && rawValue !== undefined && value === null)
        ) {
          res.status(502).json(BAD_AI_OUTPUT);
          return;
        }
        const saved = await prisma.opportunityAssessment.create({
          data: {
            opportunityId: req.params.id,
            category,
            estimatedAnnualValue: value === null ? null : Math.round(value),
            priority,
            recommendation,
            confidence,
            effort,
            risk,
            whyBelieve,
            couldDisprove,
            rationale,
            model,
          },
        });
        res.status(200).json(saved);
      } catch (err) {
        handleAiError(err, res, next);
      }
    })
  );

  // Scores every not-yet-scored evidence row of the opportunity in one AI call.
  router.post(
    "/:id/evidence/quality",
    asyncHandler(async (req, res, next) => {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: req.params.id },
        include: { evidence: { orderBy: { capturedAt: "desc" } } },
      });
      if (!opportunity) {
        res.status(404).json(NOT_FOUND_OPP);
        return;
      }
      if (!aiClient) {
        res.status(503).json(NOT_CONFIGURED);
        return;
      }
      const unscored = opportunity.evidence.filter((e: { quality: unknown }) => e.quality === null).slice(0, MAX_ITEMS);
      if (unscored.length === 0) {
        res.status(200).json({ scored: 0, evidence: opportunity.evidence });
        return;
      }
      const system =
        "You assess the quality of evidence supporting an AI business opportunity. Judge only the text given; " +
        "do not look anything up. Reply with a single JSON object and nothing else. " +
        DATA_NOTICE;
      const rows = unscored
        .map(
          (e: { id: string; type: string; claim: string; source: string | null; excerpt: string | null }) =>
            `id: ${e.id}\n${dataBlock(`claim (${e.type})`, e.claim, ITEM_CHARS)}\n${dataBlock("source", e.source ?? "-", 200)}\n${dataBlock("excerpt", e.excerpt ?? "-", ITEM_CHARS)}`
        )
        .join("\n---\n");
      const prompt = `Opportunity: ${dataBlock("title", opportunity.title, 300)}

Evidence rows:
${rows}

Return JSON: {"items":[{"id": the row id exactly as given, "credibility":"HIGH|MEDIUM|LOW" (is the source trustworthy), "applicability":"HIGH|MEDIUM|LOW" (does it apply to this company/problem), "depth":"HIGH|MEDIUM|LOW" (how detailed is it), "relevance":"HIGH|MEDIUM|LOW" (how directly it supports the opportunity), "rationale": one sentence}]}
Include every id exactly once.`;
      try {
        const { model, json } = await askJson(aiClient, system, prompt);
        const items = Array.isArray(json?.items) ? (json.items as unknown[]) : null;
        if (!items) {
          res.status(502).json(BAD_AI_OUTPUT);
          return;
        }
        const allowedIds = new Set(unscored.map((e: { id: string }) => e.id));
        const valid: { id: string; quality: Record<string, string> }[] = [];
        for (const item of items) {
          if (!item || typeof item !== "object") continue;
          const o = item as Record<string, unknown>;
          const credibility = pickEnum(o.credibility, LEVELS);
          const applicability = pickEnum(o.applicability, LEVELS);
          const depth = pickEnum(o.depth, LEVELS);
          const relevance = pickEnum(o.relevance, LEVELS);
          const rationale = boundedString(o.rationale, 400) ?? "";
          // Only ids that belong to this opportunity's unscored rows are ever written.
          if (typeof o.id !== "string" || !allowedIds.has(o.id)) continue;
          if (!credibility || !applicability || !depth || !relevance) continue;
          valid.push({ id: o.id, quality: { credibility, applicability, depth, relevance, rationale } });
        }
        if (valid.length === 0) {
          res.status(502).json(BAD_AI_OUTPUT);
          return;
        }
        const now = new Date();
        await prisma.$transaction(
          valid.map((v) =>
            prisma.evidence.update({
              where: { id: v.id },
              data: { quality: v.quality, qualityModel: model, qualityAt: now },
            })
          )
        );
        const evidence = await prisma.evidence.findMany({
          where: { opportunityId: req.params.id },
          orderBy: { capturedAt: "desc" },
        });
        res.status(200).json({ scored: valid.length, evidence });
      } catch (err) {
        handleAiError(err, res, next);
      }
    })
  );

  return router;
}

// ---------------------------------------------------------------------------------------------
// AI readiness (portfolio- or company-wide). Mounted at /readiness.
// ---------------------------------------------------------------------------------------------
export function createReadinessRouter(prisma: PrismaClient, aiClient?: AiClient): Router {
  const router = Router();

  router.get(
    "/latest",
    asyncHandler(async (req, res) => {
      const company = parseCompanyIdQuery(req.query.companyId);
      if (!company.ok) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "companyId must be a single id" } });
        return;
      }
      const latest = await prisma.readinessAssessment.findFirst({
        where: { companyId: company.id ?? null },
        orderBy: { createdAt: "desc" },
      });
      if (!latest) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "No readiness assessment has been run yet" } });
        return;
      }
      res.status(200).json(latest);
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res, next) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      let companyId: string | null = null;
      if (body.companyId !== undefined && body.companyId !== null) {
        if (typeof body.companyId !== "string" || body.companyId.length < 1 || body.companyId.length > 64) {
          res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "companyId must be an id" } });
          return;
        }
        const exists = await prisma.company.findUnique({ where: { id: body.companyId } });
        if (!exists) {
          res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "companyId must be an existing company" } });
          return;
        }
        companyId = body.companyId;
      }
      if (!aiClient) {
        res.status(503).json(NOT_CONFIGURED);
        return;
      }
      const opportunities = await prisma.opportunity.findMany({
        where: companyId ? { companyId } : undefined,
        orderBy: { createdAt: "desc" },
        take: MAX_ITEMS,
        include: { _count: { select: { evidence: true, decisions: true, experiments: true } } },
      });
      if (opportunities.length === 0) {
        res.status(409).json({
          error: { code: "NO_DATA", message: "There are no opportunities to assess yet. Run an analysis first." },
        });
        return;
      }
      const system =
        "You assess an organisation's readiness to adopt AI. Score ONLY what the data below supports; " +
        "if a dimension has little supporting data, give a low score and say so in its basis. " +
        "Do not invent facts. Reply with a single JSON object and nothing else. " +
        DATA_NOTICE;
      const lines = opportunities
        .map(
          (o: {
            title: string; status: string; aiSuitability: string | null; complexity: string | null;
            dependencies: string | null; risks: string | null;
            _count: { evidence: number; decisions: number; experiments: number };
          }) =>
            `${dataBlock("opportunity", o.title, 200)} status=${o.status} evidence=${o._count.evidence} decisions=${o._count.decisions} experiments=${o._count.experiments}\n` +
            `${dataBlock("AI suitability", o.aiSuitability ?? "-", 300)}${dataBlock("complexity", o.complexity ?? "-", 200)}${dataBlock("dependencies", o.dependencies ?? "-", 300)}${dataBlock("risks", o.risks ?? "-", 300)}`
        )
        .join("\n");
      const dimensionSpec = READINESS_DIMENSIONS.map((d) => `"${d.key}": {"score": 0-100, "basis": one sentence}`).join(", ");
      const prompt = `Opportunities in scope:
${lines}

Return JSON: {"dimensions": {${dimensionSpec}}, "rationale": 2-3 sentences summarising the overall picture and its main gap}`;
      try {
        const { model, json } = await askJson(aiClient, system, prompt);
        const rawDims = json?.dimensions && typeof json.dimensions === "object" ? (json.dimensions as Record<string, unknown>) : null;
        const rationale = boundedString(json?.rationale, 1200);
        const dimensions: Record<string, { score: number; basis: string }> = {};
        let ok = rawDims !== null && rationale !== null;
        for (const d of READINESS_DIMENSIONS) {
          const entry = rawDims?.[d.key];
          const o = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
          const score = clampNumber(o?.score, 0, 100);
          const basis = boundedString(o?.basis, 300);
          if (score === null || !basis) {
            ok = false;
            break;
          }
          dimensions[d.key] = { score: Math.round(score), basis };
        }
        if (!ok || !rationale) {
          res.status(502).json(BAD_AI_OUTPUT);
          return;
        }
        // The overall figure is the mean of the five scores (computed here, so it always agrees with them).
        const overall = Math.round(
          READINESS_DIMENSIONS.reduce((sum, d) => sum + dimensions[d.key].score, 0) / READINESS_DIMENSIONS.length
        );
        const saved = await prisma.readinessAssessment.create({
          data: { companyId, overall, dimensions, rationale, model },
        });
        res.status(200).json(saved);
      } catch (err) {
        handleAiError(err, res, next);
      }
    })
  );

  return router;
}

// ---------------------------------------------------------------------------------------------
// Standard portfolio reports. Mounted at /reports/standard BEFORE the company-report router.
// ---------------------------------------------------------------------------------------------
const REPORT_INSTRUCTIONS: Record<StandardReportType, string> = {
  "executive-summary":
    "Write an executive summary (3-4 short paragraphs) of the AI opportunity portfolio: what was found, what looks most promising, what is blocked, and the recommended next step.",
  portfolio:
    "Write a portfolio report: group the opportunities by category and priority, say where the value is concentrated, and flag opportunities that lack a value estimate or evidence.",
  evidence:
    "Write an evidence report: how much evidence exists per opportunity, how much of it is fact versus inference or assumption, how much has been quality-scored, and where the evidence is weakest.",
  "pov-results":
    "Write a proof-of-value results report: summarise each experiment by status, outcome and learnings, and say what the results imply for the portfolio.",
  roi:
    "Write an ROI report: using ONLY the estimated annual values given, say which opportunities carry the most value and which have proven (successful) experiments. State plainly that no cost data exists, so no return ratio can be calculated.",
};

export function createStandardReportsRouter(prisma: PrismaClient, aiClient?: AiClient): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const rows = await prisma.standardReport.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
      res.status(200).json(rows);
    })
  );

  router.post(
    "/:type",
    asyncHandler(async (req, res, next) => {
      const type = pickEnum(req.params.type, STANDARD_REPORT_TYPES);
      if (!type) {
        res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: `type must be one of ${STANDARD_REPORT_TYPES.join(", ")}` },
        });
        return;
      }
      if (!aiClient) {
        res.status(503).json(NOT_CONFIGURED);
        return;
      }
      const opportunities = await prisma.opportunity.findMany({
        orderBy: { createdAt: "desc" },
        take: MAX_ITEMS,
        include: {
          evidence: { select: { type: true, quality: true, confidence: true, capturedAt: true } },
          experiments: { include: { learnings: true } },
          assessments: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      if (opportunities.length === 0) {
        res.status(409).json({ error: { code: "NO_DATA", message: "There are no opportunities to report on yet." } });
        return;
      }
      const lines = opportunities
        .map((o) => {
          const a = o.assessments[0];
          const value = o.estimatedAnnualValue ?? a?.estimatedAnnualValue ?? null;
          const score = computeEvidenceScore(o.evidence);
          const evidenceTypes = o.evidence.reduce<Record<string, number>>((acc, e) => {
            acc[e.type] = (acc[e.type] ?? 0) + 1;
            return acc;
          }, {});
          const experiments = o.experiments
            .map(
              (x) =>
                `${dataBlock("experiment", `${x.title} [${x.status}${x.success === null ? "" : x.success ? ", succeeded" : ", failed"}] ${x.resultSummary ?? ""}`, 300)}` +
                x.learnings.map((l) => dataBlock("learning", l.insight, 200)).join("")
            )
            .join("");
          return (
            `${dataBlock("opportunity", o.title, 200)} status=${o.status} category=${o.category ?? a?.category ?? "unset"} priority=${o.priority ?? a?.priority ?? "unset"} ` +
            `annualValueZAR=${value ?? "unset"} evidenceScore=${score ?? "not scored"} evidenceByType=${JSON.stringify(evidenceTypes)}\n${experiments}`
          );
        })
        .join("\n");
      const system = `You write business reports about a portfolio of AI opportunities. Use only the data given; never invent numbers. Say plainly when data is missing. Plain prose, no markdown tables. ${DATA_NOTICE}`;
      const prompt = `${REPORT_INSTRUCTIONS[type]}\n\nPortfolio data:\n${lines}`;
      try {
        const result = await aiClient.quickAsk(MODEL, system, prompt, AI_TIMEOUT_MS);
        let saved: { id: string; createdAt: Date } | null = null;
        try {
          saved = await prisma.standardReport.create({
            data: { type, content: result.response, model: result.model },
          });
        } catch (saveErr) {
          logJson("error", "could not save standard report", { type, err: String(saveErr) });
        }
        res.status(200).json({ type, report: result.response, model: result.model, createdAt: saved?.createdAt ?? null });
      } catch (err) {
        handleAiError(err, res, next);
      }
    })
  );

  return router;
}

// ---------------------------------------------------------------------------------------------
// Data export. Mounted at /exports. Deterministic: no AI.
// ---------------------------------------------------------------------------------------------
export function createExportRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get(
    "/opportunities.csv",
    asyncHandler(async (_req, res) => {
      const rows = await prisma.opportunity.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          evidence: { select: { quality: true, confidence: true, capturedAt: true } },
          assessments: { orderBy: { createdAt: "desc" }, take: 1 },
          company: { select: { name: true } },
        },
      });
      const csv = toCsv(
        ["Title", "Company", "Status", "Category", "Priority", "Annual value (ZAR)", "Evidence count", "Evidence score", "AI recommendation", "Created"],
        rows.map((o) => {
          const a = o.assessments[0];
          return [
            o.title,
            o.company?.name ?? "",
            o.status,
            o.category ?? a?.category ?? "",
            o.priority ?? a?.priority ?? "",
            o.estimatedAnnualValue ?? a?.estimatedAnnualValue ?? "",
            o.evidence.length,
            computeEvidenceScore(o.evidence) ?? "",
            a?.recommendation ?? "",
            o.createdAt,
          ];
        })
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="opportunities.csv"');
      res.status(200).send(csv);
    })
  );

  return router;
}
