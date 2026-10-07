import { describe, it, expect } from "vitest";
import { AiClientError, aiErrorStatus } from "../../src/ai/errors.js";

describe("AI_SESSION_NOT_FOUND", () => {
  it("is a valid client error code mapped to HTTP 404", () => {
    const err = new AiClientError("AI_SESSION_NOT_FOUND", "gone");
    expect(err.code).toBe("AI_SESSION_NOT_FOUND");
    expect(aiErrorStatus("AI_SESSION_NOT_FOUND")).toBe(404);
  });
});
