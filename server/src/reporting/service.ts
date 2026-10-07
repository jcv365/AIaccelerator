import { Prisma, type PrismaClient } from "@prisma/client";
import type { AiClient } from "../ai/client.js";
import { AiClientError } from "../ai/errors.js";
import { DEFAULT_ANALYSIS_CONFIG_PATH } from "../domain/analysis.js";
import { logJson } from "../logger.js";
import { reportContentSchema, type ReportContent } from "./content.js";
import { collectFacts, type Facts } from "./facts.js";
import { runQualityGates, type QualityReport } from "./gates.js";
import { generateReportContent, ReportGenerationError, type Ask } from "./generate.js";
import { renderDeliverables, type RenderInput, type RenderMeta } from "./render/index.js";
import type { SourceRef } from "./sources.js";

// The company report lifecycle: start (GENERATING) -> write section by section -> quality gates -> render the four
// files (DRAFT) -> a human approves (APPROVED, files re-rendered without the draft mark). Versions are never
// overwritten. Runs in-process like analysis jobs, so anything still GENERATING at boot was killed by a restart.

// One expert per section call: the multi-expert Fusion takes minutes even for a tiny prompt, which is far too slow
// for dozens of calls. Quality comes from the strict schema, the grounded-number checks and the repair retry.
const MODEL = process.env.REPORT_MODEL || "Claude";
const ASK_TIMEOUT_MS = 280_000; // Node's fetch gives up at 300s regardless
const ASK_ATTEMPTS = 3;
const AUTHOR = process.env.REPORT_AUTHOR || "DotCloud Consulting";

export interface ReportDeps {
  prisma: PrismaClient;
  aiClient: AiClient;
  /** Replaceable in tests. */
  collect?: (prisma: PrismaClient, companyId: string) => Promise<Facts>;
  retryDelayMs?: number;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function boundAsk(deps: ReportDeps): Ask {
  const configPath = process.env.COUNCIL_ANALYSIS_CONFIG_PATH || DEFAULT_ANALYSIS_CONFIG_PATH;
  return async (system, prompt) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return (await deps.aiClient.quickAsk(MODEL, system, prompt, ASK_TIMEOUT_MS, configPath)).response;
      } catch (err) {
        const transient = err instanceof AiClientError && (err.code === "AI_UPSTREAM_ERROR" || err.code === "AI_UNREACHABLE" || err.code === "AI_BUSY");
        if (!transient || attempt >= ASK_ATTEMPTS) throw err;
        await delay((deps.retryDelayMs ?? 5_000) * attempt);
      }
    }
  };
}

export type StartResult =
  | { kind: "started"; reportId: string; version: number }
  | { kind: "company_not_found" }
  | { kind: "analysis_not_found" }
  | { kind: "busy" };

/** Creates the next version for a company and starts writing it in the background. */
export async function startReport(deps: ReportDeps, companyId: string, analysisId?: string | null): Promise<StartResult> {
  const { prisma } = deps;
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { kind: "company_not_found" };
  // A point-in-time report must name a finished run that belongs to this company.
  const analysis = analysisId ? await prisma.analysisJob.findFirst({ where: { id: analysisId, companyId, status: "SUCCEEDED" } }) : null;
  if (analysisId && !analysis) return { kind: "analysis_not_found" };
  // One report at a time: each is dozens of model calls, and the shared roster is small.
  if (await prisma.companyReport.findFirst({ where: { status: "GENERATING" } })) return { kind: "busy" };

  const latest = await prisma.companyReport.findFirst({ where: { companyId }, orderBy: { version: "desc" }, select: { version: true } });
  try {
    const report = await prisma.companyReport.create({
      data: { companyId, version: (latest?.version ?? 0) + 1, status: "GENERATING", stage: "Starting" },
    });
    void runReportJob(deps, report.id, companyId, analysis ? { id: analysis.id, ranAt: analysis.createdAt } : null);
    return { kind: "started", reportId: report.id, version: report.version };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { kind: "busy" }; // lost a race for this version
    throw err;
  }
}

function failedCheckNames(quality: QualityReport): string {
  return quality.checks.filter((c) => !c.passed).map((c) => c.name).join("; ");
}

