import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createAiClient } from "../../src/ai/client.js";

let server: http.Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function fakeCouncil(handler: (req: http.IncomingMessage, body: string) => { status: number; json: unknown }) {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { status, json } = handler(req, body);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

describe("AI client against a fake Council over real HTTP", () => {
  it("starts a session, then polls it from running to concluded", async () => {
    let polls = 0;
    const baseUrl = await fakeCouncil((req, body) => {
      expect(req.headers["x-api-key"]).toBe("k");
      if (req.method === "POST" && req.url === "/api/external/session/start") {
        expect(JSON.parse(body)).toMatchObject({ goal: "research Acme", web_research: true });
        return { status: 202, json: { ok: true, session_id: "s1" } };
      }
      if (req.method === "GET" && req.url === "/api/external/session/s1") {
        polls += 1;
        return polls === 1
          ? { status: 200, json: { ok: true, session_id: "s1", status: "running", stage: "proposals", round: 1, elapsed_seconds: 5, progress: { expected: ["A"], responded: [], missing: ["A"] }, result: null, error: null } }
          : { status: 200, json: { ok: true, session_id: "s1", status: "concluded", stage: "done", round: 1, elapsed_seconds: 60, progress: null, result: { synthesis: "{}", chairman: "Claude", attempts: 1, passed: true }, error: null } };
      }
      return { status: 404, json: { ok: false } };
    });
    const client = createAiClient({ baseUrl, apiKey: "k" });

    const { sessionId } = await client.startSession("research Acme", true);
    const first = await client.getSession(sessionId);
    const second = await client.getSession(sessionId);

    expect(first).toMatchObject({ status: "running", stage: "proposals" });
    expect(second).toMatchObject({ status: "concluded", result: { chairman: "Claude" } });
  });

  it("reports a busy Council as AI_BUSY", async () => {
    const baseUrl = await fakeCouncil(() => ({ status: 409, json: { ok: false, error: { kind: "busy" } } }));
    await expect(createAiClient({ baseUrl, apiKey: "k" }).startSession("g")).rejects.toMatchObject({ code: "AI_BUSY" });
  });
});
