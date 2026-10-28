import { describe, expect, it } from "vitest";
import { checkPurchase, computeSpendWatch, detectRecurring, type SpendTransaction } from "@/server/engine/spending";
import type { MemoryRule, ValidatedMemory } from "@/lib/types";

const AS_OF = new Date("2026-11-20T12:00:00.000Z");
const DAY = 86_400_000;

let seq = 0;
function tx(amountMinor: number, daysAgo: number, merchant: string, category: string, extra: Partial<SpendTransaction> = {}): SpendTransaction {
  seq += 1;
  return {
    id: `tx-${seq}`, amountMinor, currency: "USD", direction: "out", category, merchant,
    timestamp: new Date(AS_OF.getTime() - daysAgo * DAY), status: "posted", ...extra,
  };
}

function memory(rule: MemoryRule, createdAt = "2026-09-01T00:00:00.000Z"): ValidatedMemory {
  return {
    id: `mem-${rule.kind}`, blobId: null, category: "preference", summary: `rule ${rule.kind}`, lesson: "",
    confidence: 0.85, verificationStatus: "user_confirmed", writeStatus: "blocked", source: "local_rehearsal",
    createdAt, rule,
  };
}

const streaming = [tx(1800, 95, "Streaming bundle", "subscriptions"), tx(1800, 65, "Streaming bundle", "subscriptions"), tx(1800, 35, "Streaming bundle", "subscriptions"), tx(2199, 5, "Streaming bundle", "subscriptions")];
const groceries = Array.from({ length: 10 }, (_, i) => tx([9800, 11250, 8600, 13400, 10200, 9600, 12100, 8900, 11000, 10500][i], 2 + i * 7, i % 2 ? "Corner Grocer" : "Green Market", "food"));
const dining = [tx(3000, 2, "Local Kitchen", "dining"), tx(4500, 8, "Local Kitchen", "dining"), tx(5000, 14, "Local Kitchen", "dining"), tx(4000, 40, "Local Kitchen", "dining"), tx(5000, 70, "Local Kitchen", "dining")];
const rent = [tx(145000, 17, "Landlord", "housing"), tx(145000, 48, "Landlord", "housing"), tx(145000, 78, "Landlord", "housing")];

describe("recurring charge detection", () => {
  it("detects a fixed-price monthly subscription and its price change", () => {
    const found = detectRecurring({ asOf: AS_OF, currency: "USD", transactions: streaming, memories: [] });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ cadence: "monthly", usualAmountMinor: 1800, latestAmountMinor: 2199, changeMinor: 399 });
  });

  it("does not mistake variable grocery spending for a subscription", () => {
    const found = detectRecurring({ asOf: AS_OF, currency: "USD", transactions: groceries, memories: [] });
    expect(found).toHaveLength(0);
  });

  it("ignores future, pending, incoming, and other-currency rows", () => {
    const noisy = [
      ...streaming,
      tx(1800, -10, "Streaming bundle", "subscriptions"),
      tx(1800, 3, "Streaming bundle", "subscriptions", { status: "pending" }),
      tx(1800, 4, "Streaming bundle", "subscriptions", { direction: "in" }),
      tx(1800, 6, "Streaming bundle", "subscriptions", { currency: "EUR" }),
    ];
    const found = detectRecurring({ asOf: AS_OF, currency: "USD", transactions: noisy, memories: [] });
    expect(found[0].charges).toBe(4);
  });
});

describe("Spend Watch alerts are memory-driven", () => {
  const transactions = [...streaming, ...groceries, ...dining, ...rent];

  it("raises no alerts without memory, only proposals", () => {
    const result = computeSpendWatch({ asOf: AS_OF, currency: "USD", transactions, memories: [] });
    expect(result.alerts).toHaveLength(0);
    expect(result.proposals.map((p) => p.key)).toContain("sub:streaming bundle");
    expect(result.proposals[0].priority).toBe(3); // the price change ranks first
    expect(result.recurring.some((r) => r.category === "housing")).toBe(false);
  });

  it("flags a charge above the approved price and names the memory", () => {
    const watch = memory({ kind: "SUBSCRIPTION_WATCH", merchant: "Streaming Bundle", approvedAmountMinor: 1800, currency: "USD", tolerancePercent: 5 });
    const result = computeSpendWatch({ asOf: AS_OF, currency: "USD", transactions, memories: [watch] });
    const alert = result.alerts.find((a) => a.kind === "subscription_above_approved");
    expect(alert?.memory.memoryId).toBe(watch.id);
    expect(alert?.amountMinor).toBe(399);
    expect(result.proposals.some((p) => p.key === "sub:streaming bundle")).toBe(false);
  });

  it("stays quiet when the charge is within the approved tolerance", () => {
    const watch = memory({ kind: "SUBSCRIPTION_WATCH", merchant: "Streaming bundle", approvedAmountMinor: 2100, currency: "USD", tolerancePercent: 5 });
    const result = computeSpendWatch({ asOf: AS_OF, currency: "USD", transactions, memories: [watch] });
    expect(result.alerts).toHaveLength(0);
    expect(result.recurring[0].status).toBe("approved");
  });

  it("paces a category against a learned limit", () => {
    const limit = memory({ kind: "SPEND_LIMIT", category: "dining", monthlyLimitMinor: 12000, currency: "USD" });
    const result = computeSpendWatch({ asOf: AS_OF, currency: "USD", transactions, memories: [limit] });
    const pace = result.categories.find((c) => c.category === "dining")!;
    // Nov 1–20: 3000 + 4500 + 5000 = 12500 > 12000
    expect(pace.monthToDateMinor).toBe(12500);
    expect(pace.status).toBe("over_limit");
    expect(result.alerts.some((a) => a.kind === "category_over_limit" && a.memory.memoryId === limit.id)).toBe(true);
  });

  it("uses the newest rule when a limit was updated", () => {
    const older = { ...memory({ kind: "SPEND_LIMIT", category: "dining", monthlyLimitMinor: 12000, currency: "USD" }), id: "old" };
    const newer = { ...memory({ kind: "SPEND_LIMIT", category: "dining", monthlyLimitMinor: 20000, currency: "USD" }, "2026-11-01T00:00:00.000Z"), id: "new" };
    const result = computeSpendWatch({ asOf: AS_OF, currency: "USD", transactions, memories: [older, newer] });
    expect(result.categories.find((c) => c.category === "dining")?.limitMinor).toBe(20000);
  });
});

describe("purchase check", () => {
  it("answers no when a purchase breaks a remembered limit even if cash allows it", () => {
    const limit = memory({ kind: "SPEND_LIMIT", category: "dining", monthlyLimitMinor: 15000, currency: "USD" });
    const result = computeSpendWatch({ asOf: AS_OF, currency: "USD", transactions: dining, memories: [limit] });
    expect(checkPurchase(result, "dining", 2000)).toMatchObject({ fits: true, remainingAfterMinor: 500 });
    expect(checkPurchase(result, "dining", 6000)).toMatchObject({ fits: false, remainingAfterMinor: -3500 });
    expect(checkPurchase(result, "food", 1000)).toBeNull();
  });
});
