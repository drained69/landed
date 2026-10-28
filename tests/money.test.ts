import { describe, expect, it } from "vitest";
import {
  applyRate, decimalsFor, formatMinor, majorToMinor, minorToMajor,
  parseAmountToMinor, roundMinorTo,
} from "@/lib/money";

describe("integer minor-unit money", () => {
  it("parses plain and grouped decimals without floating point drift", () => {
    expect(parseAmountToMinor("300")).toBe(30_000);
    expect(parseAmountToMinor("300.00")).toBe(30_000);
    expect(parseAmountToMinor("1,234.56")).toBe(123_456);
    expect(parseAmountToMinor("1.234,56")).toBe(123_456);
    expect(parseAmountToMinor("  $12.30 ")).toBe(1_230);
  });

  it("treats a comma as a decimal separator when it matches the currency precision", () => {
    expect(parseAmountToMinor("12,34")).toBe(1_234);
    expect(parseAmountToMinor("1,234")).toBe(123_400);
  });

  it("honours zero-decimal currencies", () => {
    expect(decimalsFor("JPY")).toBe(0);
    expect(parseAmountToMinor("1200", "JPY")).toBe(1_200);
    expect(parseAmountToMinor("1200.49", "JPY")).toBe(1_200);
    expect(parseAmountToMinor("1200.50", "JPY")).toBe(1_200);
  });

  it("preserves negative amounts for refunds and reversals", () => {
    expect(parseAmountToMinor("-12.34")).toBe(-1_234);
  });

  it("rejects empty, non-numeric, and unsafe input", () => {
    expect(() => parseAmountToMinor("")).toThrow();
    expect(() => parseAmountToMinor("abc")).toThrow();
    expect(() => parseAmountToMinor("99999999999999999999")).toThrow(/too large/i);
  });

  it("round-trips major and minor units", () => {
    expect(majorToMinor(minorToMajor(123_456))).toBe(123_456);
  });

  it("formats negatives with a real minus sign, not a lost sign", () => {
    expect(formatMinor(123_456)).toBe("$1,234.56");
    expect(formatMinor(-1_234)).toBe("−$12.34");
  });

  it("rounds down to a five-unit boundary deterministically", () => {
    expect(roundMinorTo(15_099, 5)).toBe(15_000);
    expect(roundMinorTo(15_000, 5)).toBe(15_000);
  });

  it("applies a rate string with integer rounding", () => {
    expect(applyRate(10_000, "1.25")).toBe(12_500);
    expect(applyRate(10_001, "0.5")).toBe(5_001);
  });
});
