import { describe, it, expect } from "vitest";
import { computeEvidenceScore, readQuality, recencyLevel } from "../../src/scoring/evidenceScore.js";
import { csvCell, toCsv } from "../../src/scoring/csv.js";
import { boundedString, clampNumber, extractJsonObject, pickEnum, stringList } from "../../src/scoring/aiJson.js";

const NOW = new Date("2026-10-06T12:00:00Z");
const high = { credibility: "HIGH", applicability: "HIGH", depth: "HIGH", relevance: "HIGH", rationale: "r" };
const low = { credibility: "LOW", applicability: "LOW", depth: "LOW", relevance: "LOW", rationale: "r" };

describe("computeEvidenceScore", () => {
  it("is null when no evidence has been quality-assessed (never a guessed number)", () => {
    expect(computeEvidenceScore([], NOW)).toBeNull();
    expect(computeEvidenceScore([{ quality: null, capturedAt: NOW }], NOW)).toBeNull();
  });

  it("scores fresh all-HIGH evidence at 100 and fresh all-LOW at 30", () => {
    expect(computeEvidenceScore([{ quality: high, capturedAt: NOW }], NOW)).toBe(100);
    expect(computeEvidenceScore([{ quality: low, capturedAt: NOW }], NOW)).toBe(30);
  });

  it("averages only the scored rows and ignores unscored ones", () => {
    const score = computeEvidenceScore(
      [
        { quality: high, capturedAt: NOW },
        { quality: low, capturedAt: NOW },
        { quality: null, capturedAt: NOW },
      ],
      NOW
    );
    expect(score).toBe(65);
  });

  it("blends the stored confidence in (70% quality, 30% confidence)", () => {
    expect(computeEvidenceScore([{ quality: high, confidence: 0, capturedAt: NOW }], NOW)).toBe(70);
  });

  it("discounts old evidence", () => {
    const old = new Date("2023-01-01T00:00:00Z");
    expect(computeEvidenceScore([{ quality: high, capturedAt: old }], NOW)).toBe(70);
  });

  it("ignores a quality blob with the wrong shape", () => {
    expect(computeEvidenceScore([{ quality: { credibility: "HIGH" }, capturedAt: NOW }], NOW)).toBeNull();
    expect(readQuality("nope")).toBeNull();
  });
});

describe("recencyLevel", () => {
  it("grades by age and treats a missing or invalid date as LOW", () => {
    expect(recencyLevel(new Date("2026-06-01"), NOW)).toBe("HIGH");
    expect(recencyLevel(new Date("2025-03-01"), NOW)).toBe("MEDIUM");
    expect(recencyLevel(new Date("2022-01-01"), NOW)).toBe("LOW");
    expect(recencyLevel(null, NOW)).toBe("LOW");
    expect(recencyLevel("not a date", NOW)).toBe("LOW");
  });
});

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a, "b"\nc')).toBe('"a, ""b""\nc"');
  });

  it.each(["=SUM(A1)", "+1", "-1", "@cmd", "\tx"])("neutralises a formula start: %j", (value) => {
    expect(csvCell(value).replace(/^"/, "").startsWith("'")).toBe(true);
  });

  it("leaves normal text alone and renders null as empty and dates as ISO", () => {
    expect(csvCell("Plain")).toBe("Plain");
    expect(csvCell(null)).toBe("");
    expect(csvCell(new Date("2026-10-06T00:00:00Z"))).toBe("2026-10-06T00:00:00.000Z");
  });

  it("joins rows with CRLF", () => {
    expect(toCsv(["A", "B"], [[1, "x"]])).toBe("A,B\r\n1,x\r\n");
  });
});

describe("aiJson", () => {
  it("extracts JSON from a fenced or chatty answer", () => {
    expect(extractJsonObject('Sure!\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("returns null for no object, broken JSON or an array", () => {
    expect(extractJsonObject("no json")).toBeNull();
    expect(extractJsonObject('{"a": ')).toBeNull();
    expect(extractJsonObject("[1,2]")).toBeNull();
  });

  it("clamps numbers and rejects non-numbers", () => {
    expect(clampNumber(5, 0, 1)).toBe(1);
    expect(clampNumber(-5, 0, 1)).toBe(0);
    expect(clampNumber("5", 0, 1)).toBeNull();
    expect(clampNumber(Number.NaN, 0, 1)).toBeNull();
  });

  it("accepts only listed enum values", () => {
    expect(pickEnum("HIGH", ["HIGH", "LOW"] as const)).toBe("HIGH");
    expect(pickEnum("high", ["HIGH", "LOW"] as const)).toBeNull();
  });

  it("bounds strings and lists", () => {
    expect(boundedString("  hi  ", 10)).toBe("hi");
    expect(boundedString("   ", 10)).toBeNull();
    expect(boundedString("abcdef", 3)).toBe("abc");
    expect(stringList(["a", "", 3, "b", "c"], 2, 10)).toEqual(["a", "b"]);
    expect(stringList("x", 2, 10)).toBeNull();
  });
});
