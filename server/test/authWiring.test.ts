import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";

const fakePool = {} as Pool;

describe("API key gating", () => {
  it("does not require a key for /health", async () => {
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test", acceleratorApiKey: "secret" });

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
  });

  it("does not require a key for /ready", async () => {
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test", acceleratorApiKey: "secret" });

    const res = await request(app).get("/ready");

    expect(res.status).not.toBe(401);
  });

  it("does not require a key for /version", async () => {
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test", acceleratorApiKey: "secret" });

    const res = await request(app).get("/version");

    expect(res.status).toBe(200);
  });

  it("requires a key for /ai/quick", async () => {
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test", acceleratorApiKey: "secret" });

    const res = await request(app).post("/ai/quick").send({ model: "Claude", system: "s", prompt: "p" });

    expect(res.status).toBe(401);
  });

  it("allows /ai/quick through with the right key (still 503 AI_NOT_CONFIGURED since no aiClient)", async () => {
    const app = createApp({ pool: fakePool, version: "0.1.0", commit: "test", acceleratorApiKey: "secret" });

    const res = await request(app)
      .post("/ai/quick")
      .set("X-API-Key", "secret")
      .send({ model: "Claude", system: "s", prompt: "p" });

    expect(res.status).toBe(503);
  });

  it("requires a key for /opportunities", async () => {
    const fakePrisma = { opportunity: { findMany: vi.fn() } };
    const app = createApp({
      pool: fakePool,
      version: "0.1.0",
      commit: "test",
      acceleratorApiKey: "secret",
      prisma: fakePrisma as never,
    });

    const res = await request(app).get("/opportunities");

    expect(res.status).toBe(401);
  });
});
