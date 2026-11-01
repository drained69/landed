import { addDays, addMonths, differenceInCalendarDays, isAfter, startOfDay } from "date-fns";
import type {
  Assumption, PredictedOutcome, ValidatedMemory,
} from "@/lib/types";
import { formatMinor, roundMinorTo } from "@/lib/money";
import { nextDueDate } from "@/lib/dates";

export interface CashFlowAccount {
  id: string;
  name: string;
  balanceMinor: number;
  currency: string;
  isLiquid: boolean;
  includeInSafeToMove?: boolean;
  verificationStatus: string;
  balanceSource: string;
}

export interface CashFlowCommitment {
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  dueDate: Date;
  priority: string;
  recurrence: string;
  status: string;
}

export interface CashFlowSavingsGoal {
  id: string;
  name: string;
  currentMinor: number;
  targetMinor: number;
  currency: string;
  monthlyContributionMinor: number;
  priority: string;
}

export interface ExpectedIncome {
  id: string;
  label: string;
  amountMinor: number;
  currency: string;
  expectedDate: Date;
  reliability: number;
}

export interface CashFlowInput {
  asOf: Date;
  currency: string;
  accounts: CashFlowAccount[];
  commitments: CashFlowCommitment[];
  savingsGoals: CashFlowSavingsGoal[];
  expectedIncome: ExpectedIncome[];
  safetyBufferMinor: number;
  includeExpectedIncome: boolean;
  dailyVariableSpendMinor: number;
  monthsObserved?: number;
  previousShortfalls: number;
  riskPosture: string;
  memories?: ValidatedMemory[];
}

interface TimelineEvent {
  date: Date;
  label: string;
  amountMinor: number; // positive = inflow, negative = outflow
  kind: "commitment" | "income" | "variable_spend" | "savings" | "transfer";
  obligationId?: string;
}

export interface CoveredObligation {
  name: string;
  amountMinor: number;
  dueDate: string;
  covered: boolean;
  projectedBalanceBefore: number;
}

export interface CashFlowResult {
  currency: string;
  asOf: string;
  horizonEnd: string;
  clearedLiquidMinor: number;
  unverifiedLiquidMinor: number;
  expectedIncomeIncludedMinor: number;
  expectedIncomeExcludedMinor: number;
  essentialCommitmentsMinor: number;
  reservedSavingsMinor: number;
  variableSpendReserveMinor: number;
  baseSafetyBufferMinor: number;
  effectiveSafetyBufferMinor: number;
  baseSafeToMoveMinor: number;
  safeToMoveMinor: number;
  projectedMinBalanceMinor: number;
  projectedMinDate: string | null;
  obligations: CoveredObligation[];
  assumptions: Assumption[];
  missingInputs: string[];
  confidence: number;
  appliedMemories: ValidatedMemory[];
  effects: { code: string; label: string; detail: string; memoryId: string }[];
  timeline: TimelineEvent[];
}

export interface TransferEvaluation {
  amountMinor: number;
  date: Date;
  projectedMinBalanceMinor: number;
  projectedMinDate: string | null;
  bufferAfterMinor: number;
  shortfall: boolean;
  shortfallDate: string | null;
  obligationsCovered: CoveredObligation[];
  affordableMinor: number;
  surplusAfterBufferMinor: number;
}

const HORIZON_DAYS = 45;
const VARIABLE_SPEND_DAYS = 14;

