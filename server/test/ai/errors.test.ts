import { describe, it, expect } from "vitest";
import { AiClientError } from "../../src/ai/errors.js";

describe("AiClientError", () => {
  it("carries a code and message and is a real Error", () => {
    const err = new AiClientError("AI_BUSY", "Conclave is busy");

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("AI_BUSY");
    expect(err.message).toBe("Conclave is busy");
    expect(err.name).toBe("AiClientError");
  });
});
