import type { AnalysisJob, Prisma, PrismaClient } from "@prisma/client";
import type { AiClient, CouncilSessionStatus } from "../ai/client.js";
import { AiClientError } from "../ai/errors.js";
import { logJson } from "../logger.js";
import {
  AnalysisParseError,
  DEFAULT_ANALYSIS_CONFIG_PATH,
  buildGoal,
  parseSynthesis,
  persistOpportunities,
} from "./analysis.js";
import type { AnalysisContext } from "./analysisContext.js";

export const DEFAULT_POLL_MS = 15_000;
// How long a running job tolerates an unreachable (or erroring) Conclave before it is failed.
export const UNREACHABLE_GRACE_MS = 30 * 60_000;

// A RUNNING job older than this is failed so it cannot block the queue forever.
export const MAX_RUN_MS = 90 * 60_000;
const MAX_UNEXPECTED_ERRORS = 5;
const MAX_NOT_FOUND_POLLS = 2;
const START_UPDATE_ATTEMPTS = 3;
const MAX_TEXT = 100;
const MAX_LIST_ITEMS = 20;

function sanitizeProgress(progress: CouncilSessionStatus["progress"], elapsedSeconds: number | null): Prisma.InputJsonObject {
  const out: Record<string, string[] | number> = {};
  if (progress && typeof progress === "object") {
    for (const [key, value] of Object.entries(progress as unknown as Record<string, unknown>)) {
      if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) continue;
      out[key] = (value as string[]).slice(0, MAX_LIST_ITEMS).map((v) => v.slice(0, MAX_TEXT));
    }
  }
  if (typeof elapsedSeconds === "number") out.elapsedSeconds = elapsedSeconds;
  return out;
}

export interface WorkerOptions {
  maxRunMs?: number;
  pollMs?: number;
  unreachableGraceMs?: number;
  configPath?: string;
  now?: () => Date;
}

/**
 * Runs queued analyses one at a time against the Conclave and follows them to the end. State lives in the
 * database, so a restarted server simply picks up where the previous one left off.
 */
