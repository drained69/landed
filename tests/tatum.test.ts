import { describe, expect, it } from "vitest";
import { normalizeCoinType } from "@/server/services/tatum";

describe("normalizeCoinType", () => {
  it("shortens the zero-padded addresses Sui GraphQL returns", () => {
    expect(normalizeCoinType("0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI")).toBe("0x2::sui::SUI");
  });

  it("leaves full-length package addresses intact", () => {
    const usdc = "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN";
    expect(normalizeCoinType(usdc)).toBe(usdc);
  });
});
