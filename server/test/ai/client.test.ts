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
});
