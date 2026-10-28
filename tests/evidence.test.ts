import { describe, expect, it } from "vitest";
import { assessMemory, nextConfidence, summarizeTrackRecord, CONFIDENCE_CEILING, CONFIDENCE_FLOOR } from "@/server/engine/evidence";
import type { EvaluationResult } from "@/server/engine/outcomes";

function evaluation(overrides: Omit<Partial<EvaluationResult>, "metric"> & { metric?: Partial<EvaluationResult["metric"]> } = {}): EvaluationResult {
  return {
    status: "achieved",
    objectiveAchieved: true,
    shortfallOccurred: false,
    errors: { feeErrorMinor: 0, receivedErrorMinor: 0, deliveryErrorHours: 0, bufferErrorMinor: 0, amountErrorMinor: null },
    confirmedCauses: [],
    hypotheses: [],
    ...overrides,
    metric: { feeWithinTolerance: true, receivedWithinTolerance: true, deliveredOnTime: true, bufferProtected: true, ...overrides.metric },
  };
}

describe("memory evidence", () => {
  it("a cash rule that kept the buffer intact held and gains confidence", () => {
    const a = assessMemory({ kind: "AMOUNT_CAP", capPercentOfSafe: 0.5 }, 0.78, evaluation());
    expect(a.verdict).toBe("held");
    expect(a.confidenceAfter).toBeGreaterThan(0.78);
  });

  it("a cash rule applied before a shortfall is contradicted and loses confidence", () => {
    const a = assessMemory({ kind: "BUFFER_FLOOR", amountMinor: 15000 }, 0.8, evaluation({ status: "missed", shortfallOccurred: true, metric: { bufferProtected: false } }));
    expect(a.verdict).toBe("contradicted");
    expect(a.confidenceAfter).toBeLessThan(0.8);
  });

  it("route rules are judged on delivered amount and time, not on the buffer", () => {
    const rule = { kind: "ROUTE_PREFERENCE" as const, match: "Northline", scoreBonus: 0.1 };
    expect(assessMemory(rule, 0.6, evaluation({ metric: { bufferProtected: false } })).verdict).toBe("held");
    expect(assessMemory(rule, 0.6, evaluation({ metric: { deliveredOnTime: false } })).verdict).toBe("contradicted");
    expect(assessMemory(rule, 0.6, evaluation({ metric: { receivedWithinTolerance: null, deliveredOnTime: null } })).verdict).toBe("inconclusive");
  });

  it("untested rule kinds stay inconclusive and keep their confidence", () => {
    const a = assessMemory({ kind: "SPEND_LIMIT", category: "dining", monthlyLimitMinor: 12000, currency: "USD" }, 0.85, evaluation());
    expect(a).toMatchObject({ verdict: "inconclusive", confidenceAfter: 0.85 });
  });

  it("confidence is bounded and never reaches certainty or zero", () => {
    let up = 0.5;
    let down = 0.5;
    for (let i = 0; i < 50; i++) {
      up = nextConfidence(up, "held");
      down = nextConfidence(down, "contradicted");
    }
    expect(up).toBeLessThanOrEqual(CONFIDENCE_CEILING);
    expect(down).toBeGreaterThanOrEqual(CONFIDENCE_FLOOR);
    expect(down).toBeGreaterThan(0);
  });

  it("flags a lesson for review only after it was contradicted and fell below the threshold", () => {
    expect(summarizeTrackRecord(["held", "held"], 0.9)).toMatchObject({ held: 2, holdRate: 1, needsReview: false });
    expect(summarizeTrackRecord(["held", "contradicted"], 0.45)).toMatchObject({ contradicted: 1, holdRate: 0.5, needsReview: true });
    expect(summarizeTrackRecord(["inconclusive"], 0.3)).toMatchObject({ holdRate: null, needsReview: false });
  });
});
