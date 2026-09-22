import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { Pool } from "pg";

const config = loadConfig();
const pool = new Pool({ connectionString: config.databaseUrl });
const app = createApp({ pool, version: "0.1.0", commit: process.env.GIT_SHA ?? "dev" });

app.listen(config.port, () => {
  console.log(JSON.stringify({ level: "info", msg: `server listening on ${config.port}` }));
});
