import { describe, it, expect } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";

describe("error handling", () => {
  it("returns a structured 500 body and never leaks a stack trace", async () => {
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
});
