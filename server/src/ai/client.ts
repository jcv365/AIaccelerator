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
  quickAsk(model: string, system: string, prompt: string, timeoutMs?: number): Promise<QuickAskResult>;
  runSession(goal: string, webResearch?: boolean): Promise<SessionResult>;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(url: string, apiKey: string, body: unknown, timeoutMs: number): Promise<Response> {
  let attempt = 0;
  const maxAttempts = 3;

  while (true) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 409 && attempt < maxAttempts - 1) {
        attempt += 1;
        await delay(500 * attempt);
        continue;
      }

      return res;
    } catch {
      if (attempt < maxAttempts - 1) {
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
    async quickAsk(model, system, prompt, timeoutMs = 30_000) {
      const res = await postJson(
        `${config.baseUrl}/api/external/quick`,
        config.apiKey,
        { model, system, prompt },
        timeoutMs
      );
      if (!res.ok) throw mapStatusToError(res.status);
      const body = (await parseJson(res)) as { ok?: boolean; model?: unknown; response?: unknown };
      if (!body.ok || typeof body.model !== "string" || typeof body.response !== "string") {
        throw new AiClientError("AI_UPSTREAM_ERROR", "Conclave returned an unexpected response shape");
      }
      return { ok: true, model: body.model, response: body.response };
    },

    async runSession(goal, webResearch = false) {
      const res = await postJson(
        `${config.baseUrl}/api/external/session`,
        config.apiKey,
        { goal, web_research: webResearch, config_path: "/app/experts.yaml" },
        20 * 60_000
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
