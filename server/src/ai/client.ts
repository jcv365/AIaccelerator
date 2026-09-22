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

export interface AiClient {
  quickAsk(model: string, system: string, prompt: string): Promise<QuickAskResult>;
  runSession(goal: string): Promise<SessionResult>;
}

async function postJson(url: string, apiKey: string, body: unknown, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new AiClientError("AI_UNREACHABLE", "Could not reach the conclave");
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
    async quickAsk(model, system, prompt) {
      const res = await postJson(
        `${config.baseUrl}/api/external/quick`,
        config.apiKey,
        { model, system, prompt },
        30_000
      );
      if (!res.ok) throw mapStatusToError(res.status);
      const body = (await parseJson(res)) as { ok?: boolean; model?: unknown; response?: unknown };
      if (!body.ok || typeof body.model !== "string" || typeof body.response !== "string") {
        throw new AiClientError("AI_UPSTREAM_ERROR", "Conclave returned an unexpected response shape");
      }
      return { ok: true, model: body.model, response: body.response };
    },

    async runSession(goal) {
      const res = await postJson(
        `${config.baseUrl}/api/external/session`,
        config.apiKey,
        { goal },
        5 * 60_000
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
    },
  };
}
