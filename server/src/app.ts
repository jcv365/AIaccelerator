import express, { Express } from "express";
import type { Pool } from "pg";
import { checkDbConnection } from "./db.js";
import { requestIdMiddleware, requestLoggingMiddleware, errorHandler } from "./errors.js";

export interface AppDeps {
  pool: Pool;
  version: string;
  commit: string;
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

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
  });

  app.use(errorHandler);

  return app;
}