/** Never rejects: every outcome, including crashes, is recorded on the report row. */
export async function runReportJob(deps: ReportDeps, reportId: string, companyId: string, analysis: { id: string; ranAt: Date } | null = null): Promise<void> {
  const { prisma } = deps;
  const started = Date.now();
  const fail = async (message: string, extra: Prisma.CompanyReportUpdateInput = {}) => {
    logJson("error", "company report failed", { reportId, message, durationMs: Date.now() - started });
    try {
      await prisma.companyReport.update({ where: { id: reportId }, data: { status: "FAILED", stage: null, errorMessage: message.slice(0, 500), completedAt: new Date(), ...extra } });
    } catch (err) {
      logJson("error", "could not record report failure", { reportId, err: String(err) });
    }
  };

  try {
    logJson("info", "company report started", { reportId, companyId });
    const facts = await (deps.collect ?? collectFacts)(prisma, companyId, analysis?.id);
    const content = await generateReportContent(facts, boundAsk(deps), {
      onStage: async (stage) => {
        await prisma.companyReport.update({ where: { id: reportId }, data: { stage: stage.slice(0, 200) } });
      },
    });
    await prisma.companyReport.update({ where: { id: reportId }, data: { stage: "Checking quality" } });

    const quality = runQualityGates(content, facts);
    const titles = Object.fromEntries(facts.opportunities.map((o) => [o.id, o.title]));
    const stored = { content: content as unknown as Prisma.InputJsonValue, sources: { sources: facts.sources, titles, analysis: analysis ? { id: analysis.id, ranAt: analysis.ranAt.toISOString() } : null } as unknown as Prisma.InputJsonValue, qualityReport: quality as unknown as Prisma.InputJsonValue };
    if (!quality.passed) {
      await fail(`The report did not pass its quality checks: ${failedCheckNames(quality)}`, stored);
      return;
    }

    await prisma.companyReport.update({ where: { id: reportId }, data: { stage: "Building the files" } });
    const completedAt = new Date();
    const files = await renderDeliverables({ content, sources: facts.sources, titles, meta: { version: await versionOf(prisma, reportId), status: "DRAFT", generatedAt: completedAt, author: AUTHOR, analysisRanAt: analysis?.ranAt ?? null } });
    await prisma.$transaction(async (tx) => {
      await tx.companyReport.update({ where: { id: reportId }, data: { ...stored, status: "DRAFT", stage: null, errorMessage: null, completedAt } });
      await tx.deliverable.createMany({
        data: files.map((f) => ({ companyReportId: reportId, audience: f.audience, format: f.format, filename: f.filename, content: f.content, sizeBytes: f.content.length })),
      });
    });
    logJson("info", "company report ready", { reportId, durationMs: Date.now() - started });
  } catch (err) {
    if (err instanceof ReportGenerationError) await fail(err.message);
    else if (err instanceof AiClientError) await fail(`The AI service failed (${err.code}): ${err.message}`);
    else {
      logJson("error", "company report crashed", { reportId, err: String(err) });
      await fail("The report failed unexpectedly");
    }
  }
}

async function versionOf(prisma: PrismaClient, reportId: string): Promise<number> {
  const row = await prisma.companyReport.findUnique({ where: { id: reportId }, select: { version: true } });
  return row?.version ?? 1;
}

/** Rebuilds the render input from what is saved, so files never depend on asking the AI again. */
export function renderInputFromRow(
  row: { version: number; content: unknown; sources: unknown; createdAt: Date; completedAt: Date | null },
  meta: Pick<RenderMeta, "status" | "approvedAt" | "approvedBy">
): RenderInput | null {
  const content = reportContentSchema.safeParse(row.content);
  const saved = row.sources as { sources?: SourceRef[]; titles?: Record<string, string>; analysis?: { id: string; ranAt: string } | null } | null;
  if (!content.success || !saved?.sources || !saved.titles) return null;
  return {
    content: content.data as ReportContent,
    sources: saved.sources,
    titles: saved.titles,
    meta: { version: row.version, generatedAt: row.completedAt ?? row.createdAt, author: AUTHOR, analysisRanAt: saved.analysis ? new Date(saved.analysis.ranAt) : null, ...meta },
  };
}

export type ApproveResult = { kind: "approved" } | { kind: "not_found" } | { kind: "not_draft" } | { kind: "unreadable" };

/** A human has reviewed this draft: lock it and rebuild its files without the draft mark. */
export async function approveReport(prisma: PrismaClient, reportId: string, approvedBy: string): Promise<ApproveResult> {
  const row = await prisma.companyReport.findUnique({ where: { id: reportId } });
  if (!row) return { kind: "not_found" };
  if (row.status !== "DRAFT") return { kind: "not_draft" };
  const approvedAt = new Date();
  const input = renderInputFromRow(row, { status: "APPROVED", approvedAt, approvedBy });
  if (!input) return { kind: "unreadable" };
  const files = await renderDeliverables(input);

  const done = await prisma.$transaction(async (tx) => {
    // Guards against a second approval racing this one: only a still-DRAFT row is changed.
    const changed = await tx.companyReport.updateMany({ where: { id: reportId, status: "DRAFT" }, data: { status: "APPROVED", approvedAt, approvedBy } });
    if (changed.count === 0) return false;
    await tx.deliverable.deleteMany({ where: { companyReportId: reportId } });
    await tx.deliverable.createMany({
      data: files.map((f) => ({ companyReportId: reportId, audience: f.audience, format: f.format, filename: f.filename, content: f.content, sizeBytes: f.content.length })),
    });
    return true;
  });
  return done ? { kind: "approved" } : { kind: "not_draft" };
}

/** Reports run in-process, so any still GENERATING at boot was killed by the restart. */
export async function reconcileInterruptedReports(prisma: PrismaClient): Promise<number> {
  const result = await prisma.companyReport.updateMany({
    where: { status: "GENERATING" },
    data: { status: "FAILED", stage: null, errorMessage: "The server restarted while this report was being written", completedAt: new Date() },
  });
  return result.count;
}
