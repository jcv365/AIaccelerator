import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { requireAccelApiKey } from "../src/auth.js";

function appWithAuth(expectedKey: string) {
  const app = express();
  app.use(requireAccelApiKey(expectedKey));
  app.get("/protected", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("requireAccelApiKey", () => {
  it("returns 401 when the header is missing", async () => {
    const app = appWithAuth("correct-key");

    const res = await request(app).get("/protected");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "UNAUTHORIZED", message: expect.any(String) } });
  });

  it("returns 401 when the header is wrong", async () => {
    const app = appWithAuth("correct-key");

    const res = await request(app).get("/protected").set("X-API-Key", "wrong-key");

    expect(res.status).toBe(401);
  });

  it("allows the request through when the header matches", async () => {
    const app = appWithAuth("correct-key");

    const res = await request(app).get("/protected").set("X-API-Key", "correct-key");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
