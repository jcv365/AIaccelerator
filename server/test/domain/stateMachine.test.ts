import { describe, it, expect } from "vitest";
import { isValidTransition, validTransitionsFrom } from "../../src/domain/stateMachine.js";

describe("state machine", () => {
  it("allows DISCOVERED to QUALIFIED", () => {
    expect(isValidTransition("DISCOVERED", "QUALIFIED")).toBe(true);
  });

  it("allows DISCOVERED to REJECTED", () => {
    expect(isValidTransition("DISCOVERED", "REJECTED")).toBe(true);
  });

  it("rejects DISCOVERED to PROVEN directly", () => {
    expect(isValidTransition("DISCOVERED", "PROVEN")).toBe(false);
  });

  it("allows the full happy path QUALIFIED->HYPOTHESIS->EXPERIMENT->PROVING->PROVEN", () => {
    expect(isValidTransition("QUALIFIED", "HYPOTHESIS")).toBe(true);
    expect(isValidTransition("HYPOTHESIS", "EXPERIMENT")).toBe(true);
    expect(isValidTransition("EXPERIMENT", "PROVING")).toBe(true);
    expect(isValidTransition("PROVING", "PROVEN")).toBe(true);
  });

  it("allows DEFERRED back to QUALIFIED", () => {
    expect(isValidTransition("DEFERRED", "QUALIFIED")).toBe(true);
  });

  it("treats PROVEN, REJECTED, and NO_AI as terminal", () => {
    expect(validTransitionsFrom("PROVEN")).toEqual([]);
    expect(validTransitionsFrom("REJECTED")).toEqual([]);
    expect(validTransitionsFrom("NO_AI")).toEqual([]);
  });

  it("returns the exact valid-transitions list for QUALIFIED", () => {
    expect(validTransitionsFrom("QUALIFIED")).toEqual(["HYPOTHESIS", "NO_AI", "REJECTED", "DEFERRED"]);
  });
});
