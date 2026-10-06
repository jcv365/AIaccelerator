import { describe, it, expect } from "vitest";
import { buildAllowedNumbers, extractNumberTokens, isGroundedNumber } from "../../src/reporting/numbers.js";

describe("extractNumberTokens", () => {
  it("finds plain numbers, thousands separators, ranges, percentages, decimals and money", () => {
    const tokens = extractNumberTokens("A fleet of 700 vessels, 6,000+ product codes, 50-55% utilisation, $5 million, 12.5% growth");
    expect(tokens).toEqual(["700", "6000", "50", "55%", "$5million", "12.5%"]);
  });

  it("normalises case, spaces and separators so the same figure always compares equal", () => {
    expect(extractNumberTokens("R 20 Million")).toEqual(extractNumberTokens("r20million"));
    expect(extractNumberTokens("1,200")).toEqual(["1200"]);
  });

  it("returns nothing for text without digits", () => {
    expect(extractNumberTokens("No figures here at all")).toEqual([]);
  });
});

describe("isGroundedNumber", () => {
  const allowed = buildAllowedNumbers(["Maersk operates 700 vessels", "FTA utilisation of 50-55%", "founded in 1904"]);

  it("accepts a number that appears in the saved facts", () => {
    expect(isGroundedNumber("700", allowed)).toBe(true);
    expect(isGroundedNumber("55%", allowed)).toBe(true);
    expect(isGroundedNumber("1904", allowed)).toBe(true);
  });

  it("accepts small whole numbers used for counts, ordinals and the 14-day proof of value", () => {
    for (const n of ["1", "3", "14", "20"]) expect(isGroundedNumber(n, allowed), n).toBe(true);
  });

  it("rejects a figure that is not in the facts (an invented number)", () => {
    expect(isGroundedNumber("30%", allowed)).toBe(false);
    expect(isGroundedNumber("$20million", allowed)).toBe(false);
    expect(isGroundedNumber("850", allowed)).toBe(false);
  });

  it("rejects small numbers when they carry a percent, currency or magnitude (those are claims, not counts)", () => {
    expect(isGroundedNumber("5%", allowed)).toBe(false);
    expect(isGroundedNumber("$5million", allowed)).toBe(false);
    expect(isGroundedNumber("2m", allowed)).toBe(false);
  });

  it("rejects decimals that are not in the facts", () => {
    expect(isGroundedNumber("2.5", allowed)).toBe(false);
  });
});

describe("buildAllowedNumbers", () => {
  it("collects every figure from every string, including extra structural numbers", () => {
    const allowed = buildAllowedNumbers(["10 opportunities", "up to 6,000 codes"], ["48"]);
    expect(allowed.has("10")).toBe(true);
    expect(allowed.has("6000")).toBe(true);
    expect(allowed.has("48")).toBe(true);
  });
});