export function applyMemoryRules(input: CashFlowInput): {
  bufferMinor: number;
  reserveExtraMinor: number;
  includeIncome: boolean;
  capPercent: number | null;
  applied: ValidatedMemory[];
  effects: { code: string; label: string; detail: string; memoryId: string }[];
} {
  let bufferMinor = input.safetyBufferMinor;
  let reserveExtraMinor = 0;
  let includeIncome = input.includeExpectedIncome;
  let capPercent: number | null = null;
  const applied: ValidatedMemory[] = [];
  const effects: { code: string; label: string; detail: string; memoryId: string }[] = [];

  for (const memory of input.memories ?? []) {
    if (!memory.rule || memory.excluded || memory.supersededBy || !["verified", "user_confirmed"].includes(memory.verificationStatus)) continue;
    const rule = memory.rule;
    const weight = Math.max(0, Math.min(1, memory.confidence));
    switch (rule.kind) {
      case "BUFFER_FLOOR": {
        const proposed = Math.round(rule.amountMinor * Math.max(0.5, weight));
        if (proposed > bufferMinor) {
          bufferMinor = proposed;
          applied.push(memory);
          effects.push({
            code: rule.kind,
            label: `Buffer floor raised to ${formatMinor(proposed, input.currency)}`,
            detail: memory.summary,
            memoryId: memory.id,
          });
        }
        break;
      }
      case "EXCLUDE_EXPECTED_INCOME": {
        if (includeIncome && input.expectedIncome.some((i) => i.reliability < rule.reliabilityThreshold)) {
          includeIncome = false;
          applied.push(memory);
          effects.push({
            code: rule.kind,
            label: "Uncertain income excluded from cleared funds",
            detail: memory.summary,
            memoryId: memory.id,
          });
        }
        break;
      }
      case "RESERVE_COMMITMENT": {
        const match = input.commitments.find((c) =>
          c.status === "upcoming" && c.currency === input.currency && c.name.toLowerCase().includes(rule.match.toLowerCase()) &&
          differenceInCalendarDays(c.dueDate, input.asOf) <= rule.daysBefore &&
          differenceInCalendarDays(c.dueDate, input.asOf) >= 0,
        );
        if (match) {
          const reserve = Math.round(match.amountMinor * rule.reservePercent * weight);
          reserveExtraMinor += reserve;
          applied.push(memory);
          effects.push({
            code: rule.kind,
            label: `Extra ${(rule.reservePercent * 100).toFixed(0)}% ${rule.match} reserve`,
            detail: memory.summary,
            memoryId: memory.id,
          });
        }
        break;
      }
      case "AMOUNT_CAP": {
        const cap = Math.max(0, Math.min(1, rule.capPercentOfSafe));
        capPercent = capPercent === null ? cap : Math.min(capPercent, cap);
        applied.push(memory);
        effects.push({
          code: rule.kind,
          label: `Single-move cap at ${(cap * 100).toFixed(0)}% of safe-to-move`,
          detail: memory.summary,
          memoryId: memory.id,
        });
        break;
      }
      case "SPLIT_TRANSFER": {
        applied.push(memory);
        effects.push({
          code: rule.kind,
          label: "Split transfers when the full amount is risky",
          detail: memory.summary,
          memoryId: memory.id,
        });
        break;
      }
      default:
        break;
    }
  }

  return { bufferMinor, reserveExtraMinor, includeIncome, capPercent, applied, effects };
}

