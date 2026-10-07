import { describe, it, expect, vi, afterEach } from "vitest";
import { AiClientError } from "../../src/ai/errors.js";
import {
  UNREACHABLE_GRACE_MS,
  createAnalysisWorker,
  reconcileOnBoot,
  startAnalysisWorker,
} from "../../src/domain/analysisWorker.js";

const GOOD = JSON.stringify({
  opportunities: [
    {
      title: "Predictive maintenance",
      description: "Predict engine failures",
      businessProblem: "Unplanned downtime",
      evidence: [{ claim: "700 vessels", type: "FACT", confidence: 0.9, source: "https://example.com" }],
    },
  ],
});

type Job = {
  id: string;
  companyName: string;
  companyId: string | null;
  status: string;
  createdAt: Date;
  context: unknown;
  councilSessionId: string | null;
  stage: string | null;
  progress: unknown;
  startedAt: Date | null;
  completedAt: Date | null;
  opportunityIds: string[];
  errorCode: string | null;
  errorMessage: string | null;
  lastPolledAt: Date | null;
  unreachableSince: Date | null;
};

function job(partial: Partial<Job> & { id: string }): Job {
  return {
    companyName: "Acme",
    companyId: "co1",
    status: "QUEUED",
    createdAt: new Date("2026-10-07T08:00:00Z"),
    context: null,
    councilSessionId: null,
    stage: null,
    progress: null,
    startedAt: null,
    completedAt: null,
    opportunityIds: [],
    errorCode: null,
    errorMessage: null,
    lastPolledAt: null,
    unreachableSince: null,
    ...partial,
  };
}

function fakePrisma(jobs: Job[], existingOpps: { id: string; analysisJobId: string }[] = []) {
  const matches = (j: Job, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => (j as unknown as Record<string, unknown>)[key] === value);
  let oppCount = 0;
  const prisma: Record<string, unknown> = {
    analysisJob: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        jobs.filter((j) => matches(j, where)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0] ?? null
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const found = jobs.find((j) => j.id === where.id)!;
        Object.assign(found, data);
        return found;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = jobs.filter((j) => matches(j, where));
        hit.forEach((j) => Object.assign(j, data));
        return { count: hit.length };
      }),
    },
    opportunity: {
      create: vi.fn(async () => ({ id: `opp${++oppCount}` })),
      findMany: vi.fn(async ({ where }: { where: { analysisJobId: string } }) =>
        existingOpps.filter((o) => o.analysisJobId === where.analysisJobId).map((o) => ({ id: o.id }))
      ),
    },
    evidence: { create: vi.fn(async () => ({})) },
  };
  prisma.$transaction = (cb: (tx: unknown) => unknown) => cb(prisma);
  return prisma;
}

const running = (stage: string) => ({
  sessionId: "s1", status: "running" as const, stage, round: 1, elapsedSeconds: 60,
  progress: { expected: ["A", "B"], responded: ["A"], missing: ["B"] }, result: null, error: null,
});
const concluded = (synthesis: unknown = GOOD) => ({
  sessionId: "s1", status: "concluded" as const, stage: "done", round: 1, elapsedSeconds: 600,
  progress: { expected: ["A"], responded: ["A"], missing: [] },
  result: { synthesis, chairman: "Claude", attempts: 1, passed: true }, error: null,
});

