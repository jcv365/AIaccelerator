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
