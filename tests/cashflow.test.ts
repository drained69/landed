import { describe, expect, it } from "vitest";
import { computeCashFlow, evaluateTransfer, type CashFlowInput } from "@/server/engine/cashflow";
import type { ValidatedMemory } from "@/lib/types";

const AS_OF = new Date("2026-10-01T12:00:00.000Z");

function baseInput(overrides: Partial<CashFlowInput> = {}): CashFlowInput {
  return {
    asOf: AS_OF,
    currency: "USD",
    accounts: [
      {
        id: "checking", name: "Checking", balanceMinor: 452_000, currency: "USD",
        isLiquid: true, verificationStatus: "user_confirmed", balanceSource: "self_reported",
      },
    ],
    commitments: [
      {
        id: "rent", name: "Rent", amountMinor: 145_000, currency: "USD",
        dueDate: new Date("2026-10-11T00:00:00.000Z"), priority: "essential",
        recurrence: "monthly", status: "upcoming",
      },
    ],
    savingsGoals: [],
    expectedIncome: [],
    safetyBufferMinor: 10_000,
    includeExpectedIncome: false,
    dailyVariableSpendMinor: 5_000,
    previousShortfalls: 0,
    riskPosture: "balanced",
    memories: [],
    ...overrides,
  };
}

function memory(rule: ValidatedMemory["rule"], confidence = 0.8, overrides: Partial<ValidatedMemory> = {}): ValidatedMemory {
  return {
    id: `mem-${Math.random().toString(36).slice(2, 8)}`,
    blobId: "blob-test",
    category: "correction",
    summary: "Test lesson",
    lesson: "Test lesson",
    confidence,
    verificationStatus: "verified",
    writeStatus: "confirmed",
    source: "walrus",
    createdAt: AS_OF.toISOString(),
    rule,
    ...overrides,
  };
}

describe("cashflow safety", () => {
  it("protects the buffer, bills, and variable spend before calling money safe", () => {
    const result = computeCashFlow(baseInput());
    expect(result.clearedLiquidMinor).toBe(452_000);
    expect(result.safeToMoveMinor).toBeGreaterThan(0);
    expect(result.safeToMoveMinor).toBeLessThan(result.clearedLiquidMinor);
    expect(result.projectedMinBalanceMinor).toBeGreaterThanOrEqual(result.effectiveSafetyBufferMinor);
    expect(result.obligations.find((o) => o.name === "Rent")?.covered).toBe(true);
  });

  it("does not count expected income unless it is explicitly included", () => {
    const input = baseInput({
      includeExpectedIncome: false,
      expectedIncome: [{
        id: "salary", label: "Salary", amountMinor: 300_000, currency: "USD",
        expectedDate: new Date("2026-10-05T00:00:00.000Z"), reliability: 0.9,
      }],
    });
    const result = computeCashFlow(input);
    expect(result.expectedIncomeIncludedMinor).toBe(0);
    expect(result.expectedIncomeExcludedMinor).toBe(300_000);
  });

  it("applies a remembered AMOUNT_CAP to safe-to-move", () => {
    const base = computeCashFlow(baseInput());
    const capped = computeCashFlow(baseInput({
      memories: [memory({ kind: "AMOUNT_CAP", capPercentOfSafe: 0.5 })],
    }));
    expect(capped.safeToMoveMinor).toBeLessThanOrEqual(Math.ceil(base.safeToMoveMinor / 2 / 500) * 500);
    expect(capped.effects.some((e) => e.code === "AMOUNT_CAP")).toBe(true);
    expect(capped.appliedMemories).toHaveLength(1);
  });

  it("excludes uncertain expected income when a recalled rule says so, and reports it honestly", () => {
    const input = baseInput({
      includeExpectedIncome: true,
      expectedIncome: [{
        id: "salary", label: "Salary", amountMinor: 300_000, currency: "USD",
        expectedDate: new Date("2026-10-05T00:00:00.000Z"), reliability: 0.5,
      }],
      memories: [memory({ kind: "EXCLUDE_EXPECTED_INCOME", reliabilityThreshold: 0.7 })],
    });
    const result = computeCashFlow(input);
    expect(result.expectedIncomeIncludedMinor).toBe(0);
    expect(result.expectedIncomeExcludedMinor).toBe(300_000);
    expect(result.effects.some((e) => e.code === "EXCLUDE_EXPECTED_INCOME")).toBe(true);
  });

  it("reserves a commitment that a remembered rule flags", () => {
    const base = computeCashFlow(baseInput());
    const reserved = computeCashFlow(baseInput({
      memories: [memory({ kind: "RESERVE_COMMITMENT", match: "rent", daysBefore: 14, reservePercent: 1 })],
    }));
    expect(reserved.safeToMoveMinor).toBeLessThan(base.safeToMoveMinor);
    expect(reserved.effects.some((e) => e.code === "RESERVE_COMMITMENT")).toBe(true);
    expect(reserved.effects.find((e) => e.code === "RESERVE_COMMITMENT")?.memoryId).toBeTruthy();
  });

  it("never recommends more than the cleared liquid balance", () => {
    const input = baseInput({
      accounts: [{
        id: "checking", name: "Checking", balanceMinor: 20_000, currency: "USD",
        isLiquid: true, verificationStatus: "user_confirmed", balanceSource: "self_reported",
      }],
    });
    const result = computeCashFlow(input);
    expect(result.safeToMoveMinor).toBe(0);
  });

  it("counts a monthly obligation again inside the 45-day horizon instead of advancing by one day", () => {
    const result = computeCashFlow(baseInput());
    const rentEvents = result.timeline.filter((e) => e.label === "Rent" && e.kind === "commitment");
    expect(rentEvents.length).toBe(2);
    const gapDays = Math.round((rentEvents[1].date.getTime() - rentEvents[0].date.getTime()) / 86_400_000);
    expect(gapDays).toBeGreaterThanOrEqual(28);
    expect(gapDays).toBeLessThanOrEqual(31);
  });

  it("flags a transfer that would create a shortfall", () => {
    const input = baseInput();
    const safe = computeCashFlow(input).safeToMoveMinor;
    const evaluation = evaluateTransfer(input, safe + 100_000, AS_OF);
    expect(evaluation.shortfall).toBe(true);
    expect(evaluation.shortfallDate).not.toBeNull();
    expect(evaluation.affordableMinor).toBeLessThanOrEqual(safe);
  });
});
