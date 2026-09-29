import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getApiKey, setApiKey, apiFetch } from "./api";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api key storage", () => {
  it("returns null when no key is stored", () => {
    expect(getApiKey()).toBeNull();
  });

  it("stores and retrieves a key", () => {
    setApiKey("my-key");
    expect(getApiKey()).toBe("my-key");
  });
});

describe("apiFetch", () => {
  it("attaches the stored key as X-API-Key", async () => {
    setApiKey("my-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/opportunities");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-API-Key"]).toBe("my-key");
  });

  it("clears the stored key on a 401 response", async () => {
    setApiKey("my-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await apiFetch("/opportunities");

    expect(getApiKey()).toBeNull();
  });
});