function fakeAi(overrides: Record<string, unknown> = {}) {
  return { startSession: vi.fn().mockResolvedValue({ sessionId: "s1" }), getSession: vi.fn(), ...overrides };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("analysis worker: starting jobs", () => {
  it("starts the oldest queued job, leaving later ones queued", async () => {
    const older = job({ id: "j1", createdAt: new Date("2026-10-07T08:00:00Z") });
    const newer = job({ id: "j2", createdAt: new Date("2026-10-07T08:05:00Z") });
    const ai = fakeAi();
    await createAnalysisWorker(fakePrisma([newer, older]) as never, ai as never).tick();

    expect(ai.startSession).toHaveBeenCalledTimes(1);
    expect(older).toMatchObject({ status: "RUNNING", councilSessionId: "s1", stage: "starting" });
    expect(older.startedAt).toBeInstanceOf(Date);
    expect(newer.status).toBe("QUEUED");
  });

  it("builds the goal from the job's stored context and uses the analysis roster with web research", async () => {
    const queued = job({ id: "j1", companyName: "Cassava", context: { industry: "Telecoms", website: "https://cassava.com" } });
    const ai = fakeAi();
    await createAnalysisWorker(fakePrisma([queued]) as never, ai as never, { configPath: "/code/roster.yaml" }).tick();

    const [goal, web, opts] = ai.startSession.mock.calls[0];
    expect(goal).toContain('"Cassava"');
    expect(goal).toContain('<data field="industry">');
    expect(goal).toContain('"https://cassava.com"');
    expect(web).toBe(true);
    expect(opts).toEqual({ configPath: "/code/roster.yaml", clientRef: "j1" });
  });

  it("does not start a second job while one is running", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    const waiting = job({ id: "j2", createdAt: new Date("2026-10-07T09:00:00Z") });
    const ai = fakeAi({ getSession: vi.fn().mockResolvedValue(running("proposals")) });
    await createAnalysisWorker(fakePrisma([active, waiting]) as never, ai as never).tick();

    expect(ai.getSession).toHaveBeenCalledWith("s1");
    expect(ai.startSession).not.toHaveBeenCalled();
    expect(waiting.status).toBe("QUEUED");
  });

  it("leaves the job queued when the Conclave is busy or unreachable", async () => {
    for (const code of ["AI_BUSY", "AI_UNREACHABLE"] as const) {
      const queued = job({ id: "j1" });
      const ai = fakeAi({ startSession: vi.fn().mockRejectedValue(new AiClientError(code, "nope")) });
      await createAnalysisWorker(fakePrisma([queued]) as never, ai as never).tick();
      expect(queued.status).toBe("QUEUED");
      expect(queued.errorCode).toBeNull();
    }
  });

  it("fails the job on any other start error", async () => {
    const queued = job({ id: "j1" });
    const ai = fakeAi({ startSession: vi.fn().mockRejectedValue(new AiClientError("AI_UPSTREAM_ERROR", "Conclave returned status 500")) });
    await createAnalysisWorker(fakePrisma([queued]) as never, ai as never).tick();
    expect(queued).toMatchObject({ status: "FAILED", errorCode: "AI_UPSTREAM_ERROR", errorMessage: "Conclave returned status 500" });
  });
});

