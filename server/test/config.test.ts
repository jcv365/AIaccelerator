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

  it("returns a parsed config when all required vars are present", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://u:p@h:5432/d",
      PORT: "4000",
      NODE_ENV: "test",
    });

    expect(config).toEqual({
      databaseUrl: "postgres://u:p@h:5432/d",
      port: 4000,
      nodeEnv: "test",
    });
  });

  it("defaults nodeEnv to development when unset", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://u:p@h:5432/d",
      PORT: "4000",
    });

    expect(config.nodeEnv).toBe("development");
  });
});
