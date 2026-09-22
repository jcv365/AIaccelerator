import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";

describe("GET /ready", () => {
  it("returns 200 when the database is reachable", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }) } as unknown as Pool;
    const app = createApp({ pool, version: "0.1.0", commit: "test" });

    const res = await request(app).get("/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("returns 503 with a structured error when the database is unreachable", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("connection refused")),
    } as unknown as Pool;
    const app = createApp({ pool, version: "0.1.0", commit: "test" });

    const res = await request(app).get("/ready");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: { code: "DB_UNAVAILABLE", message: "Database is unreachable" },
    });
  });
});