describe("analysis worker: running jobs", () => {
  it("records the stage and per-expert progress", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    const ai = fakeAi({ getSession: vi.fn().mockResolvedValue(running("critiques")) });
    await createAnalysisWorker(fakePrisma([active]) as never, ai as never, { now: () => new Date("2026-10-07T09:00:00Z") }).tick();

    expect(active.stage).toBe("critiques");
    expect(active.progress).toEqual({ expected: ["A", "B"], responded: ["A"], missing: ["B"], elapsedSeconds: 60 });
    expect(active.lastPolledAt).toEqual(new Date("2026-10-07T09:00:00Z"));
    expect(active.status).toBe("RUNNING");
  });

  it("stores the opportunities and marks the job SUCCEEDED when the session concludes", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    const prisma = fakePrisma([active]);
    const ai = fakeAi({ getSession: vi.fn().mockResolvedValue(concluded()) });
    await createAnalysisWorker(prisma as never, ai as never).tick();

    expect(active).toMatchObject({ status: "SUCCEEDED", opportunityIds: ["opp1"] });
    expect(active.completedAt).toBeInstanceOf(Date);
    expect((prisma.opportunity as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledTimes(1);
    // Each opportunity records the run that found it (the company page groups and filters by it).
    expect((prisma.opportunity as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ analysisJobId: "j1" }) })
    );
  });

  it("files each saved opportunity under the job's company", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1", companyId: "co1" });
    const prisma = fakePrisma([active]);
    const ai = fakeAi({ getSession: vi.fn().mockResolvedValue(concluded()) });
    await createAnalysisWorker(prisma as never, ai as never).tick();

    expect((prisma.opportunity as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ companyId: "co1" }) })
    );
  });

  it("a new worker reattaches to a RUNNING job with a session id (restart safety)", async () => {
    const survivor = job({ id: "j1", status: "RUNNING", councilSessionId: "s1", startedAt: new Date("2026-10-07T08:00:00Z") });
    const ai = fakeAi({ getSession: vi.fn().mockResolvedValue(concluded()) });
    // A brand new worker instance, as after a server restart: it knows nothing but the database.
    await createAnalysisWorker(fakePrisma([survivor]) as never, ai as never, { now: () => new Date("2026-10-07T08:30:00Z") }).tick();
    expect(survivor.status).toBe("SUCCEEDED");
    expect(ai.startSession).not.toHaveBeenCalled();
  });

  it("fails with the Council's reason when the session failed", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    const ai = fakeAi({
      getSession: vi.fn().mockResolvedValue({
        ...running("done"), status: "failed", error: { kind: "chairman_failed", message: "Fusion: Request timed out." },
      }),
    });
    await createAnalysisWorker(fakePrisma([active]) as never, ai as never).tick();
    expect(active).toMatchObject({ status: "FAILED", errorCode: "AI_UPSTREAM_ERROR", errorMessage: "Fusion: Request timed out." });
  });

  it("fails with COUNCIL_SESSION_LOST when the Council reports the session lost or does not know it", async () => {
    const lost = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    await createAnalysisWorker(
      fakePrisma([lost]) as never,
      fakeAi({ getSession: vi.fn().mockResolvedValue({ ...running("done"), status: "lost", error: { kind: "session_lost", message: "restarted" } }) }) as never
    ).tick();
    expect(lost).toMatchObject({ status: "FAILED", errorCode: "COUNCIL_SESSION_LOST" });

    const unknown = job({ id: "j2", status: "RUNNING", councilSessionId: "s2" });
    const unknownWorker = createAnalysisWorker(
      fakePrisma([unknown]) as never,
      fakeAi({ getSession: vi.fn().mockRejectedValue(new AiClientError("AI_SESSION_NOT_FOUND", "gone")) }) as never
    );
    await unknownWorker.tick();
    await unknownWorker.tick(); // a single 404 is tolerated; two in a row fail the job
    expect(unknown).toMatchObject({ status: "FAILED", errorCode: "COUNCIL_SESSION_LOST" });
  });

  it("fails with AI_UPSTREAM_ERROR when a concluded synthesis cannot be parsed, storing nothing", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    const prisma = fakePrisma([active]);
    const ai = fakeAi({ getSession: vi.fn().mockResolvedValue(concluded("not json at all")) });
    await createAnalysisWorker(prisma as never, ai as never).tick();
    expect(active).toMatchObject({ status: "FAILED", errorCode: "AI_UPSTREAM_ERROR" });
    expect((prisma.opportunity as { create: ReturnType<typeof vi.fn> }).create).not.toHaveBeenCalled();
  });
});

describe("analysis worker: Council unreachable while running", () => {
  it("keeps the job RUNNING during the grace period, then fails it with AI_UNREACHABLE", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    const clock = { t: new Date("2026-10-07T09:00:00Z") };
    const ai = fakeAi({ getSession: vi.fn().mockRejectedValue(new AiClientError("AI_UNREACHABLE", "Could not reach the conclave")) });
    const worker = createAnalysisWorker(fakePrisma([active]) as never, ai as never, { now: () => clock.t });

    await worker.tick();
    expect(active.status).toBe("RUNNING");
    expect(active.unreachableSince).toEqual(new Date("2026-10-07T09:00:00Z"));

    clock.t = new Date(clock.t.getTime() + UNREACHABLE_GRACE_MS - 60_000);
    await worker.tick();
    expect(active.status).toBe("RUNNING");

    clock.t = new Date(clock.t.getTime() + 120_000);
    await worker.tick();
    expect(active).toMatchObject({ status: "FAILED", errorCode: "AI_UNREACHABLE" });
  });

  it("clears the unreachable marker once the Council answers again", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1", unreachableSince: new Date("2026-10-07T08:50:00Z") });
    const ai = fakeAi({ getSession: vi.fn().mockResolvedValue(running("voting")) });
    await createAnalysisWorker(fakePrisma([active]) as never, ai as never).tick();
    expect(active.unreachableSince).toBeNull();
  });
});

