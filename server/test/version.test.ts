import { describe, it, expect } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";

describe("GET /version", () => {
  it("returns the configured version and commit", async () => {
    const fakePool = {} as Pool;
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "abc1234" });

    const res = await request(app).get("/version");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ version: "0.1.0", commit: "abc1234" });
  });
});
