import { describe, expect, it } from "vitest";
import { rankRoutes } from "@/server/engine/routes";
import type { RouteQuoteInput, ValidatedMemory } from "@/lib/types";

const AS_OF = new Date("2026-10-01T12:00:00.000Z");

function quote(overrides: Partial<RouteQuoteInput> = {}): RouteQuoteInput {
  return {
    quoteId: "q-a",
    routeId: "r-a",
    routeName: "RemitOne",
    providerOrMethod: "RemitOne",
    originCurrency: "USD",
    destinationCurrency: "USD",
    payoutMethod: "bank_deposit",
    sendAmountMinor: 30_000,
    feeMinor: 300,
    networkFeeMinor: 0,
    exchangeRate: "1",
    expectedReceivedMinor: 29_700,
    estimatedDeliveryHours: 4,
    source: "user_entered",
    evidenceQuality: "user_confirmed",
    quotedAt: AS_OF.toISOString(),
    expiresAt: null,
    isSynthetic: false,
    reliability: { score: 0.5, sampleSize: 0, source: "none" },
    ...overrides,
  };
}

function memory(rule: ValidatedMemory["rule"], confidence = 0.8, matchSummary = "Prior outcome"): ValidatedMemory {
  return {
    id: "mem-route",
    blobId: "blob-route",
    category: "route_intelligence",
    summary: matchSummary,
    lesson: matchSummary,
    confidence,
    verificationStatus: "verified",
    writeStatus: "confirmed",
    source: "walrus",
    createdAt: AS_OF.toISOString(),
    rule,
  };
}

describe("route ranking", () => {
  it("prefers the route with the highest realized recipient amount when all else is equal", () => {
    const result = rankRoutes(
      [
        quote({ quoteId: "q-a", routeId: "r-a", routeName: "RemitOne", expectedReceivedMinor: 29_900 }),
        quote({ quoteId: "q-b", routeId: "r-b", routeName: "FastRemit", expectedReceivedMinor: 29_500 }),
      ],
      [],
      { preference: "balanced" },
      AS_OF,
    );
    expect(result.best?.quote.routeName).toBe("RemitOne");
    expect(result.quotes[0].rank).toBe(1);
  });

  it("demotes a route when a remembered payout deduction is recalled", () => {
    const quotes = [
      quote({ quoteId: "q-a", routeId: "r-a", routeName: "FastRemit", feeMinor: 300, expectedReceivedMinor: 29_900 }),
      quote({ quoteId: "q-b", routeId: "r-b", routeName: "RemitOne", feeMinor: 300, expectedReceivedMinor: 29_700 }),
    ];
    const baseline = rankRoutes(quotes, [], { preference: "balanced" }, AS_OF);
    expect(baseline.best?.quote.routeName).toBe("FastRemit");

    const informed = rankRoutes(
      quotes,
      [memory({ kind: "PAYOUT_DEDUCTION", match: "FastRemit", observedPercent: 0.15 })],
      { preference: "balanced" },
      AS_OF,
    );
    expect(informed.best?.quote.routeName).toBe("RemitOne");
    const fast = informed.quotes.find((q) => q.quote.routeName === "FastRemit");
    expect(fast?.adjustments.some((a) => a.memoryId === "mem-route")).toBe(true);
    expect(fast?.expectedReceivedMinor).toBeLessThan(27_000);
  });

  it("excludes expired quotes instead of silently using them", () => {
    const result = rankRoutes(
      [quote({ expiresAt: new Date("2026-09-01T00:00:00.000Z").toISOString() })],
      [],
      { preference: "balanced" },
      AS_OF,
    );
    expect(result.best).toBeNull();
    expect(result.excluded).toHaveLength(1);
    expect(result.notes.join(" ")).toMatch(/expired/i);
  });

  it("refuses to rank incompatible currency corridors", () => {
    const result = rankRoutes(
      [
        quote({ quoteId: "q-a", originCurrency: "USD", destinationCurrency: "PHP" }),
        quote({ quoteId: "q-b", originCurrency: "USD", destinationCurrency: "MXN" }),
      ],
      [],
      { preference: "balanced" },
      AS_OF,
    );
    expect(result.best).toBeNull();
    expect(result.excluded).toHaveLength(2);
  });

  it("requires the same send amount before comparing fees", () => {
    const result = rankRoutes(
      [quote({ quoteId: "q-a", sendAmountMinor: 30_000 }), quote({ quoteId: "q-b", sendAmountMinor: 50_000 })],
      [],
      { preference: "lower_fees" },
      AS_OF,
    );
    expect(result.best).toBeNull();
    expect(result.notes.join(" ")).toMatch(/same send amount/i);
  });

  it("marks user-entered quotes as not live provider pricing", () => {
    const result = rankRoutes([quote()], [], { preference: "balanced" }, AS_OF);
    expect(result.notes.join(" ")).toMatch(/user-entered|demonstration/i);
  });
});
