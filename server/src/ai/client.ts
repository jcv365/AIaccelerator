import { Agent } from "undici";
import { AiClientError } from "./errors.js";

export interface AiClientConfig {
  baseUrl: string;
  apiKey: string;
}

export interface QuickAskResult {
  ok: true;
  model: string;
  response: string;
}

export interface SessionResult {
  ok: true;
  sessionId: string;
  synthesis: unknown;
}

export interface SessionOptions {
  /** Conclave-side path of the experts roster to use (default: the full /app/experts.yaml). */
  configPath?: string;
  timeoutMs?: number;
}

export type CouncilSessionState = "running" | "concluded" | "failed" | "lost";

export interface CouncilProgress {
  expected: string[];
  responded: string[];
  missing: string[];
}

export interface CouncilSessionStatus {
  sessionId: string;
  status: CouncilSessionState;
  stage: string;
  round: number | null;
  elapsedSeconds: number | null;
  progress: CouncilProgress | null;
  result: { synthesis: unknown; chairman: string | null; attempts: number; passed: boolean } | null;
  error: { kind: string; message: string } | null;
}

export interface AiClient {
  /** configPath selects a Conclave-side roster (e.g. one with a larger Fusion token cap); omit for the default. */
  quickAsk(model: string, system: string, prompt: string, timeoutMs?: number, configPath?: string): Promise<QuickAskResult>;
  runSession(goal: string, webResearch?: boolean, opts?: SessionOptions): Promise<SessionResult>;
  /** Starts a Conclave session and returns its id at once; the Conclave runs it in the background. */
  startSession(goal: string, webResearch?: boolean, opts?: SessionOptions): Promise<{ sessionId: string }>;
  /** Progress and, once finished, the result or failure of a session started with startSession. */
  getSession(sessionId: string): Promise<CouncilSessionStatus>;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const REQUEST_TIMEOUT_MS = 30_000;
const SESSION_STATES: readonly string[] = ["running", "concluded", "failed", "lost"];

// One attempt, no retry: callers (the analysis worker) own the retry policy, and postJson's retry on 409 would
// only delay the "Conclave is busy" answer.
async function requestOnce(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new AiClientError("AI_UNREACHABLE", "Could not reach the conclave");
  }
}

// retryOnNetworkError must be false for long-running session posts: a timeout abort leaves the
// conclave still running the first request, so a re-POST would only hit 409 and muddy the error.
async function postJson(
  url: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
  retryOnNetworkError = true,
  dispatcher?: Agent
): Promise<Response> {
  let attempt = 0;
  const maxAttempts = 3;

  while (true) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        // Node's fetch has its own 300s headers/body timeout that AbortSignal cannot raise.
        ...(dispatcher ? { dispatcher } : {}),
      } as RequestInit);

      if (res.status === 409 && attempt < maxAttempts - 1) {
        attempt += 1;
        await delay(500 * attempt);
        continue;
      }

      return res;
    } catch {
      if (retryOnNetworkError && attempt < maxAttempts - 1) {
        attempt += 1;
        await delay(500 * attempt);
        continue;
      }
      throw new AiClientError("AI_UNREACHABLE", "Could not reach the conclave");
    }
  }
}

async function parseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new AiClientError("AI_UPSTREAM_ERROR", "Conclave returned a non-JSON response");
  }
}

function mapStatusToError(status: number): AiClientError {
  if (status === 403) return new AiClientError("AI_UPSTREAM_ERROR", "Conclave rejected the API key");
  if (status === 409) return new AiClientError("AI_BUSY", "Conclave is busy with another session");
  if (status === 400) return new AiClientError("AI_BAD_REQUEST", "Conclave rejected the request");
  return new AiClientError("AI_UPSTREAM_ERROR", `Conclave returned status ${status}`);
}

export function createAiClient(config: AiClientConfig): AiClient {
  return {
    async quickAsk(model, system, prompt, timeoutMs = 30_000, configPath) {
      const res = await postJson(
        `${config.baseUrl}/api/external/quick`,
        config.apiKey,
        { model, system, prompt, ...(configPath ? { config_path: configPath } : {}) },
        timeoutMs
      );
      if (!res.ok) throw mapStatusToError(res.status);
      const body = (await parseJson(res)) as { ok?: boolean; model?: unknown; response?: unknown };
      if (!body.ok || typeof body.model !== "string" || typeof body.response !== "string") {
        throw new AiClientError("AI_UPSTREAM_ERROR", "Conclave returned an unexpected response shape");
      }
      return { ok: true, model: body.model, response: body.response };
    },

    async runSession(goal, webResearch = false, opts = {}) {
      const timeoutMs = opts.timeoutMs ?? 5 * 60_000;
      const dispatcher = new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
      try {
        const res = await postJson(
          `${config.baseUrl}/api/external/session`,
          config.apiKey,
          { goal, web_research: webResearch, config_path: opts.configPath ?? "/app/experts.yaml" },
          timeoutMs,
          false,
          dispatcher
        );
        if (!res.ok) throw mapStatusToError(res.status);
        const body = (await parseJson(res)) as {
          ok: boolean;
          session_id: string;
          synthesis?: unknown;
          error?: unknown;
        };
        if (!body.ok) {
          throw new AiClientError("AI_UPSTREAM_ERROR", `Conclave session failed: ${JSON.stringify(body.error)}`);
        }
        return { ok: true, sessionId: body.session_id, synthesis: body.synthesis };
      } finally {
        void dispatcher.close();
      }
    },

    async startSession(goal, webResearch = false, opts = {}) {
      const res = await requestOnce(`${config.baseUrl}/api/external/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey },
        body: JSON.stringify({ goal, web_research: webResearch, config_path: opts.configPath ?? "/app/experts.yaml" }),
      });
      if (!res.ok) throw mapStatusToError(res.status);
      const body = (await parseJson(res)) as { ok?: boolean; session_id?: unknown };
      if (!body.ok || typeof body.session_id !== "string") {
        throw new AiClientError("AI_UPSTREAM_ERROR", "Conclave returned an unexpected response shape");
      }
      return { sessionId: body.session_id };
    },

    async getSession(sessionId) {
      const res = await requestOnce(`${config.baseUrl}/api/external/session/${encodeURIComponent(sessionId)}`, {
        method: "GET",
        headers: { "X-API-Key": config.apiKey },
      });
      if (res.status === 404) throw new AiClientError("AI_SESSION_NOT_FOUND", "The conclave does not know this session");
      if (!res.ok) throw mapStatusToError(res.status);
      const body = (await parseJson(res)) as {
        ok?: boolean;
        status?: unknown;
        stage?: unknown;
        round?: unknown;
        elapsed_seconds?: unknown;
        progress?: CouncilProgress | null;
        result?: CouncilSessionStatus["result"];
        error?: CouncilSessionStatus["error"];
      };
      if (!body.ok || typeof body.status !== "string" || !SESSION_STATES.includes(body.status)) {
        throw new AiClientError("AI_UPSTREAM_ERROR", "Conclave returned an unexpected response shape");
      }
      return {
        sessionId,
        status: body.status as CouncilSessionState,
        stage: typeof body.stage === "string" ? body.stage : "",
        round: typeof body.round === "number" ? body.round : null,
        elapsedSeconds: typeof body.elapsed_seconds === "number" ? body.elapsed_seconds : null,
        progress: body.progress ?? null,
        result: body.result ?? null,
        error: body.error ?? null,
      };
    },
  };
}
