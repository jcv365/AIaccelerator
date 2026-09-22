import express, { Express } from "express";
import type { Pool } from "pg";

export interface AppDeps {
  pool: Pool;
  version: string;
  commit: string;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  return app;
}
