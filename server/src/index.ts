import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { createAiClient } from "./ai/client.js";
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
const app = createApp({ pool, version: pkg.version, commit: process.env.GIT_SHA ?? "dev", aiClient });

app.listen(config.port, () => {
  console.log(JSON.stringify({ level: "info", msg: `server listening on ${config.port}` }));
});