function buildTimeline(input: CashFlowInput, includeIncome: boolean): TimelineEvent[] {
  const horizon = addDays(input.asOf, HORIZON_DAYS);
  const events: TimelineEvent[] = [];

  for (const c of input.commitments) {
    if (c.status !== "upcoming" || c.currency !== input.currency) continue;
    if (c.priority === "discretionary") continue;
    let due = nextDueDate(c.dueDate, c.recurrence, startOfDay(input.asOf));
    while (!isAfter(due, horizon)) {
      events.push({
        date: due,
        label: c.name,
        amountMinor: -c.amountMinor,
        kind: "commitment",
        obligationId: c.id,
      });
      if (c.recurrence === "none") break;
      due = c.recurrence === "weekly"
        ? addDays(due, 7)
        : c.recurrence === "yearly"
          ? addMonths(due, 12)
          : addMonths(due, 1);
    }
  }

  for (const goal of input.savingsGoals) {
    if (goal.currency !== input.currency || goal.monthlyContributionMinor <= 0) continue;
    const first = addMonths(input.asOf, 1);
    if (!isAfter(first, horizon)) {
      events.push({
        date: first,
        label: `${goal.name} contribution`,
        amountMinor: -goal.monthlyContributionMinor,
        kind: "savings",
      });
    }
  }

  const variableDays = Math.min(VARIABLE_SPEND_DAYS, HORIZON_DAYS);
  if (input.dailyVariableSpendMinor > 0) {
    events.push({
      date: addDays(input.asOf, variableDays),
      label: `${variableDays} days of variable spending reserve`,
      amountMinor: -input.dailyVariableSpendMinor * variableDays,
      kind: "variable_spend",
    });
  }

  if (includeIncome) {
    for (const income of input.expectedIncome) {
      if (income.currency !== input.currency) continue;
      if (isAfter(income.expectedDate, horizon) || income.expectedDate < input.asOf) continue;
      // Expected income is discounted by reliability and a further 20% haircut.
      const weighted = Math.round(income.amountMinor * Math.max(0, Math.min(1, income.reliability)) * 0.8);
      if (weighted <= 0) continue;
      events.push({
        date: income.expectedDate,
        label: `${income.label} (expected, reliability ${(income.reliability * 100).toFixed(0)}%)`,
        amountMinor: weighted,
        kind: "income",
      });
    }
  }

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function simulate(
  input: CashFlowInput,
  includeIncome: boolean,
  startingMinor: number,
  extraOutflow?: { amountMinor: number; date: Date; label: string },
) {
  const events = buildTimeline(input, includeIncome);
  if (extraOutflow) {
    events.push({
      date: extraOutflow.date,
      label: extraOutflow.label,
      amountMinor: -extraOutflow.amountMinor,
      kind: "transfer",
    });
    events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  let balance = startingMinor;
  let minBalance = balance;
  let minDate: Date | null = null;
  let shortfallDate: Date | null = null;
  const obligations: CoveredObligation[] = [];

  for (const event of events) {
    if (event.kind === "commitment" && event.obligationId) {
      obligations.push({ name: event.label, amountMinor: -event.amountMinor, dueDate: event.date.toISOString(), covered: balance + event.amountMinor >= 0, projectedBalanceBefore: balance });
    }
    balance += event.amountMinor;
    if (event.kind !== "income" && balance < minBalance) {
      minBalance = balance;
      minDate = event.date;
    }
    if (balance < 0 && !shortfallDate) shortfallDate = event.date;
  }

  return { events, minBalance, minDate, shortfallDate, obligations, endBalance: balance };
}

export function computeCashFlow(input: CashFlowInput): CashFlowResult {
  const accounts = input.accounts.filter(
    (a) => a.currency === input.currency && a.isLiquid && a.includeInSafeToMove !== false,
  );
  const clearedLiquidMinor = accounts.reduce((sum, a) => sum + a.balanceMinor, 0);
  const unverifiedLiquidMinor = accounts
    .filter((a) => a.verificationStatus === "unverified")
    .reduce((sum, a) => sum + a.balanceMinor, 0);

  const memoryPlan = applyMemoryRules(input);
  const effectiveBuffer = memoryPlan.bufferMinor;
  const baseSim = simulate(input, false, clearedLiquidMinor);
  const fullSim = simulate(input, memoryPlan.includeIncome, clearedLiquidMinor);

  const rawSafe = Math.max(0, Math.min(clearedLiquidMinor, fullSim.minBalance - effectiveBuffer - memoryPlan.reserveExtraMinor));
  const baseSafe = Math.max(0, Math.min(clearedLiquidMinor, baseSim.minBalance - input.safetyBufferMinor));
  const cappedSafe = memoryPlan.capPercent === null ? rawSafe : Math.min(rawSafe, Math.round(rawSafe * memoryPlan.capPercent));
  const safeToMoveMinor = roundMinorTo(Math.max(0, cappedSafe), 5, input.currency);

  const essentialCommitmentsMinor = fullSim.events.filter((e) => e.kind === "commitment").reduce((sum, e) => sum - e.amountMinor, 0);
  const savingsMonthly = fullSim.events.filter((e) => e.kind === "savings").reduce((sum, e) => sum - e.amountMinor, 0);
  const expectedIncomeIncludedMinor = fullSim.events.filter((e) => e.kind === "income").reduce((sum, e) => sum + e.amountMinor, 0);
  const expectedIncomeExcludedMinor = input.expectedIncome
    .filter((i) => i.currency === input.currency && !memoryPlan.includeIncome && i.expectedDate >= input.asOf && i.expectedDate <= addDays(input.asOf, HORIZON_DAYS))
    .reduce((sum, i) => sum + i.amountMinor, 0);
  const obligations = fullSim.obligations;

  const assumptions: Assumption[] = [
    {
      key: "buffer",
      label: `Safety buffer ${formatMinor(effectiveBuffer, input.currency)}`,
      detail: "Protected from every recommendation. Set in Settings.",
      source: "user",
    },
    {
      key: "income",
      label: memoryPlan.includeIncome ? "Expected income included with a reliability haircut" : "Expected income excluded from cleared funds",
      detail: memoryPlan.includeIncome
        ? "Only reliability-weighted income is counted, and it is reduced by a further 20%."
        : "LANDED treats expected income as a forecast, not available money.",
      source: "estimate",
    },
    {
      key: "variable",
      label: `${VARIABLE_SPEND_DAYS} days of variable spending reserved`,
      detail: `Based on average recorded spending of ${formatMinor(input.dailyVariableSpendMinor, input.currency)} per day over the observation window.`,
      source: "database",
    },
    {
      key: "discretionary",
      label: "Discretionary commitments are not protected",
      detail: "Only essential and important obligations reduce safe-to-move.",
      source: "estimate",
    },
  ];

  if (memoryPlan.applied.length > 0) {
    assumptions.push({
      key: "memory",
      label: `${memoryPlan.applied.length} remembered lesson${memoryPlan.applied.length === 1 ? "" : "s"} applied`,
      detail: memoryPlan.effects.map((e) => e.label).join(" · "),
      source: "memory",
    });
  }

  const missingInputs: string[] = [];
  if (accounts.length === 0) missingInputs.push(`No liquid ${input.currency} account is available.`);
  if (input.commitments.length === 0) missingInputs.push("No upcoming commitments have been entered.");
  if (input.monthsObserved === 0) missingInputs.push("No transaction history is available for a variable-spending estimate.");
  if (unverifiedLiquidMinor > 0) missingInputs.push("Some balances are unverified and may be stale.");

  let confidence = 0.9;
  if (accounts.length === 0) confidence = 0.25;
  if (input.monthsObserved === 0) confidence -= 0.1;
  if (unverifiedLiquidMinor > 0) confidence -= 0.08;
  if (expectedIncomeExcludedMinor > 0) confidence -= 0.04;
  if (input.previousShortfalls > 0) confidence -= Math.min(0.12, input.previousShortfalls * 0.03);
  if (input.riskPosture === "cautious") confidence += 0.02;
  confidence = Math.max(0.3, Math.min(0.97, confidence));

  return {
    currency: input.currency,
    asOf: input.asOf.toISOString(),
    horizonEnd: addDays(input.asOf, HORIZON_DAYS).toISOString(),
    clearedLiquidMinor,
    unverifiedLiquidMinor,
    expectedIncomeIncludedMinor,
    expectedIncomeExcludedMinor,
    essentialCommitmentsMinor,
    reservedSavingsMinor: savingsMonthly,
    variableSpendReserveMinor: input.dailyVariableSpendMinor * VARIABLE_SPEND_DAYS,
    baseSafetyBufferMinor: input.safetyBufferMinor,
    effectiveSafetyBufferMinor: effectiveBuffer,
    baseSafeToMoveMinor: baseSafe,
    safeToMoveMinor,
    projectedMinBalanceMinor: fullSim.minBalance,
    projectedMinDate: fullSim.minDate?.toISOString() ?? null,
    obligations,
    assumptions,
    missingInputs,
    confidence,
    appliedMemories: memoryPlan.applied,
    effects: memoryPlan.effects,
    timeline: fullSim.events,
  };
}

export function evaluateTransfer(
  input: CashFlowInput,
  amountMinor: number,
  date: Date,
): TransferEvaluation {
  const accounts = input.accounts.filter(
    (a) => a.currency === input.currency && a.isLiquid && a.includeInSafeToMove !== false,
  );
  const cleared = accounts.reduce((sum, a) => sum + a.balanceMinor, 0);
  const memoryPlan = applyMemoryRules(input);
  const sim = simulate(input, memoryPlan.includeIncome, cleared, {
    amountMinor,
    date,
    label: "Proposed transfer",
  });
  const base = computeCashFlow(input);
  const bufferAfter = sim.minBalance - memoryPlan.bufferMinor - memoryPlan.reserveExtraMinor;
  const obligations = sim.obligations;

  return {
    amountMinor,
    date,
    projectedMinBalanceMinor: sim.minBalance,
    projectedMinDate: sim.minDate?.toISOString() ?? null,
    bufferAfterMinor: bufferAfter,
    shortfall: sim.shortfallDate !== null,
    shortfallDate: sim.shortfallDate?.toISOString() ?? null,
    obligationsCovered: obligations,
    affordableMinor: Math.min(amountMinor, base.safeToMoveMinor),
    surplusAfterBufferMinor: Math.max(0, sim.minBalance - memoryPlan.bufferMinor),
  };
}

/** Expected instrument-level result shown in the recommendation card. */
export function buildPrediction(params: {
  amountMinor: number;
  currency: string;
  feeMinor: number | null;
  receivedMinor: number | null;
  deliveryHours: number | null;
  evaluation: TransferEvaluation;
}): PredictedOutcome {
  return {
    amountSentMinor: params.amountMinor,
    currency: params.currency,
    expectedFeeMinor: params.feeMinor,
    expectedReceivedMinor: params.receivedMinor,
    expectedDeliveryHours: params.deliveryHours,
    projectedBufferAfterMinor: params.evaluation.bufferAfterMinor,
    projectedMinBalanceMinor: params.evaluation.projectedMinBalanceMinor,
    obligationsCovered: params.evaluation.obligationsCovered.map((o) => ({
      name: o.name,
      amountMinor: o.amountMinor,
      dueDate: o.dueDate,
      covered: o.covered,
    })),
    shortfallRisk: params.evaluation.shortfall ? 1 : params.evaluation.bufferAfterMinor < 0 ? 0.7 : 0.08,
  };
}

export { applyMemoryRules as getMemoryPlan };