describe("analysis worker: robustness", () => {
  it("tick never throws on unexpected errors; after 5 in a row the job fails INTERNAL_ERROR and the queue moves on", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    const waiting = job({ id: "j2", createdAt: new Date("2026-10-07T09:00:00Z") });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const ai = fakeAi({ getSession: vi.fn().mockRejectedValue(new Error("boom")) });
    const worker = createAnalysisWorker(fakePrisma([active, waiting]) as never, ai as never);
    for (let i = 0; i < 4; i++) {
      await expect(worker.tick()).resolves.toBeUndefined();
      expect(active.status).toBe("RUNNING");
    }
    expect(log).toHaveBeenCalled();
    await worker.tick();
    expect(active).toMatchObject({ status: "FAILED", errorCode: "INTERNAL_ERROR" });
    expect(waiting.status).toBe("QUEUED");
    await worker.tick();
    expect(waiting).toMatchObject({ status: "RUNNING", councilSessionId: "s1" });
  });

  it("a success resets the unexpected-error count", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const getSession = vi.fn();
    const worker = createAnalysisWorker(fakePrisma([active]) as never, fakeAi({ getSession }) as never);
    for (let i = 0; i < 4; i++) { getSession.mockRejectedValueOnce(new Error("boom")); await worker.tick(); }
    getSession.mockResolvedValueOnce(running("x")); await worker.tick();
    for (let i = 0; i < 4; i++) { getSession.mockRejectedValueOnce(new Error("boom")); await worker.tick(); }
    expect(active.status).toBe("RUNNING");
  });

  it("fails a job running longer than maxRunMs with ANALYSIS_TIMEOUT and then starts the next queued job", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1", startedAt: new Date("2026-10-07T08:00:00Z") });
    const waiting = job({ id: "j2", createdAt: new Date("2026-10-07T09:00:00Z") });
    const clock = { t: new Date("2026-10-07T09:29:00Z") };
    const ai = fakeAi({ getSession: vi.fn().mockResolvedValue(running("proposals")) });
    const worker = createAnalysisWorker(fakePrisma([active, waiting]) as never, ai as never, { now: () => clock.t });
    await worker.tick();
    expect(active.status).toBe("RUNNING");
    clock.t = new Date("2026-10-07T09:31:00Z"); // 91 minutes
    await worker.tick();
    expect(active).toMatchObject({ status: "FAILED", errorCode: "ANALYSIS_TIMEOUT" });
    expect(active.errorMessage).toMatch(/90 minutes/);
    await worker.tick();
    expect(waiting.status).toBe("RUNNING");
  });

  it("honours WorkerOptions.maxRunMs", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1", startedAt: new Date("2026-10-07T08:00:00Z") });
    const ai = fakeAi({ getSession: vi.fn().mockResolvedValue(running("x")) });
    await createAnalysisWorker(fakePrisma([active]) as never, ai as never, {
      maxRunMs: 60_000, now: () => new Date("2026-10-07T08:05:00Z"),
    }).tick();
    expect(active).toMatchObject({ status: "FAILED", errorCode: "ANALYSIS_TIMEOUT" });
  });

  it("startAnalysisWorker polls on an interval, does not overlap slow ticks, and stops", async () => {
    vi.useFakeTimers();
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    const ai = fakeAi({ getSession: vi.fn(() => new Promise(() => {})) }); // never resolves: a slow tick
    const handle = startAnalysisWorker(fakePrisma([active]) as never, ai as never, { pollMs: 1000 });

    await vi.advanceTimersByTimeAsync(3500);
    expect(ai.getSession).toHaveBeenCalledTimes(1); // the immediate tick; later intervals skip while it is in flight

    handle.stop();
  });
});

