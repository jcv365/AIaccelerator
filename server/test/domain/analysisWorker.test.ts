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

function fakePrisma(jobs: Job[]) {
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
    opportunity: { create: vi.fn(async () => ({ id: `opp${++oppCount}` })) },
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
    expect(opts).toEqual({ configPath: "/code/roster.yaml" });
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
    const ai = fakeAi({ startSession: vi.fn().mockRejectedValue(new AiClientError("AI_UPSTREAM_ERROR", "Conclave rejected the API key")) });
    await createAnalysisWorker(fakePrisma([queued]) as never, ai as never).tick();
    expect(queued).toMatchObject({ status: "FAILED", errorCode: "AI_UPSTREAM_ERROR", errorMessage: "Conclave rejected the API key" });
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

  it("a new worker reattaches to a RUNNING job with a session id (restart safety)", async () => {
    const survivor = job({ id: "j1", status: "RUNNING", councilSessionId: "s1", startedAt: new Date("2026-10-07T08:00:00Z") });
    const ai = fakeAi({ getSession: vi.fn().mockResolvedValue(concluded()) });
    // A brand new worker instance, as after a server restart: it knows nothing but the database.
    await createAnalysisWorker(fakePrisma([survivor]) as never, ai as never).tick();
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
    await createAnalysisWorker(
      fakePrisma([unknown]) as never,
      fakeAi({ getSession: vi.fn().mockRejectedValue(new AiClientError("AI_SESSION_NOT_FOUND", "gone")) }) as never
    ).tick();
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
  it("tick never throws, even on an unexpected error", async () => {
    const active = job({ id: "j1", status: "RUNNING", councilSessionId: "s1" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const ai = fakeAi({ getSession: vi.fn().mockRejectedValue(new Error("boom")) });
    await expect(createAnalysisWorker(fakePrisma([active]) as never, ai as never).tick()).resolves.toBeUndefined();
    expect(active.status).toBe("RUNNING");
    expect(log).toHaveBeenCalled();
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
