import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { signToken } from "../src/auth.js";

const fakePool = {} as Pool;
const authDeps = {
  pool: fakePool,
  version: "0.1.0",
  commit: "test",
  adminUsername: "admin",
  adminPasswordHash: bcrypt.hashSync("correct-password", 10),
  authTokenSecret: "test-secret",
};

describe("auth gating", () => {
  it("does not require a token for /health", async () => {
    const app = createApp(authDeps);

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
  });

  it("does not require a token for /ready", async () => {
    const app = createApp(authDeps);

    const res = await request(app).get("/ready");

    expect(res.status).not.toBe(401);
  });

  it("does not require a token for /version", async () => {
    const app = createApp(authDeps);

    const res = await request(app).get("/version");

    expect(res.status).toBe(200);
  });

  it("does not require a token for POST /auth/login", async () => {
    const app = createApp(authDeps);

    const res = await request(app).post("/auth/login").send({ username: "admin", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
  });

  it("requires a token for /ai/quick", async () => {
    const app = createApp(authDeps);

    const res = await request(app).post("/ai/quick").send({ model: "Claude", system: "s", prompt: "p" });

    expect(res.status).toBe(401);
  });

  it("allows /ai/quick through with a valid token (still 503 AI_NOT_CONFIGURED since no aiClient)", async () => {
    const app = createApp(authDeps);
    const token = signToken("test-secret", "admin");

    const res = await request(app)
      .post("/ai/quick")
      .set("Authorization", `Bearer ${token}`)
      .send({ model: "Claude", system: "s", prompt: "p" });

    expect(res.status).toBe(503);
  });

  it("requires a token for /opportunities", async () => {
    const fakePrisma = { opportunity: { findMany: vi.fn() } };
    const app = createApp({ ...authDeps, prisma: fakePrisma as never });

    const res = await request(app).get("/opportunities");

    expect(res.status).toBe(401);
  });

  it("returns 401 for an unauthenticated request to an unknown route (no route enumeration)", async () => {
    const app = createApp(authDeps);

    const res = await request(app).get("/totally-not-a-real-route");

    expect(res.status).toBe(401);
  });
});