export function createAnalysisWorker(prisma: PrismaClient, aiClient: AiClient, options: WorkerOptions = {}) {
  const now = options.now ?? (() => new Date());
  const unreachableGraceMs = options.unreachableGraceMs ?? UNREACHABLE_GRACE_MS;
  const maxRunMs = options.maxRunMs ?? MAX_RUN_MS;
  // In-memory per-job counters: a restart just starts them again from zero.
  const unexpectedErrors = new Map<string, number>();
  const notFoundPolls = new Map<string, number>();
  const configPath = options.configPath ?? (process.env.COUNCIL_ANALYSIS_CONFIG_PATH || DEFAULT_ANALYSIS_CONFIG_PATH);

  async function fail(job: AnalysisJob, errorCode: string, errorMessage: string): Promise<void> {
    logJson("error", "analysis failed", { jobId: job.id, errorCode });
    await prisma.analysisJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorCode, errorMessage, completedAt: now() },
    });
  }

  async function noteUnreachable(job: AnalysisJob, err: AiClientError): Promise<void> {
    const since = job.unreachableSince ?? now();
    if (!job.unreachableSince) {
      await prisma.analysisJob.update({ where: { id: job.id }, data: { unreachableSince: since, lastPolledAt: now() } });
    }
    if (now().getTime() - since.getTime() > unreachableGraceMs) await fail(job, err.code, err.message);
  }

  /** Wraps one poll: repeated unexpected (non-Council, non-parse) errors fail the job instead of blocking the queue. */
  async function pollRunning(job: AnalysisJob): Promise<void> {
    try {
      await pollRunningOnce(job);
      unexpectedErrors.delete(job.id);
    } catch (err) {
      const count = (unexpectedErrors.get(job.id) ?? 0) + 1;
      unexpectedErrors.set(job.id, count);
      if (count >= MAX_UNEXPECTED_ERRORS) {
        unexpectedErrors.delete(job.id);
        await fail(job, "INTERNAL_ERROR", `The analysis failed after ${count} consecutive unexpected errors while following it.`);
        return;
      }
      throw err;
    }
  }

  async function pollRunningOnce(job: AnalysisJob): Promise<void> {
    if (job.startedAt && now().getTime() - job.startedAt.getTime() > maxRunMs) {
      await fail(job, "ANALYSIS_TIMEOUT", `The analysis did not finish within ${Math.round(maxRunMs / 60_000)} minutes and was stopped.`);
      return;
    }
    if (!job.councilSessionId) {
      // Defensive: reconcileOnBoot normally handles this. Nothing to follow, so run it again from the queue.
      await prisma.analysisJob.update({ where: { id: job.id }, data: { status: "QUEUED", startedAt: null, stage: "queued" } });
      return;
    }
    let session: CouncilSessionStatus;
    try {
      session = await aiClient.getSession(job.councilSessionId);
    } catch (err) {
      if (err instanceof AiClientError && err.code === "AI_SESSION_NOT_FOUND") {
        const misses = (notFoundPolls.get(job.id) ?? 0) + 1;
        if (misses < MAX_NOT_FOUND_POLLS) {
          notFoundPolls.set(job.id, misses); // one 404 may be transient; fail only when it repeats
          return;
        }
        notFoundPolls.delete(job.id);
        await fail(job, "COUNCIL_SESSION_LOST", "The Conclave no longer knows this session (it was probably restarted).");
        return;
      }
      if (err instanceof AiClientError) {
        await noteUnreachable(job, err);
        return;
      }
      throw err;
    }

    notFoundPolls.delete(job.id);
    const progress = sanitizeProgress(session.progress, session.elapsedSeconds);
    await prisma.analysisJob.update({
      where: { id: job.id },
      data: { stage: session.stage.slice(0, MAX_TEXT), progress, lastPolledAt: now(), unreachableSince: null },
    });

    if (session.status === "running") return;
    if (session.status === "failed") {
      await fail(job, "AI_UPSTREAM_ERROR", session.error?.message ?? "The Conclave session failed.");
      return;
    }
    if (session.status === "lost") {
      await fail(job, "COUNCIL_SESSION_LOST", session.error?.message ?? "The Conclave lost this session.");
      return;
    }

    try {
      // A previous pass may have saved the opportunities and then failed to mark the job; never save twice.
      const existing = await prisma.opportunity.findMany({ where: { analysisJobId: job.id }, select: { id: true } });
      const opportunityIds =
        existing.length > 0
          ? existing.map((o) => o.id)
          : await persistOpportunities(prisma, parseSynthesis(session.result?.synthesis), job.companyId ?? undefined, job.id);
      await prisma.analysisJob.update({
        where: { id: job.id },
        data: { status: "SUCCEEDED", opportunityIds, completedAt: now() },
      });
      logJson("info", "analysis succeeded", { jobId: job.id, opportunities: opportunityIds.length });
    } catch (err) {
      if (err instanceof AnalysisParseError) {
        await fail(job, "AI_UPSTREAM_ERROR", err.message);
        return;
      }
      throw err;
    }
  }

  async function startQueued(job: AnalysisJob): Promise<void> {
    const goal = buildGoal(job.companyName, (job.context ?? null) as AnalysisContext | null);
    try {
      const { sessionId } = await aiClient.startSession(goal, true, { configPath, clientRef: job.id });
      // The Council session already exists; retry the bookkeeping so a transient DB error does not orphan it.
      for (let attempt = 1; ; attempt++) {
        try {
          await prisma.analysisJob.update({
            where: { id: job.id },
            data: {
              status: "RUNNING",
              councilSessionId: sessionId,
              startedAt: now(),
              stage: "starting",
              lastPolledAt: null,
              unreachableSince: null,
            },
          });
          break;
        } catch (err) {
          if (attempt >= START_UPDATE_ATTEMPTS) throw err;
        }
      }
      logJson("info", "analysis started", { jobId: job.id, councilSessionId: sessionId });
    } catch (err) {
      if (err instanceof AiClientError) {
        if (err.code === "AI_AUTH_FAILED") {
          // A bad API key is an operator problem, not the job's: keep it queued but make noise.
          logJson("error", "Council rejected the API key; analysis jobs stay queued until it is fixed", { jobId: job.id });
          return;
        }
        if (err.code === "AI_BUSY" || err.code === "AI_UNREACHABLE") return; // try again next tick
        await fail(job, err.code, err.message);
        return;
      }
      throw err;
    }
  }

  /** One pass: follow the running job if there is one, otherwise start the oldest queued job. Never throws. */
  async function tick(): Promise<void> {
    try {
      const running = await prisma.analysisJob.findFirst({ where: { status: "RUNNING" }, orderBy: { createdAt: "asc" } });
      if (running) {
        await pollRunning(running);
        return;
      }
      const next = await prisma.analysisJob.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" } });
      if (next) await startQueued(next);
    } catch (err) {
      logJson("error", "analysis worker tick failed", { err: String(err) });
    }
  }

  return { tick };
}

/** Runs the worker on an interval (first pass immediately); a slow pass is never overlapped by the next one. */
export function startAnalysisWorker(prisma: PrismaClient, aiClient: AiClient, options: WorkerOptions = {}) {
  const worker = createAnalysisWorker(prisma, aiClient, options);
  let ticking = false;
  const runTick = () => {
    if (ticking) return;
    ticking = true;
    void worker.tick().finally(() => {
      ticking = false;
    });
  };
  runTick();
  const timer = setInterval(runTick, options.pollMs ?? DEFAULT_POLL_MS);
  timer.unref?.();
  return { tick: worker.tick, stop: () => clearInterval(timer) };
}

/**
 * At boot: a RUNNING job that already has a Conclave session id is simply picked up again by the worker. One
 * without it never reached the Conclave, so it goes back in the queue.
 */
export async function reconcileOnBoot(prisma: PrismaClient): Promise<number> {
  const result = await prisma.analysisJob.updateMany({
    where: { status: "RUNNING", councilSessionId: null },
    data: { status: "QUEUED", startedAt: null, stage: "queued" },
  });
  return result.count;
}
