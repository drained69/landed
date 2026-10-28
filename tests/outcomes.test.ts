import { describe, expect, it } from "vitest";
import { evaluateOutcome, extractLessons, parseRuleFromMemoryText } from "@/server/engine/outcomes";
import type { DecisionAction, PredictedOutcome, RouteQuoteInput } from "@/lib/types";

const action: DecisionAction = {
  kind: "send",
  amountMinor: 30_000,
  currency: "USD",
  timing: "today",
  headline: "Send $300 today",
  rationale: "Cash flow supports it.",
  riskLevel: "medium",
  adjustments: [],
};

const predicted: PredictedOutcome = {
  amountSentMinor: 30_000,
  currency: "USD",
  expectedFeeMinor: 500,
  expectedReceivedMinor: 29_500,
  expectedDeliveryHours: 4,
  projectedBufferAfterMinor: 20_000,
  projectedMinBalanceMinor: 20_000,
  obligationsCovered: [{ name: "Rent", amountMinor: 145_000, dueDate: "2026-10-11", covered: true }],
  shortfallRisk: 0.1,
};

const quote: RouteQuoteInput = {
  quoteId: "q-1",
  routeId: "r-1",
  routeName: "FastRemit",
  providerOrMethod: "FastRemit",
  originCurrency: "USD",
  destinationCurrency: "USD",
  payoutMethod: "bank_deposit",
  sendAmountMinor: 30_000,
  feeMinor: 500,
  networkFeeMinor: 0,
  exchangeRate: "1",
  expectedReceivedMinor: 29_500,
  estimatedDeliveryHours: 4,
  source: "provider_api",
  evidenceQuality: "user_confirmed",
  quotedAt: "2026-10-01T00:00:00.000Z",
  expiresAt: null,
  isSynthetic: false,
  reliability: { score: 0.5, sampleSize: 0, source: "none" },
};

describe("outcome intelligence", () => {
  it("marks a shortfall as missed and separates confirmed errors from hypotheses", () => {
    const result = evaluateOutcome(
      { predicted, action, quote, bufferTargetMinor: 10_000 },
      {
        amountSentMinor: 30_000,
        actualFeeMinor: 1_200,
        actualReceivedMinor: 27_000,
        deliveryHours: 12,
        bufferAfterMinor: -5_000,
        shortfallOccurred: true,
        billsCovered: false,
        notes: null,
      },
    );
    expect(result.status).toBe("missed");
    expect(result.shortfallOccurred).toBe(true);
    expect(result.errors.feeErrorMinor).toBe(700);
    expect(result.errors.receivedErrorMinor).toBe(-2_500);
    expect(result.confirmedCauses.length).toBeGreaterThanOrEqual(3);
    expect(result.hypotheses.length).toBeGreaterThan(0);
  });

  it("marks a fully consistent outcome as achieved", () => {
    const result = evaluateOutcome(
      { predicted, action, quote, bufferTargetMinor: 10_000 },
      {
        amountSentMinor: 30_000,
        actualFeeMinor: 500,
        actualReceivedMinor: 29_500,
        deliveryHours: 4,
        bufferAfterMinor: 20_000,
        shortfallOccurred: false,
        billsCovered: true,
        notes: null,
      },
    );
    expect(result.status).toBe("achieved");
    expect(result.objectiveAchieved).toBe(true);
  });

  it("returns inconclusive when no observed facts were supplied", () => {
    const result = evaluateOutcome(
      { predicted, action, quote, bufferTargetMinor: 10_000 },
      {
        amountSentMinor: 30_000,
        actualFeeMinor: null,
        actualReceivedMinor: null,
        deliveryHours: null,
        bufferAfterMinor: null,
        shortfallOccurred: null,
        billsCovered: null,
        notes: null,
      },
    );
    expect(result.status).toBe("inconclusive");
    expect(result.confirmedCauses).toHaveLength(0);
  });

  it("proposes typed, user-confirmable lessons with no automatic confirmation", () => {
    const evaluation = evaluateOutcome(
      { predicted, action, quote, bufferTargetMinor: 10_000 },
      {
        amountSentMinor: 30_000,
        actualFeeMinor: 1_200,
        actualReceivedMinor: 27_000,
        deliveryHours: 12,
        bufferAfterMinor: -5_000,
        shortfallOccurred: true,
        billsCovered: false,
        notes: null,
      },
    );
    const lessons = extractLessons({
      evaluation,
      context: { predicted, action, quote, bufferTargetMinor: 10_000 },
      observed: {
        amountSentMinor: 30_000,
        actualFeeMinor: 1_200,
        actualReceivedMinor: 27_000,
        deliveryHours: 12,
        bufferAfterMinor: -5_000,
        shortfallOccurred: true,
        billsCovered: false,
        notes: null,
      },
      corridor: "USD>USD",
      payoutMethod: "bank_deposit",
      routeName: "FastRemit",
      provider: "FastRemit",
      daysToObligation: 10,
      decisionId: "d-1",
      movementId: "m-1",
    });

    expect(lessons.length).toBeGreaterThanOrEqual(3);
    for (const lesson of lessons) {
      expect(lesson.verificationStatus).toBe("hypothesis");
      expect(lesson.rule).not.toBeNull();
      expect(lesson.causes.length).toBeGreaterThanOrEqual(0);
    }
    const rules = lessons.map((lesson) => lesson.rule!.kind);
    expect(rules).toContain("RESERVE_COMMITMENT");
    expect(rules).toContain("PAYOUT_DEDUCTION");
    expect(rules).toContain("ROUTE_PENALTY");
  });

  it("parses a typed rule back out of portable Walrus text", () => {
    const text = [
      "LANDED lesson [mem-123]",
      "category=correction",
      'rule: {"kind":"AMOUNT_CAP","capPercentOfSafe":0.5}',
      "scope: personal financial decision",
    ].join("\n");
    const rule = parseRuleFromMemoryText(text) as { kind: string; capPercentOfSafe: number };
    expect(rule.kind).toBe("AMOUNT_CAP");
    expect(rule.capPercentOfSafe).toBe(0.5);
  });

  it("does not invent a rule from text that has none", () => {
    expect(parseRuleFromMemoryText("LANDED lesson [x]\nlesson: be careful")).toBeNull();
  });
});
