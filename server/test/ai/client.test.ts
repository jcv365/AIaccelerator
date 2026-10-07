import { describe, it, expect, vi, afterEach } from "vitest";
import { createAiClient } from "../../src/ai/client.js";

const config = { baseUrl: "http://conclave.test", apiKey: "test-key" };

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOnce(response: { ok: boolean; status?: number; json: () => Promise<unknown> }) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

describe("createAiClient.quickAsk", () => {
  it("posts to /api/external/quick with the X-API-Key header and returns the parsed result", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ ok: true, model: "Claude", response: "hi" }) });
    const client = createAiClient(config);

    const result = await client.quickAsk("Claude", "sys", "prompt");

    expect(result).toEqual({ ok: true, model: "Claude", response: "hi" });
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://conclave.test/api/external/quick");
    expect(init.method).toBe("POST");
    expect(init.headers["X-API-Key"]).toBe("test-key");
    expect(JSON.parse(init.body)).toEqual({ model: "Claude", system: "sys", prompt: "prompt" });
  });

  it("maps a 403 response to AI_UPSTREAM_ERROR", async () => {
    mockFetchOnce({ ok: false, status: 403, json: async () => ({}) });
    const client = createAiClient(config);

    await expect(client.quickAsk("Claude", "sys", "prompt")).rejects.toMatchObject({
      code: "AI_UPSTREAM_ERROR",
    });
  });

  it("maps a 409 response to AI_BUSY", async () => {
    mockFetchOnce({ ok: false, status: 409, json: async () => ({}) });
    const client = createAiClient(config);

    await expect(client.quickAsk("Claude", "sys", "prompt")).rejects.toMatchObject({ code: "AI_BUSY" });
  });

  it("maps a 400 response to AI_BAD_REQUEST", async () => {
    mockFetchOnce({ ok: false, status: 400, json: async () => ({}) });
    const client = createAiClient(config);

    await expect(client.quickAsk("Claude", "sys", "prompt")).rejects.toMatchObject({
      code: "AI_BAD_REQUEST",
    });
  });

  it("maps a network failure to AI_UNREACHABLE", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const client = createAiClient(config);

    await expect(client.quickAsk("Claude", "sys", "prompt")).rejects.toMatchObject({
      code: "AI_UNREACHABLE",
    });
  });

  it("maps a non-JSON 2xx response to AI_UPSTREAM_ERROR", async () => {
    mockFetchOnce({
      ok: true,
      json: async () => {
        throw new Error("invalid json");
      },
    });
    const client = createAiClient(config);

    await expect(client.quickAsk("Claude", "sys", "prompt")).rejects.toMatchObject({
      code: "AI_UPSTREAM_ERROR",
    });
  });

  it("throws AI_UPSTREAM_ERROR when the conclave returns ok:false in a 200 response", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ ok: false }) });
    const client = createAiClient(config);

    await expect(client.quickAsk("Claude", "sys", "prompt")).rejects.toMatchObject({
      code: "AI_UPSTREAM_ERROR",
    });
  });

  it("throws AI_UPSTREAM_ERROR when the conclave response is missing model/response fields", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ ok: true, model: "Claude" }) });
    const client = createAiClient(config);

    await expect(client.quickAsk("Claude", "sys", "prompt")).rejects.toMatchObject({
      code: "AI_UPSTREAM_ERROR",
    });
  });

  it("respects an optional timeoutMs override when signalling the abort timeout", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    mockFetchOnce({ ok: true, json: async () => ({ ok: true, model: "Claude", response: "hi" }) });
    const client = createAiClient(config);

    await client.quickAsk("Claude", "sys", "prompt", 90_000);

    expect(timeoutSpy).toHaveBeenCalledWith(90_000);
  });
});

describe("createAiClient.runSession", () => {
  it("posts to /api/external/session and maps session_id to sessionId", async () => {
    mockFetchOnce({
      ok: true,
      json: async () => ({ ok: true, session_id: "abc123", synthesis: { decision: "proceed" } }),
    });
    const client = createAiClient(config);

    const result = await client.runSession("evaluate X");

    expect(result).toEqual({ ok: true, sessionId: "abc123", synthesis: { decision: "proceed" } });
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://conclave.test/api/external/session");
    expect(JSON.parse(init.body)).toEqual({
      goal: "evaluate X",
      web_research: false,
      config_path: "/app/experts.yaml",
    });
  });

  it("throws AI_UPSTREAM_ERROR when the conclave returns ok:false in a 200 response", async () => {
    mockFetchOnce({
      ok: true,
      json: async () => ({ ok: false, session_id: "abc123", error: { message: "chairman crashed" } }),
    });
    const client = createAiClient(config);

    await expect(client.runSession("evaluate X")).rejects.toMatchObject({ code: "AI_UPSTREAM_ERROR" });
  });

  it("retries once when the conclave responds busy and then succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({}) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, session_id: "abc123", synthesis: "done" }) })
    );
    const client = createAiClient(config);

    await expect(client.runSession("evaluate X")).resolves.toMatchObject({
      ok: true,
      sessionId: "abc123",
      synthesis: "done",
    });
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("maps a non-JSON 2xx response to AI_UPSTREAM_ERROR", async () => {
    mockFetchOnce({
      ok: true,
      json: async () => {
        throw new Error("invalid json");
      },
    });
    const client = createAiClient(config);

    await expect(client.runSession("evaluate X")).rejects.toMatchObject({
      code: "AI_UPSTREAM_ERROR",
    });
  });

  it("sends a custom config_path and uses a custom timeout when given options", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    mockFetchOnce({ ok: true, json: async () => ({ ok: true, session_id: "s1", synthesis: "done" }) });
    const client = createAiClient(config);

    await client.runSession("evaluate X", true, { configPath: "/code/x.yaml", timeoutMs: 1_800_000 });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ goal: "evaluate X", web_research: true, config_path: "/code/x.yaml" });
    expect(timeoutSpy).toHaveBeenCalledWith(1_800_000);
  });

  it("passes a dispatcher whose header/body timeouts cover the session timeout (Node's fetch defaults to 300s)", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ ok: true, session_id: "s1", synthesis: "done" }) });
    const client = createAiClient(config);

    await client.runSession("evaluate X", true, { timeoutMs: 1_800_000 });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.dispatcher).toBeDefined();
  });

  it("does NOT re-POST after a timeout/network failure (the conclave may still be running the first request)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aborted")));
    const client = createAiClient(config);

    await expect(client.runSession("evaluate X")).rejects.toMatchObject({ code: "AI_UNREACHABLE" });
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});

