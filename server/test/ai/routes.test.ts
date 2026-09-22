import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { AiClientError } from "../../src/ai/errors.js";
import type { AiClient } from "../../src/ai/client.js";

const fakePool = {} as Pool;

function appWithAiClient(aiClient?: AiClient) {
  return createApp({ pool: fakePool, version: "0.1.0", commit: "test", aiClient });
}

describe("POST /ai/quick", () => {
  it("returns 503 AI_NOT_CONFIGURED when no aiClient is configured", async () => {
    const app = appWithAiClient(undefined);

    const res = await request(app).post("/ai/quick").send({ model: "Claude", system: "s", prompt: "p" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: { code: "AI_NOT_CONFIGURED", message: expect.any(String) } });
  });

  it("returns 400 AI_BAD_REQUEST when the body is missing required fields", async () => {
    const aiClient = { quickAsk: vi.fn(), runSession: vi.fn() } as unknown as AiClient;
    const app = appWithAiClient(aiClient);

    const res = await request(app).post("/ai/quick").send({ model: "Claude" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("AI_BAD_REQUEST");
    expect(aiClient.quickAsk).not.toHaveBeenCalled();
  });

  it("passes through a successful quickAsk result", async () => {
    const aiClient = {
      quickAsk: vi.fn().mockResolvedValue({ ok: true, model: "Claude", response: "hi" }),
      runSession: vi.fn(),
    } as unknown as AiClient;
    const app = appWithAiClient(aiClient);

    const res = await request(app).post("/ai/quick").send({ model: "Claude", system: "s", prompt: "p" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, model: "Claude", response: "hi" });
    expect(aiClient.quickAsk).toHaveBeenCalledWith("Claude", "s", "p");
  });

  it("maps an AiClientError to the matching HTTP status", async () => {
    const aiClient = {
      quickAsk: vi.fn().mockRejectedValue(new AiClientError("AI_BUSY", "busy")),
      runSession: vi.fn(),
    } as unknown as AiClient;
    const app = appWithAiClient(aiClient);

    const res = await request(app).post("/ai/quick").send({ model: "Claude", system: "s", prompt: "p" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: "AI_BUSY", message: "busy" } });
  });
});

describe("POST /ai/session", () => {
  it("returns 503 AI_NOT_CONFIGURED when no aiClient is configured", async () => {
    const app = appWithAiClient(undefined);

    const res = await request(app).post("/ai/session").send({ goal: "evaluate X" });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("returns 400 AI_BAD_REQUEST when goal is missing", async () => {
    const aiClient = { quickAsk: vi.fn(), runSession: vi.fn() } as unknown as AiClient;
    const app = appWithAiClient(aiClient);

    const res = await request(app).post("/ai/session").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("AI_BAD_REQUEST");
  });

  it("passes through a successful runSession result", async () => {
    const aiClient = {
      quickAsk: vi.fn(),
      runSession: vi.fn().mockResolvedValue({ ok: true, sessionId: "abc123", synthesis: { decision: "go" } }),
    } as unknown as AiClient;
    const app = appWithAiClient(aiClient);

    const res = await request(app).post("/ai/session").send({ goal: "evaluate X" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, session_id: "abc123", synthesis: { decision: "go" } });
    expect(aiClient.runSession).toHaveBeenCalledWith("evaluate X");
  });

  it("maps an AiClientError to the matching HTTP status", async () => {
    const aiClient = {
      quickAsk: vi.fn(),
      runSession: vi.fn().mockRejectedValue(new AiClientError("AI_UNREACHABLE", "down")),
    } as unknown as AiClient;
    const app = appWithAiClient(aiClient);

    const res = await request(app).post("/ai/session").send({ goal: "evaluate X" });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: { code: "AI_UNREACHABLE", message: "down" } });
  });
});
