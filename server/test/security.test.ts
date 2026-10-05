import { describe, it, expect } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";

function app() {
  return createApp({
    pool: {} as Pool,
    version: "0.1.0",
    commit: "test",
    adminUsername: "admin",
    adminPasswordHash: "test-hash",
    authTokenSecret: "test-secret",
  });
}

describe("security headers", () => {
  it("sets standard hardening headers and does not advertise Express", async () => {
    const res = await request(app()).get("/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["referrer-policy"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("also sets them on error responses (e.g. 404 and 401)", async () => {
    const unauth = await request(app()).get("/opportunities");
    expect(unauth.status).toBe(401);
    expect(unauth.headers["x-content-type-options"]).toBe("nosniff");
  });
});
