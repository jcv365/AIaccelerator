import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createAuthRouter } from "../../src/domain/authRoutes.js";

const passwordHash = bcrypt.hashSync("correct-password", 10);
const config = { adminUsername: "admin", adminPasswordHash: passwordHash, authTokenSecret: "test-secret" };

function app() {
  const a = express();
  a.use(express.json());
  a.use("/auth", createAuthRouter(config));
  return a;
}

describe("POST /auth/login", () => {
  it("returns a token for correct credentials", async () => {
    const res = await request(app()).post("/auth/login").send({ username: "admin", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
  });

  it("returns 401 for a wrong username", async () => {
    const res = await request(app()).post("/auth/login").send({ username: "nope", password: "correct-password" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
  });

  it("returns 401 for a wrong password", async () => {
    const res = await request(app()).post("/auth/login").send({ username: "admin", password: "wrong" });

    expect(res.status).toBe(401);
  });

  it("returns 401 when the body is missing fields", async () => {
    const res = await request(app()).post("/auth/login").send({});

    expect(res.status).toBe(401);
  });
});

describe("POST /auth/login rate limiting", () => {
  function limitedApp(maxFailedAttempts = 3) {
    const a = express();
    a.use(express.json());
    a.use("/auth", createAuthRouter(config, { maxFailedAttempts, windowMs: 60_000 }));
    return a;
  }
  const bad = { username: "admin", password: "wrong" };

  it("blocks further attempts with 429 RATE_LIMITED after too many failed logins", async () => {
    const a = limitedApp(3);
    for (let i = 0; i < 3; i++) {
      expect((await request(a).post("/auth/login").send(bad)).status).toBe(401);
    }

    const blocked = await request(a).post("/auth/login").send(bad);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: { code: "RATE_LIMITED", message: expect.any(String) } });
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("also blocks a correct password once the limit is hit (no password guessing past the limit)", async () => {
    const a = limitedApp(2);
    for (let i = 0; i < 2; i++) await request(a).post("/auth/login").send(bad);

    const res = await request(a).post("/auth/login").send({ username: "admin", password: "correct-password" });
    expect(res.status).toBe(429);
  });

  it("does not count successful logins against the limit", async () => {
    const a = limitedApp(2);
    for (let i = 0; i < 5; i++) {
      const ok = await request(a).post("/auth/login").send({ username: "admin", password: "correct-password" });
      expect(ok.status).toBe(200);
    }
  });
});
