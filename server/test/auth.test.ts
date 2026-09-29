import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { signToken, verifyToken, requireAuth } from "../src/auth.js";

describe("signToken/verifyToken", () => {
  it("round-trips a valid token", () => {
    const token = signToken("secret", "admin");
    expect(verifyToken("secret", token)).toBe(true);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signToken("secret", "admin");
    expect(verifyToken("other-secret", token)).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(verifyToken("secret", "not-a-token")).toBe(false);
  });
});

function appWithAuth(secret: string) {
  const app = express();
  app.use(requireAuth(secret));
  app.get("/protected", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("requireAuth", () => {
  it("returns 401 when there is no Authorization header", async () => {
    const app = appWithAuth("secret");

    const res = await request(app).get("/protected");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
  });

  it("returns 401 for a malformed Authorization header", async () => {
    const app = appWithAuth("secret");

    const res = await request(app).get("/protected").set("Authorization", "NotBearer xyz");

    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid token", async () => {
    const app = appWithAuth("secret");

    const res = await request(app).get("/protected").set("Authorization", "Bearer garbage");

    expect(res.status).toBe(401);
  });

  it("allows the request through with a valid token", async () => {
    const token = signToken("secret", "admin");
    const app = appWithAuth("secret");

    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
