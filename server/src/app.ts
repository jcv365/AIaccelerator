import express, { Express } from "express";
import type { Pool } from "pg";
import { checkDbConnection } from "./db.js";
import { requestIdMiddleware, errorHandler } from "./errors.js";

export interface AppDeps {
  pool: Pool;
  version: string;
  commit: string;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);

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

  app.use(errorHandler);

  return app;
}
