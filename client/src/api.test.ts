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
});
