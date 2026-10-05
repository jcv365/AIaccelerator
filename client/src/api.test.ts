import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getToken, setToken, clearToken, login, apiFetch } from "./api";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("token storage", () => {
  it("returns null when no token is stored", () => {
    expect(getToken()).toBeNull();
  });

  it("stores and retrieves a token", () => {
    setToken("my-token");
    expect(getToken()).toBe("my-token");
  });

  it("clears a stored token", () => {
    setToken("my-token");
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe("login", () => {
  it("stores the token and returns true on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "issued-token" }) })
    );

    const result = await login("admin", "correct-password");

    expect(result).toBe(true);
    expect(getToken()).toBe("issued-token");
  });

  it("returns false and stores nothing on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const result = await login("admin", "wrong");

    expect(result).toBe(false);
    expect(getToken()).toBeNull();
  });

  it("returns false and stores nothing when fetch rejects (server unreachable)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const result = await login("admin", "correct-password");

    expect(result).toBe(false);
    expect(getToken()).toBeNull();
  });

  it("returns false when the response body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("invalid json");
        },
      })
    );

    const result = await login("admin", "correct-password");

    expect(result).toBe(false);
    expect(getToken()).toBeNull();
  });
});

describe("apiFetch", () => {
  it("attaches the stored token as a Bearer Authorization header", async () => {
    setToken("my-token");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/opportunities");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer my-token");
  });

  it("clears the stored token on a 401 response", async () => {
    setToken("my-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await apiFetch("/opportunities");

    expect(getToken()).toBeNull();
  });

  describe("custom headers", () => {
    async function sentHeaders(headers: HeadersInit): Promise<Headers> {
      setToken("my-token");
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);
      await apiFetch("/opportunities", { method: "POST", headers });
      return new Headers(fetchMock.mock.calls[0][1].headers);
    }

    it("keeps custom headers given as a plain object", async () => {
      const sent = await sentHeaders({ "Content-Type": "application/json" });
      expect(sent.get("content-type")).toBe("application/json");
      expect(sent.get("authorization")).toBe("Bearer my-token");
    });

    it("keeps custom headers given as a Headers instance (previously silently dropped)", async () => {
      const sent = await sentHeaders(new Headers({ "Content-Type": "application/json", "X-Request-Source": "test" }));
      expect(sent.get("content-type")).toBe("application/json");
      expect(sent.get("x-request-source")).toBe("test");
      expect(sent.get("authorization")).toBe("Bearer my-token");
    });

    it("keeps custom headers given as an array of pairs", async () => {
      const sent = await sentHeaders([["X-Request-Source", "test"]]);
      expect(sent.get("x-request-source")).toBe("test");
      expect(sent.get("authorization")).toBe("Bearer my-token");
    });

    it("never lets a caller-supplied Authorization header replace the stored token", async () => {
      const sent = await sentHeaders(new Headers({ Authorization: "Bearer attacker-token" }));
      expect(sent.get("authorization")).toBe("Bearer my-token");
    });
  });
});
