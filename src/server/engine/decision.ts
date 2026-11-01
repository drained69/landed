import type {
  ActionAdjustment, Assumption, DecisionAction, DecisionInputSnapshot,
  PredictedOutcome, RouteComparison, ValidatedMemory,
} from "@/lib/types";
import { formatMinor, roundMinorTo } from "@/lib/money";
import {
  buildPrediction, computeCashFlow, evaluateTransfer,
  type CashFlowInput, type CashFlowResult,
} from "./cashflow";
import { rankRoutes } from "./routes";

export const ENGINE_VERSION = "landed-engine-1.0.0";

export interface DecisionResult {
  action: DecisionAction;
  baselineAction: DecisionAction;
  assumptions: Assumption[];
  predicted: PredictedOutcome;
  confidence: number;
  cashflow: CashFlowResult;
  baselineCashflow: CashFlowResult;
  routeComparison: RouteComparison;
  baselineRouteComparison: RouteComparison;
  memories: ValidatedMemory[];
  effects: { code: string; label: string; detail: string; memoryId: string; memoryBlobId?: string | null }[];
  input: DecisionInputSnapshot;
}

function emptyAction(reason: string, currency: string): DecisionAction {
  return {
    kind: "insufficient_data",
    amountMinor: 0,
    currency,
    timing: "wait",
    headline: "I need one more detail",
    rationale: reason,
    riskLevel: "unknown",
    adjustments: [],
  };
}

function routePrediction(
  quote: { expectedReceivedMinor: number; sendAmountMinor: number; feeMinor: number; networkFeeMinor: number; estimatedDeliveryHours: number; routeId: string; routeName: string } | null,
  _requestedAmountMinor: number,
  recommendedAmountMinor: number,
) {
  // A quote for a different send amount cannot establish the fee, payout or
  // best route for this recommendation. In particular, subtracting a source
  // currency difference from a destination currency payout is invalid.
  if (!quote || quote.sendAmountMinor !== recommendedAmountMinor) return { feeMinor: null, receivedMinor: null, deliveryHours: null, routeId: null, routeName: null };
  return {
    feeMinor: quote.feeMinor + quote.networkFeeMinor,
    receivedMinor: quote.expectedReceivedMinor,
    deliveryHours: quote.estimatedDeliveryHours,
    routeId: quote.routeId,
    routeName: quote.routeName,
  };
}

function toCashFlow(input: DecisionInputSnapshot, memories: ValidatedMemory[]): CashFlowInput {
  return {
    asOf: new Date(input.asOf),
    currency: input.currency,
    accounts: input.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      balanceMinor: a.balanceMinor,
      currency: a.currency,
      isLiquid: a.isLiquid,
      includeInSafeToMove: a.includeInSafeToMove,
      verificationStatus: a.verificationStatus,
      balanceSource: a.balanceSource,
    })),
    commitments: input.commitments.map((c) => ({
      id: c.id,
      name: c.name,
      amountMinor: c.amountMinor,
      currency: c.currency,
      dueDate: new Date(c.dueDate),
      priority: c.priority,
      recurrence: c.recurrence,
      status: c.status ?? "upcoming",
    })),
    savingsGoals: input.savingsGoals.map((g) => ({
      id: g.id,
      name: g.name,
      currentMinor: g.currentMinor,
      targetMinor: g.targetMinor,
      currency: g.currency,
      monthlyContributionMinor: g.monthlyContributionMinor,
      priority: g.priority,
    })),
    expectedIncome: input.expectedIncome.map((i) => ({
      id: i.id,
      label: i.label,
      amountMinor: i.amountMinor,
      currency: i.currency,
      expectedDate: new Date(i.expectedDate),
      reliability: i.reliability,
    })),
    safetyBufferMinor: input.safetyBufferMinor,
    includeExpectedIncome: input.includeExpectedIncome,
    dailyVariableSpendMinor: input.cashFlow.dailyVariableSpendMinor,
    monthsObserved: input.cashFlow.monthsObserved,
    previousShortfalls: input.previousShortfalls,
    riskPosture: input.riskPosture,
    memories,
  };
}

