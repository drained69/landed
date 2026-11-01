import { describe, expect, it } from "vitest";
import { decide } from "@/server/engine/decision";
import type { DecisionInputSnapshot, RouteQuoteInput, ValidatedMemory } from "@/lib/types";

const asOf = "2026-10-01T12:00:00.000Z";
const quote: RouteQuoteInput = {
  quoteId: "q", routeId: "r", routeName: "Route", providerOrMethod: "Route",
  originCurrency: "USD", destinationCurrency: "JPY", payoutMethod: "bank_deposit",
  sendAmountMinor: 30000, feeMinor: 300, networkFeeMinor: 0, exchangeRate: "150",
  expectedReceivedMinor: 44550, estimatedDeliveryHours: 4, source: "user_entered",
  evidenceQuality: "user_reported", quotedAt: asOf, expiresAt: null, isSynthetic: false,
  reliability: { score: 0.5, sampleSize: 0, source: "none" },
};
function snapshot(overrides: Partial<DecisionInputSnapshot> = {}): DecisionInputSnapshot {
  return {
    asOf, currency: "USD", requestedAmountMinor: 30000, decisionType: "send", sourceAccountId: null,
    destinationLabel: "Sister", destinationCurrency: "JPY", routeQuotes: [quote], includeExpectedIncome: false,
    accounts: [{ id: "a", name: "Checking", balanceMinor: 20000, currency: "USD", isLiquid: true, includeInSafeToMove: true, verificationStatus: "user_confirmed", balanceSource: "manual" }],
    commitments: [], savingsGoals: [], expectedIncome: [{ id: "i", label: "payday", amountMinor: 50000, currency: "USD", expectedDate: "2026-10-10T12:00:00.000Z", reliability: 1 }],
    safetyBufferMinor: 0, riskPosture: "balanced", cashFlow: { monthlyIncomeMinor: 0, monthlyExpenseMinor: 0, dailyVariableSpendMinor: 0, monthsObserved: 1 }, previousShortfalls: 0, memoryCutoff: asOf, engineVersion: "test", ...overrides,
  };
}
const cap: ValidatedMemory = { id: "cap", blobId: null, category: "preference", summary: "Cap transfers", lesson: "Cap transfers", confidence: 1, verificationStatus: "user_confirmed", writeStatus: "pending", source: "local", createdAt: asOf, rule: { kind: "AMOUNT_CAP", capPercentOfSafe: 0.5 } };

describe("recommendation integrity", () => {
  it("does not promise a second payment when both payments would exceed available funds", () => {
    const result = decide(snapshot(), [cap]);
    expect(result.action.amountMinor).toBe(10000);
    expect(result.action.split).toBeNull();
  });
  it("does not present an unrelated cross-currency quote as the result of a reduced amount", () => {
    const result = decide(snapshot(), [cap]);
    expect(result.predicted.expectedReceivedMinor).toBeNull();
    expect(result.predicted.expectedFeeMinor).toBeNull();
    expect(result.action.routeId).toBeNull();
    expect(result.action.rationale).toMatch(/different amount/i);
  });
  it("preserves a matching quote and its destination amount", () => {
    const result = decide(snapshot({ accounts: [{ ...snapshot().accounts[0], balanceMinor: 50000 }] }), []);
    expect(result.action.amountMinor).toBe(30000);
    expect(result.predicted.expectedReceivedMinor).toBe(44550);
    expect(result.action.routeId).toBe("r");
  });
  it("excludes inactive commitments and explicitly excluded accounts", () => {
    const result = decide(snapshot({ accounts: [{ ...snapshot().accounts[0], includeInSafeToMove: false }], commitments: [{ id: "c", name: "Paid", amountMinor: 10000, currency: "USD", dueDate: asOf, priority: "essential", recurrence: "none", status: "paid" }] }), []);
    expect(result.cashflow.safeToMoveMinor).toBe(0);
    expect(result.cashflow.essentialCommitmentsMinor).toBe(0);
  });
});
