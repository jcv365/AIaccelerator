import { createApp } from "./app.js";
import { Pool } from "pg";

const port = Number(process.env.PORT ?? 4000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = createApp({ pool, version: "0.1.0", commit: process.env.GIT_SHA ?? "dev" });

app.listen(port, () => {
  console.log(JSON.stringify({ level: "info", msg: `server listening on ${port}` }));
});