describe("analysis worker: idempotency and hardening", () => {
  it("passes the job id as clientRef when starting", async () => {
    const queued = job({ id: "job-77" });
    const ai = fakeAi();
    await createAnalysisWorker(fakePrisma([queued]) as never, ai as never).tick();
    expect(ai.startSession.mock.calls[0][2]).toMatchObject({ clientRef: "job-77" });
  });

  it("retries recording the session id up to 2 more times", async () => {
    const queued = job({ id: "j1" });
    const prisma = fakePrisma([queued]);
    const update = (prisma.analysisJob as { update: ReturnType<typeof vi.fn> }).update;
    const real = update.getMockImplementation()!;
    update.mockRejectedValueOnce(new Error("db")).mockRejectedValueOnce(new Error("db"));
    update.mockImplementation(real);
    await createAnalysisWorker(prisma as never, fakeAi() as never).tick();
    expect(update).toHaveBeenCalledTimes(3);
    expect(queued).toMatchObject({ status: "RUNNING", councilSessionId: "s1" });
  });

  it("gives up after 3 attempts at recording the session id; tick still does not throw", async () => {
    const queued = job({ id: "j1" });
    const prisma = fakePrisma([queued]);
    const update = (prisma.analysisJob as { update: ReturnType<typeof vi.fn> }).update;
    update.mockRejectedValue(new Error("db"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(createAnalysisWorker(prisma as never, fakeAi() as never).tick()).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalled();
  });

  it("does not save opportunities again when the job already has some", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    const prisma = fakePrisma([active], [{ id: "oldA", analysisJobId: "j1" }, { id: "oldB", analysisJobId: "j1" }]);
    const ai = fakeAi({ getSession: vi.fn().mockResolvedValue(concluded()) });
    await createAnalysisWorker(prisma as never, ai as never).tick();
    expect(active).toMatchObject({ status: "SUCCEEDED", opportunityIds: ["oldA", "oldB"] });
    expect((prisma.opportunity as { create: ReturnType<typeof vi.fn> }).create).not.toHaveBeenCalled();
  });

  it("leaves a queued job queued and logs loudly when the Council rejects the API key", async () => {
    const queued = job({ id: "j1" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const ai = fakeAi({ startSession: vi.fn().mockRejectedValue(new AiClientError("AI_AUTH_FAILED", "Conclave rejected the API key")) });
    await createAnalysisWorker(fakePrisma([queued]) as never, ai as never).tick();
    expect(queued.status).toBe("QUEUED");
    expect(queued.errorCode).toBeNull();
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).toMatch(/API key/);
  });

  it("fails COUNCIL_SESSION_LOST only after two consecutive 404 polls", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    const getSession = vi.fn().mockRejectedValue(new AiClientError("AI_SESSION_NOT_FOUND", "gone"));
    const worker = createAnalysisWorker(fakePrisma([active]) as never, fakeAi({ getSession }) as never);
    await worker.tick();
    expect(active.status).toBe("RUNNING");
    await worker.tick();
    expect(active).toMatchObject({ status: "FAILED", errorCode: "COUNCIL_SESSION_LOST" });
  });

  it("a successful poll resets the 404 count", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    const getSession = vi.fn();
    const worker = createAnalysisWorker(fakePrisma([active]) as never, fakeAi({ getSession }) as never);
    getSession.mockRejectedValueOnce(new AiClientError("AI_SESSION_NOT_FOUND", "gone")); await worker.tick();
    getSession.mockResolvedValueOnce(running("x")); await worker.tick();
    getSession.mockRejectedValueOnce(new AiClientError("AI_SESSION_NOT_FOUND", "gone")); await worker.tick();
    expect(active.status).toBe("RUNNING");
  });

  it("caps stage and keeps only string-array progress fields plus elapsedSeconds", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    const many = Array.from({ length: 30 }, () => "y".repeat(150));
    const ai = fakeAi({
      getSession: vi.fn().mockResolvedValue({
        ...running("z"), stage: "s".repeat(500),
        progress: { expected: many, responded: ["A"], missing: ["B", 5], evil: { a: 1 }, note: "x" },
      }),
    });
    await createAnalysisWorker(fakePrisma([active]) as never, ai as never).tick();
    expect(active.stage).toBe("s".repeat(100));
    const p = active.progress as Record<string, unknown>;
    expect(Object.keys(p).sort()).toEqual(["elapsedSeconds", "expected", "responded"]);
    expect((p.expected as string[]).length).toBe(20);
    expect((p.expected as string[])[0]).toBe("y".repeat(100));
    expect(p.responded).toEqual(["A"]);
    expect(p.elapsedSeconds).toBe(60);
  });
});

describe("reconcileOnBoot", () => {
  it("re-queues RUNNING jobs that never got a session id and leaves the rest alone", async () => {
    const orphan = job({ id: "j1", status: "RUNNING", councilSessionId: null, startedAt: new Date() });
    const attached = job({ id: "j2", status: "RUNNING", councilSessionId: "s2" });
    const waiting = job({ id: "j3", status: "QUEUED" });
    const count = await reconcileOnBoot(fakePrisma([orphan, attached, waiting]) as never);

    expect(count).toBe(1);
    expect(orphan).toMatchObject({ status: "QUEUED", startedAt: null, stage: "queued" });
    expect(attached.status).toBe("RUNNING");
    expect(waiting.status).toBe("QUEUED");
  });
});
