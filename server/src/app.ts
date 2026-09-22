import express, { Express } from "express";
import type { Pool } from "pg";
import { checkDbConnection } from "./db.js";
import { requestIdMiddleware, requestLoggingMiddleware, errorHandler } from "./errors.js";
import type { AiClient } from "./ai/client.js";
import { AiClientError, type AiErrorCode } from "./ai/errors.js";

export interface AppDeps {
  pool: Pool;
  version: string;
  commit: string;
  aiClient?: AiClient;
}

function aiErrorStatus(code: AiErrorCode): number {
  switch (code) {
    case "AI_NOT_CONFIGURED":
      return 503;
    case "AI_BUSY":
      return 409;
    case "AI_BAD_REQUEST":
      return 400;
    case "AI_UPSTREAM_ERROR":
    case "AI_UNREACHABLE":
      return 502;
    default:
      return 502;
  }
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(requestLoggingMiddleware);
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/ready", async (_req, res) => {
    const dbOk = await checkDbConnection(deps.pool);
    if (!dbOk) {
      res
        .status(503)
        .json({ error: { code: "DB_UNAVAILABLE", message: "Database is unreachable" } });
      return;
    }
    res.status(200).json({ status: "ok" });
  });

  app.get("/version", (_req, res) => {
    res.status(200).json({ version: deps.version, commit: deps.commit });
  });

  app.post("/ai/quick", async (req, res, next) => {
    if (!deps.aiClient) {
      res.status(503).json({ error: { code: "AI_NOT_CONFIGURED", message: "AI backend is not configured" } });
      return;
    }
    const { model, system, prompt } = req.body ?? {};
    if (typeof model !== "string" || typeof system !== "string" || typeof prompt !== "string") {
      res
        .status(400)
        .json({ error: { code: "AI_BAD_REQUEST", message: "model, system, and prompt must be strings" } });
      return;
    }
    try {
      const result = await deps.aiClient.quickAsk(model, system, prompt);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AiClientError) {
        res.status(aiErrorStatus(err.code)).json({ error: { code: err.code, message: err.message } });
        return;
      }
      next(err);
    }
  });

  app.post("/ai/session", async (req, res, next) => {
    if (!deps.aiClient) {
      res.status(503).json({ error: { code: "AI_NOT_CONFIGURED", message: "AI backend is not configured" } });
      return;
    }
    const { goal } = req.body ?? {};
    if (typeof goal !== "string") {
      res.status(400).json({ error: { code: "AI_BAD_REQUEST", message: "goal must be a string" } });
      return;
    }
    try {
      const result = await deps.aiClient.runSession(goal);
      res.status(200).json({ ok: result.ok, session_id: result.sessionId, synthesis: result.synthesis });
    } catch (err) {
      if (err instanceof AiClientError) {
        res.status(aiErrorStatus(err.code)).json({ error: { code: err.code, message: err.message } });
        return;
      }
      next(err);
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
  });

  app.use(errorHandler);

  return app;
}
