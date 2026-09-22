import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool } from "../src/db.js";
import { loadConfig } from "../src/config.js";

// Requires a reachable Postgres at DATABASE_URL (e.g. `docker compose up -d postgres`).
// Run explicitly via `npm run test:integration`; not part of the default `npm test`.
describe("GET /ready (integration)", () => {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  const app = createApp({ pool, version: "0.1.0", commit: "test" });

  afterAll(async () => {
    await pool.end();
  });

  it("returns 200 against a real Postgres connection", async () => {
    const res = await request(app).get("/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