function recommendFromCashflow(
  input: DecisionInputSnapshot,
  memories: ValidatedMemory[],
  options: { allowSplit: boolean },
): {
  cashflow: CashFlowResult;
  routeComparison: RouteComparison;
  action: DecisionAction;
  predicted: PredictedOutcome;
  effects: DecisionResult["effects"];
  confidence: number;
} {
  const cf = computeCashFlow(toCashFlow(input, memories));
  const routeComparison = rankRoutes(input.routeQuotes, memories, {
    preference: input.riskPosture === "cautious" ? "reliability" : "balanced",
  }, new Date(input.asOf));

  const requested = input.requestedAmountMinor;
  const amount = requested ?? cf.safeToMoveMinor;
  const type = input.decisionType;

  if (cf.missingInputs.some((m) => m.startsWith("No liquid"))) {
    const action = emptyAction("There is no cleared liquid account in this currency. Add or verify an account before LANDED recommends a move.", input.currency);
    return {
      cashflow: cf,
      routeComparison,
      action,
      predicted: buildPrediction({
        amountMinor: 0, currency: input.currency, feeMinor: null, receivedMinor: null, deliveryHours: null,
        evaluation: evaluateTransfer(toCashFlow(input, memories), 0, new Date(input.asOf)),
      }),
      effects: [],
      confidence: cf.confidence * 0.5,
    };
  }

  const safe = cf.safeToMoveMinor;
  const memoryMap = new Map(memories.filter((m) => m.rule).map((m) => [m.id, m]));
  const adjustments: ActionAdjustment[] = cf.effects
    .filter((e) => memoryMap.has(e.memoryId))
    .map((e) => ({
      code: e.code,
      label: e.label,
      detail: e.detail,
      memoryId: e.memoryId,
      memoryBlobId: memoryMap.get(e.memoryId)?.blobId ?? null,
    }));

  let recommended = Math.min(amount, safe);
  let timing: DecisionAction["timing"] = "today";
  let timingDate: string | null = null;
  let split: DecisionAction["split"] = null;

  const income = input.expectedIncome
    .filter((i) => i.currency === input.currency && new Date(i.expectedDate) > new Date(input.asOf))
    .sort((a, b) => new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime())[0];

  if (requested && safe < requested) {
    const nextIncome = income;
    if (type === "send" && options.allowSplit && recommended > 0 && nextIncome) {
      const remainder = requested - recommended;
      const evalRemainder = evaluateTransfer(
        toCashFlow(input, memories),
        requested,
        new Date(input.asOf),
      );
      if (evalRemainder.bufferAfterMinor >= 0 && !evalRemainder.shortfall) {
        timing = "wait_for_income";
        split = {
          firstMinor: recommended,
          remainderMinor: remainder,
          remainderAfter: nextIncome.expectedDate,
          reason: `Protect near-term obligations, then send the remainder after ${nextIncome.label}.`,
        };
        const splitMemory = memories.find((m) => m.rule?.kind === "SPLIT_TRANSFER");
        if (splitMemory?.rule?.kind === "SPLIT_TRANSFER") {
          const cap = Math.max(0, Math.min(1, splitMemory.rule.maxTodayPercent));
          recommended = Math.min(recommended, roundMinorTo(Math.round(safe * cap), 5, input.currency));
          split.firstMinor = recommended;
          split.remainderMinor = requested - recommended;
          adjustments.push({
            code: "SPLIT_TRANSFER",
            label: `Split limited to ${(cap * 100).toFixed(0)}% of safe-to-move`,
            detail: splitMemory.summary,
            memoryId: splitMemory.id,
            memoryBlobId: splitMemory.blobId,
          });
        }
      }
    }
    if (!split && recommended < requested) {
      adjustments.push({
        code: "AMOUNT_REDUCED",
        label: `Recommended ${formatMinor(recommended, input.currency)} instead of ${formatMinor(requested, input.currency)}`,
        detail: `Safe-to-move is ${formatMinor(safe, input.currency)} after protecting ${formatMinor(cf.essentialCommitmentsMinor, input.currency)} in obligations and a ${formatMinor(cf.effectiveSafetyBufferMinor, input.currency)} buffer.`,
        deltaMinor: -(requested - recommended),
      });
    }
  }

  if (type === "save") {
    const contribution = requested ? Math.min(requested, safe) : safe;
    recommended = contribution;
    if (requested && contribution < requested) {
      timing = "on_date";
      timingDate = new Date(new Date(input.asOf).getTime() + 7 * 86_400_000).toISOString();
      adjustments.push({
        code: "SAVE_REDUCED",
        label: `Save ${formatMinor(contribution, input.currency)} now, not ${formatMinor(requested, input.currency)}`,
        detail: "The remainder would leave less than the protected buffer after upcoming obligations.",
        deltaMinor: contribution - requested,
      });
    }
  }

  const chosenRoute = routeComparison.best
    ? routePrediction({ ...routeComparison.best.quote, expectedReceivedMinor: routeComparison.best.expectedReceivedMinor }, requested ?? recommended, recommended)
    : routePrediction(null, recommended, recommended);
  const evaluation = evaluateTransfer(toCashFlow(input, memories), recommended, new Date(input.asOf));
  const predicted = buildPrediction({
    amountMinor: recommended,
    currency: input.currency,
    feeMinor: chosenRoute.feeMinor,
    receivedMinor: chosenRoute.receivedMinor,
    deliveryHours: chosenRoute.deliveryHours,
    evaluation,
  });

  const routeAdjustments = routeComparison.best?.adjustments ?? [];
  for (const adj of routeAdjustments) {
    const mem = adj.memoryId ? memoryMap.get(adj.memoryId) : null;
    if (mem) {
      adjustments.push({
        code: "ROUTE_ADJUSTMENT",
        label: adj.label,
        detail: mem.summary,
        memoryId: mem.id,
        memoryBlobId: mem.blobId,
      });
    }
  }

  const riskLevel: DecisionAction["riskLevel"] =
    recommended <= 0 ? "high" : evaluation.shortfall || evaluation.bufferAfterMinor < 0
      ? "high"
      : evaluation.bufferAfterMinor < cf.effectiveSafetyBufferMinor
        ? "medium"
        : "low";

  const requestedLabel = requested ? formatMinor(requested, input.currency) : null;
  const headline =
    recommended <= 0
      ? "Wait before moving money"
      : requested !== null && recommended < requested
        ? `Move ${formatMinor(recommended, input.currency)} now${split ? `, then ${formatMinor(split.remainderMinor, input.currency)}` : ""}`
        : type === "save"
          ? `Save ${formatMinor(recommended, input.currency)}`
          : `Move ${formatMinor(recommended, input.currency)} today`;

  const rationaleParts: string[] = [];
  if (requestedLabel && requested !== null && recommended < requested) {
    rationaleParts.push(`${requestedLabel} exceeds the current safe-to-move recommendation.`);
  }
  rationaleParts.push(
    `After protecting ${formatMinor(cf.essentialCommitmentsMinor, input.currency)} in scheduled commitments and a ${formatMinor(cf.effectiveSafetyBufferMinor, input.currency)} buffer, ${formatMinor(safe, input.currency)} is safe to move.`,
  );
  if (split) {
    rationaleParts.push(`Send the remaining ${formatMinor(split.remainderMinor, input.currency)} after your ${income?.label ?? "next confirmed payment"}.`);
  }
  if (chosenRoute.routeId && routeComparison.best && routeComparison.best.adjustments.length > 0) {
    rationaleParts.push(`${routeComparison.best.quote.routeName} ranks first after applying observed route outcomes.`);
  } else if (chosenRoute.routeId && routeComparison.best) {
    rationaleParts.push(`${routeComparison.best.quote.routeName} ranks first on recipient amount, cost, speed, and evidence quality.`);
  } else if (routeComparison.best) {
    rationaleParts.push("The available route quotes are for a different amount. Get a new quote for this recommendation before comparing fees or recipient amounts.");
  }
  if (cf.missingInputs.length > 0) rationaleParts.push(`Note: ${cf.missingInputs[0]}`);

  const routeConfidence = routeComparison.best
    ? routeComparison.best.confidence === "high" ? 1 : routeComparison.best.confidence === "medium" ? 0.9 : 0.75
    : 0.8;

  return {
    cashflow: cf,
    routeComparison,
    action: {
      kind: recommended <= 0 ? "wait" : type === "save" ? "save" : type === "spend" ? "spend" : "send",
      amountMinor: recommended,
      currency: input.currency,
      timing,
      timingDate,
      routeId: chosenRoute.routeId,
      routeName: chosenRoute.routeName,
      split,
      headline,
      rationale: rationaleParts.join(" "),
      riskLevel,
      adjustments,
    },
    predicted,
    effects: adjustments
      .filter((a) => a.memoryId)
      .map((a) => ({
        code: a.code,
        label: a.label,
        detail: a.detail,
        memoryId: a.memoryId!,
        memoryBlobId: a.memoryBlobId ?? null,
      })),
    confidence: Math.max(0.25, Math.min(0.97, cf.confidence * routeConfidence)),
  };
}

