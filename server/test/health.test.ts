import { describe, it, expect } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns 200 and status ok without touching the database", async () => {
    const fakePool = {} as Pool;
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test" });

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
