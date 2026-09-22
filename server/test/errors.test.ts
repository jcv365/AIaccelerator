import { describe, it, expect } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";

describe("error handling", () => {
  it("returns a structured 503 body from /ready when the DB is unreachable, and never leaks a stack trace", async () => {
    const throwingPool = {
      query: () => {
        throw new Error("boom");
      },
    } as unknown as Pool;
    const app = createApp({ pool: throwingPool, version: "0.1.0", commit: "test" });

    const res = await request(app).get("/ready");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: { code: "DB_UNAVAILABLE", message: "Database is unreachable" },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:\d+/);
  });

  it("attaches an X-Request-Id header to every response", async () => {
    const fakePool = {} as Pool;
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test" });

    const res = await request(app).get("/health");

    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("routes a thrown/malformed-body error through errorHandler with a structured 500 and no stack trace leak", async () => {
    const fakePool = {} as Pool;
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test" });

    const res = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send("{not valid json");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:\d+/);
  });

  it("returns a structured 404 body for unknown routes", async () => {
    const fakePool = {} as Pool;
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test" });

    const res = await request(app).get("/nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: "Not found" },
    });
  });
});
