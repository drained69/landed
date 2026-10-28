import { describe, expect, it } from "vitest";
import { convertToMinor, type SourcedRate } from "@/server/services/rates";

function rate(value: string): SourcedRate {
  return { symbol: "SUI", basePair: "USD", value, source: "test", timestamp: "2026-10-28T00:00:00.000Z", fetchedVia: "tatum-data-api" };
}

describe("sourced rate conversion", () => {
  it("converts SUI base units (9 decimals) to USD cents without floats", () => {
    // 2.5 SUI at $3.4567 = $8.64175 → 864 cents
    expect(convertToMinor(2_500_000_000n, 9, rate("3.4567"))).toBe(864);
  });

  it("rounds half up at the cent", () => {
    // 1 unit at 0.005 → 0.5 cent → 1
    expect(convertToMinor(1n, 0, rate("0.005"))).toBe(1);
    expect(convertToMinor(1n, 0, rate("0.0049"))).toBe(0);
  });

  it("handles 2-decimal account balances and integer rates", () => {
    // 1,234.56 USDC at 1 → $1,234.56
    expect(convertToMinor(123_456n, 2, rate("1"))).toBe(123_456);
    // Sui gas: 1,997,880 MIST at $3.20 → $0.0064 → 1 cent
    expect(convertToMinor(1_997_880n, 9, rate("3.20"))).toBe(1);
  });

  it("keeps the sign for negative balance changes", () => {
    expect(convertToMinor(-1_000_000_000n, 9, rate("2.00"))).toBe(-200);
  });
});
