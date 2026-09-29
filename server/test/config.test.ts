import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("throws a clear error when DATABASE_URL is missing", () => {
    expect(() => loadConfig({ PORT: "4000" })).toThrowError(
      "Missing required environment variable: DATABASE_URL"
    );
  });

  it("throws a clear error when PORT is missing", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://u:p@h:5432/d" })
    ).toThrowError("Missing required environment variable: PORT");
  });

  it("throws a clear error when ADMIN_USERNAME is missing", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://u:p@h:5432/d", PORT: "4000", ADMIN_PASSWORD_HASH: "h", AUTH_TOKEN_SECRET: "s" })
    ).toThrowError("Missing required environment variable: ADMIN_USERNAME");
  });

  it("throws a clear error when ADMIN_PASSWORD_HASH is missing", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://u:p@h:5432/d", PORT: "4000", ADMIN_USERNAME: "admin", AUTH_TOKEN_SECRET: "s" })
    ).toThrowError("Missing required environment variable: ADMIN_PASSWORD_HASH");
  });

  it("throws a clear error when AUTH_TOKEN_SECRET is missing", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://u:p@h:5432/d", PORT: "4000", ADMIN_USERNAME: "admin", ADMIN_PASSWORD_HASH: "h" })
    ).toThrowError("Missing required environment variable: AUTH_TOKEN_SECRET");
  });

  it("returns a parsed config when all required vars are present", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://u:p@h:5432/d",
      PORT: "4000",
      NODE_ENV: "test",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD_HASH: "hash",
      AUTH_TOKEN_SECRET: "secret",
    });

    expect(config).toEqual({
      databaseUrl: "postgres://u:p@h:5432/d",
      port: 4000,
      nodeEnv: "test",
      adminUsername: "admin",
      adminPasswordHash: "hash",
      authTokenSecret: "secret",
    });
  });

  it("defaults nodeEnv to development when unset", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://u:p@h:5432/d",
      PORT: "4000",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD_HASH: "hash",
      AUTH_TOKEN_SECRET: "secret",
    });

    expect(config.nodeEnv).toBe("development");
  });

  it("throws a clear error when PORT is not numeric", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://u:p@h:5432/d", PORT: "abc" })
    ).toThrowError(/Invalid PORT/);
  });

  it("throws a clear error when PORT is out of range", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://u:p@h:5432/d", PORT: "70000" })
    ).toThrowError(/Invalid PORT/);
  });

  it("leaves councilBaseUrl and councilApiKey undefined when unset", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://u:p@h:5432/d",
      PORT: "4000",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD_HASH: "hash",
      AUTH_TOKEN_SECRET: "secret",
    });

    expect(config.councilBaseUrl).toBeUndefined();
    expect(config.councilApiKey).toBeUndefined();
  });

  it("reads councilBaseUrl and councilApiKey when set", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://u:p@h:5432/d",
      PORT: "4000",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD_HASH: "hash",
      AUTH_TOKEN_SECRET: "secret",
      COUNCIL_BASE_URL: "http://192.168.1.195:8010",
      COUNCIL_API_KEY: "secret",
    });

    expect(config.councilBaseUrl).toBe("http://192.168.1.195:8010");
    expect(config.councilApiKey).toBe("secret");
  });
});