describe("createAiClient.startSession", () => {
  it("posts to /api/external/session/start with the API key and returns the session id", async () => {
    mockFetchOnce({ ok: true, status: 202, json: async () => ({ ok: true, session_id: "ab12cd34ef56" }) });
    const client = createAiClient(config);

    const result = await client.startSession("the goal", true, { configPath: "/code/roster.yaml" });

    expect(result).toEqual({ sessionId: "ab12cd34ef56" });
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://conclave.test/api/external/session/start");
    expect(init.method).toBe("POST");
    expect(init.headers["X-API-Key"]).toBe("test-key");
    expect(JSON.parse(init.body)).toEqual({ goal: "the goal", web_research: true, config_path: "/code/roster.yaml" });
  });

  it("maps a 409 busy response to AI_BUSY without retrying", async () => {
    mockFetchOnce({ ok: false, status: 409, json: async () => ({ ok: false, error: { kind: "busy" } }) });
    await expect(createAiClient(config).startSession("g")).rejects.toMatchObject({ code: "AI_BUSY" });
    expect(fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it("maps a network failure to AI_UNREACHABLE", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(createAiClient(config).startSession("g")).rejects.toMatchObject({ code: "AI_UNREACHABLE" });
  });

  it("rejects an unexpected response shape", async () => {
    mockFetchOnce({ ok: true, status: 202, json: async () => ({ ok: true }) });
    await expect(createAiClient(config).startSession("g")).rejects.toMatchObject({ code: "AI_UPSTREAM_ERROR" });
  });
});

describe("createAiClient.getSession", () => {
  it("maps the Conclave's snake_case status to camelCase", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true, session_id: "s1", status: "running", stage: "critiques", round: 1, elapsed_seconds: 912,
        progress: { expected: ["A", "B"], responded: ["A"], missing: ["B"] }, result: null, error: null,
      }),
    });
    const result = await createAiClient(config).getSession("s1");

    expect(result).toEqual({
      sessionId: "s1", status: "running", stage: "critiques", round: 1, elapsedSeconds: 912,
      progress: { expected: ["A", "B"], responded: ["A"], missing: ["B"] }, result: null, error: null,
    });
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://conclave.test/api/external/session/s1");
    expect(init.method).toBe("GET");
    expect(init.headers["X-API-Key"]).toBe("test-key");
  });

  it("returns the result of a concluded session and the error of a failed one", async () => {
    mockFetchOnce({
      ok: true, status: 200,
      json: async () => ({
        ok: true, session_id: "s1", status: "failed", stage: "done", round: 1, elapsed_seconds: 60, progress: null,
        result: { synthesis: "raw", chairman: null, attempts: 0, passed: false },
        error: { kind: "chairman_failed", message: "Fusion: Request timed out." },
      }),
    });
    const result = await createAiClient(config).getSession("s1");
    expect(result.status).toBe("failed");
    expect(result.error).toEqual({ kind: "chairman_failed", message: "Fusion: Request timed out." });
    expect(result.result).toMatchObject({ synthesis: "raw", passed: false });
  });

  it("maps a 404 to AI_SESSION_NOT_FOUND", async () => {
    mockFetchOnce({ ok: false, status: 404, json: async () => ({}) });
    await expect(createAiClient(config).getSession("nope")).rejects.toMatchObject({ code: "AI_SESSION_NOT_FOUND" });
  });

  it("maps a network failure to AI_UNREACHABLE", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    await expect(createAiClient(config).getSession("s1")).rejects.toMatchObject({ code: "AI_UNREACHABLE" });
  });

  it("rejects an unknown status value", async () => {
    mockFetchOnce({ ok: true, status: 200, json: async () => ({ ok: true, status: "weird", stage: "x" }) });
    await expect(createAiClient(config).getSession("s1")).rejects.toMatchObject({ code: "AI_UPSTREAM_ERROR" });
  });
});
