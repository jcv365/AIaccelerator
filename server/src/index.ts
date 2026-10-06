import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { createAiClient } from "./ai/client.js";
import { createPrismaClient } from "./db/prisma.js";
import { reconcileInterruptedJobs } from "./domain/analysis.js";
import { reconcileInterruptedReports } from "./reporting/service.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const aiClient =
  config.councilBaseUrl && config.councilApiKey
    ? createAiClient({ baseUrl: config.councilBaseUrl, apiKey: config.councilApiKey })
    : undefined;
const prisma = createPrismaClient();
const app = createApp({
  pool,
  version: pkg.version,
  commit: process.env.GIT_SHA ?? "dev",
  adminUsername: config.adminUsername,
  adminPasswordHash: config.adminPasswordHash,
  authTokenSecret: config.authTokenSecret,
  aiClient,
  prisma,
});

reconcileInterruptedJobs(prisma)
  .then((n) => n > 0 && console.log(JSON.stringify({ level: "warn", msg: `marked ${n} interrupted analysis job(s) as failed` })))
  .catch((err) => console.error(JSON.stringify({ level: "error", msg: "analysis job reconcile failed", err: String(err) })));

reconcileInterruptedReports(prisma)
  .then((n) => n > 0 && console.log(JSON.stringify({ level: "warn", msg: `marked ${n} interrupted report(s) as failed` })))
  .catch((err) => console.error(JSON.stringify({ level: "error", msg: "report reconcile failed", err: String(err) })));

app.listen(config.port, () => {
  console.log(JSON.stringify({ level: "info", msg: `server listening on ${config.port}` }));
});