export function decide(input: DecisionInputSnapshot, memories: ValidatedMemory[]): DecisionResult {
  const enriched = { ...input, memoryCutoff: input.memoryCutoff ?? input.asOf };
  const eligible = memories.filter((m) => !m.excluded && !m.supersededBy &&
    ["verified", "user_confirmed"].includes(m.verificationStatus) &&
    new Date(m.createdAt).getTime() <= new Date(enriched.memoryCutoff).getTime());
  const withMemory = recommendFromCashflow(enriched, eligible, { allowSplit: true });
  const baseline = recommendFromCashflow(enriched, [], { allowSplit: false });

  const routeAssumptions: Assumption[] = [];
  if (withMemory.routeComparison.best) {
    const q = withMemory.routeComparison.best.quote;
    routeAssumptions.push({
      key: "route_quote",
      label: `${q.routeName} quote from ${q.source === "demo" ? "demonstration data" : q.source === "user_entered" ? "user-entered provider quote" : "provider"}`,
      detail: `Quoted ${new Date(q.quotedAt).toLocaleString("en-US")} · ${q.evidenceQuality.replaceAll("_", " ")} · expected ${formatMinor(q.expectedReceivedMinor, q.destinationCurrency)} received.`,
      source: q.isSynthetic || q.source === "demo" ? "estimate" : "database",
    });
  }
  if (withMemory.routeComparison.notes.length > 0) {
    routeAssumptions.push({
      key: "route_notes",
      label: "Route evidence caveat",
      detail: withMemory.routeComparison.notes.join(" "),
      source: "estimate",
    });
  }
  if (input.expectedIncome.length > 0 && withMemory.cashflow.expectedIncomeExcludedMinor > 0) {
    routeAssumptions.push({
      key: "expected_income",
      label: "Expected income is not counted as cash",
      detail: "LANDED only spends cleared funds unless you explicitly opt in. Even then, expected income is reliability-weighted.",
      source: "estimate",
    });
  }

  const assumptions = [...withMemory.cashflow.assumptions, ...routeAssumptions];

  return {
    action: withMemory.action,
    baselineAction: baseline.action,
    assumptions,
    predicted: withMemory.predicted,
    confidence: withMemory.confidence,
    cashflow: withMemory.cashflow,
    baselineCashflow: baseline.cashflow,
    routeComparison: withMemory.routeComparison,
    baselineRouteComparison: baseline.routeComparison,
    memories: memories.filter((m) => withMemory.effects.some((e) => e.memoryId === m.id)),
    effects: withMemory.effects,
    input: enriched,
  };
}

/** Explain the exact difference between baseline and memory-informed advice. */
export function diffActions(baseline: DecisionAction, learned: DecisionAction): string[] {
  const diffs: string[] = [];
  if (baseline.amountMinor !== learned.amountMinor) {
    diffs.push(`Amount changed from ${formatMinor(baseline.amountMinor, baseline.currency)} to ${formatMinor(learned.amountMinor, learned.currency)}.`);
  }
  if (baseline.routeId !== learned.routeId) {
    diffs.push(`Route changed from ${baseline.routeName ?? "none"} to ${learned.routeName ?? "none"}.`);
  }
  if (baseline.timing !== learned.timing) {
    diffs.push(`Timing changed from ${baseline.timing.replaceAll("_", " ")} to ${learned.timing.replaceAll("_", " ")}.`);
  }
  if (learned.split && !baseline.split) {
    diffs.push(`A split transfer was introduced: ${formatMinor(learned.split.firstMinor, learned.currency)} now, ${formatMinor(learned.split.remainderMinor, learned.currency)} later.`);
  }
  if (diffs.length === 0) diffs.push("No material change: the recalled lessons did not alter this recommendation.");
  return diffs;
}
