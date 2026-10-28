import { differenceInCalendarDays, subDays } from "date-fns";
import { prisma, parseJson } from "@/server/db";
import type {
  DecisionInputSnapshot, DecisionType, RouteQuoteInput, ValidatedMemory,
} from "@/lib/types";
import { computeCashFlow, type CashFlowInput } from "@/server/engine/cashflow";
import { recallApplicableMemories } from "./memory";

export interface FinancialContext {
  accounts: Awaited<ReturnType<typeof prisma.financialAccount.findMany>>;
  commitments: Awaited<ReturnType<typeof prisma.commitment.findMany>>;
  savingsGoals: Awaited<ReturnType<typeof prisma.savingsGoal.findMany>>;
  transactions: Awaited<ReturnType<typeof prisma.transaction.findMany>>;
  routes: (Awaited<ReturnType<typeof prisma.paymentRoute.findMany>>[number] & {
    quotes: Awaited<ReturnType<typeof prisma.routeQuote.findMany>>;
  })[];
  expectedIncome: {
    id: string; label: string; amountMinor: number; currency: string;
    expectedDate: Date; reliability: number;
  }[];
  cashFlow: {
    monthlyIncomeMinor: number;
    monthlyExpenseMinor: number;
    dailyVariableSpendMinor: number;
    monthsObserved: number;
    monthly: { month: string; incomeMinor: number; expenseMinor: number; netMinor: number }[];
  };
  previousShortfalls: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function deriveExpectedIncome(transactions: FinancialContext["transactions"]) {
  const income = transactions.filter(
    (t) => t.direction === "in" && t.status === "posted" && t.category === "income",
  );
  if (income.length === 0) return [];
  const groups = new Map<string, typeof income>();
  for (const tx of income) {
    const key = tx.merchant ?? tx.description ?? "Income";
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }
  const results: FinancialContext["expectedIncome"] = [];
  for (const [label, list] of groups) {
    if (list.length < 1) continue;
    const sorted = [...list].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const latest = sorted[sorted.length - 1];
    const amount = median(sorted.slice(-6).map((t) => t.amountMinor));
    let intervalDays = 30;
    if (sorted.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        intervals.push(differenceInCalendarDays(sorted[i].timestamp, sorted[i - 1].timestamp));
      }
      intervalDays = Math.max(7, Math.min(45, Math.round(median(intervals))));
    }
    const amounts = sorted.slice(-6).map((t) => t.amountMinor);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / amounts.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    const reliability = sorted.length < 2 ? 0.55 : Math.max(0.4, Math.min(0.95, 1 - cv));
    const expectedDate = new Date(latest.timestamp.getTime() + intervalDays * 86_400_000);
    results.push({
      id: `derived-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`,
      label,
      amountMinor: amount,
      currency: latest.currency,
      expectedDate,
      reliability,
    });
  }
  return results;
}

export async function getFinancialContext(userId: string): Promise<FinancialContext> {
  const [accounts, commitments, savingsGoals, transactions, routes] = await Promise.all([
    prisma.financialAccount.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.commitment.findMany({ where: { userId }, orderBy: { dueDate: "asc" } }),
    prisma.savingsGoal.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.transaction.findMany({ where: { userId }, orderBy: { timestamp: "desc" }, take: 500 }),
    prisma.paymentRoute.findMany({
      where: { userId },
      include: { quotes: { orderBy: { quotedAt: "desc" }, take: 5 } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const expectedIncome = deriveExpectedIncome(transactions);

  const months = new Map<string, { incomeMinor: number; expenseMinor: number }>();
  const cutoff = subDays(new Date(), 180);
  const recent = transactions.filter((t) => t.timestamp >= cutoff && t.status === "posted");
  for (const tx of recent) {
    const key = tx.timestamp.toISOString().slice(0, 7);
    const bucket = months.get(key) ?? { incomeMinor: 0, expenseMinor: 0 };
    if (tx.direction === "in") bucket.incomeMinor += tx.amountMinor;
    else bucket.expenseMinor += tx.amountMinor;
    months.set(key, bucket);
  }
  const monthly = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, v]) => ({ month, ...v, netMinor: v.incomeMinor - v.expenseMinor }));

  const last90 = transactions.filter(
    (t) => t.direction === "out" && t.status === "posted" && t.timestamp >= subDays(new Date(), 90),
  );
  const spendByDay = new Map<string, number>();
  for (const tx of last90) {
    const day = tx.timestamp.toISOString().slice(0, 10);
    spendByDay.set(day, (spendByDay.get(day) ?? 0) + tx.amountMinor);
  }
  // Spread spend across the whole 90-day observation window, not only the
  // days that happen to contain a transaction. Dividing by transaction-days
  // would overstate a weekly grocery run as a daily expense.
  const totalSpend = [...spendByDay.values()].reduce((a, b) => a + b, 0);
  const dailyVariableSpendMinor = totalSpend > 0 ? Math.round(totalSpend / 90) : 0;

  const monthlyIncomeMinor = monthly.length > 0 ? median(monthly.map((m) => m.incomeMinor)) : 0;
  const monthlyExpenseMinor = monthly.length > 0 ? median(monthly.map((m) => m.expenseMinor)) : 0;

  const shortfalls = await prisma.decisionOutcome.count({
    where: { decision: { userId }, shortfallOccurred: true },
  });

  return {
    accounts,
    commitments,
    savingsGoals,
    transactions,
    routes,
    expectedIncome,
    cashFlow: {
      monthlyIncomeMinor,
      monthlyExpenseMinor,
      dailyVariableSpendMinor,
      monthsObserved: monthly.length,
      monthly,
    },
    previousShortfalls: shortfalls,
  };
}

export function buildRouteQuoteInputs(
  routes: FinancialContext["routes"],
  params: { amountMinor: number; originCurrency: string; destinationCurrency: string; asOf: Date },
): RouteQuoteInput[] {
  const result: RouteQuoteInput[] = [];
  for (const route of routes) {
    if (!route.isActive) continue;
    if (route.originCurrency !== params.originCurrency) continue;
    if (route.destinationCurrency !== params.destinationCurrency) continue;
    const quote = route.quotes[0];
    if (!quote) continue;
    const scale = quote.sendAmountMinor > 0 ? params.amountMinor / quote.sendAmountMinor : 1;
    const expectedReceived = Math.max(0, Math.round(quote.expectedReceivedMinor * scale));
    result.push({
      quoteId: quote.id,
      routeId: route.id,
      routeName: route.name,
      providerOrMethod: route.providerOrMethod,
      originCurrency: route.originCurrency,
      destinationCurrency: route.destinationCurrency,
      payoutMethod: route.payoutMethod,
      sendAmountMinor: params.amountMinor,
      feeMinor: quote.feeMinor,
      networkFeeMinor: quote.networkFeeMinor,
      exchangeRate: quote.exchangeRate,
      expectedReceivedMinor: expectedReceived,
      estimatedDeliveryHours: quote.estimatedDeliveryHours,
      source: quote.source,
      evidenceQuality: quote.evidenceQuality,
      quotedAt: quote.quotedAt.toISOString(),
      expiresAt: quote.expiresAt?.toISOString() ?? null,
      isSynthetic: quote.isSynthetic,
      reliability: { score: 0.5, sampleSize: 0, source: "none" },
    });
  }

  // Hydrate observed route reliability from real observations.
  return result;
}

export async function hydrateRouteReliability(
  userId: string,
  quotes: RouteQuoteInput[],
): Promise<RouteQuoteInput[]> {
  if (quotes.length === 0) return quotes;
  const observations = await prisma.routeObservation.findMany({
    where: { userId, routeId: { in: quotes.map((q) => q.routeId) } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const community = await prisma.consent.findUnique({
    where: { userId_consentType: { userId, consentType: "community_route_intelligence" } },
  });
  const communityStats = community?.granted
    ? await prisma.communityRouteStatistic.findMany()
    : [];

  return quotes.map((quote) => {
    const obs = observations.filter((o) => o.routeId === quote.routeId && o.corridor === `${quote.originCurrency}>${quote.destinationCurrency}`);
    let score = 0.5;
    let sampleSize = 0;
    let source: "history" | "network" | "none" = "none";
    if (obs.length > 0) {
      const costErrors = obs.map((o) => Math.abs(o.actualCostMinor - o.expectedCostMinor) / Math.max(1, o.expectedCostMinor));
      const deliveryErrors = obs.map((o) => Math.abs(o.actualDeliveryHours - o.expectedDeliveryHours) / Math.max(1, o.expectedDeliveryHours));
      const meanCostError = costErrors.reduce((a, b) => a + b, 0) / costErrors.length;
      const meanDeliveryError = deliveryErrors.reduce((a, b) => a + b, 0) / deliveryErrors.length;
      score = Math.max(0.05, Math.min(1, 1 - meanCostError * 0.5 - meanDeliveryError * 0.3));
      sampleSize = obs.length;
      source = "history";
    }
    if (communityStats.length > 0) {
      const key = `${quote.originCurrency}>${quote.destinationCurrency}|${quote.payoutMethod}|${quote.providerOrMethod}`;
      const stat = communityStats.find((s) => s.routeGroupKey === key);
      if (stat && stat.contributorCount >= 3) {
        const costStats = parseJson<{ meanError: number } | null>(stat.observedCostStatistics, null);
        const deliveryStats = parseJson<{ meanError: number } | null>(stat.observedDeliveryStatistics, null);
        const networkScore = Math.max(0.05, Math.min(1, 1 - (costStats?.meanError ?? 0) * 0.5 - (deliveryStats?.meanError ?? 0) * 0.3));
        score = sampleSize > 0 ? (score * sampleSize + networkScore * stat.contributorCount) / (sampleSize + stat.contributorCount) : networkScore;
        sampleSize += stat.contributorCount;
        source = "network";
      }
    }
    return { ...quote, reliability: { score, sampleSize, source } };
  });
}

export async function buildDecisionInput(params: {
  userId: string;
  decisionType: DecisionType;
  amountMinor: number | null;
  currency: string;
  sourceAccountId?: string | null;
  destinationLabel?: string | null;
  destinationCurrency?: string;
  date?: string;
  includeExpectedIncome?: boolean;
  routeQuoteIds?: string[];
  memoryCutoff?: string | null;
}): Promise<{
  snapshot: DecisionInputSnapshot;
  context: FinancialContext;
}> {
  const context = await getFinancialContext(params.userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: params.userId } });
  const asOf = params.date ? new Date(params.date) : new Date();
  const destinationCurrency = params.destinationCurrency ?? params.currency;
  let quotes = buildRouteQuoteInputs(context.routes, {
    amountMinor: params.amountMinor ?? 0,
    originCurrency: params.currency,
    destinationCurrency,
    asOf,
  });
  if (params.routeQuoteIds && params.routeQuoteIds.length > 0) {
    quotes = quotes.filter((q) => params.routeQuoteIds!.includes(q.quoteId));
  }
  quotes = await hydrateRouteReliability(params.userId, quotes);

  const snapshot: DecisionInputSnapshot = {
    asOf: asOf.toISOString(),
    currency: params.currency,
    requestedAmountMinor: params.amountMinor,
    decisionType: params.decisionType,
    sourceAccountId: params.sourceAccountId ?? context.accounts.find((a) => a.currency === params.currency && a.isLiquid)?.id ?? null,
    destinationLabel: params.destinationLabel ?? null,
    destinationCurrency,
    routeQuotes: quotes,
    includeExpectedIncome: params.includeExpectedIncome ?? false,
    accounts: context.accounts.map((a) => ({
      id: a.id, name: a.name, balanceMinor: a.balanceMinor, currency: a.currency,
      isLiquid: a.isLiquid, verificationStatus: a.verificationStatus, balanceSource: a.balanceSource,
    })),
    commitments: context.commitments.map((c) => ({
      id: c.id, name: c.name, amountMinor: c.amountMinor, currency: c.currency,
      dueDate: c.dueDate.toISOString(), priority: c.priority, recurrence: c.recurrence,
    })),
    savingsGoals: context.savingsGoals.map((g) => ({
      id: g.id, name: g.name, currentMinor: g.currentMinor, targetMinor: g.targetMinor,
      currency: g.currency, monthlyContributionMinor: g.monthlyContributionMinor, priority: g.priority,
    })),
    expectedIncome: context.expectedIncome.map((i) => ({
      id: i.id, label: i.label, amountMinor: i.amountMinor, currency: i.currency,
      expectedDate: i.expectedDate.toISOString(), reliability: i.reliability,
    })),
    safetyBufferMinor: user.safetyBufferMinor,
    riskPosture: user.riskPosture,
    cashFlow: {
      monthlyIncomeMinor: context.cashFlow.monthlyIncomeMinor,
      monthlyExpenseMinor: context.cashFlow.monthlyExpenseMinor,
      dailyVariableSpendMinor: context.cashFlow.dailyVariableSpendMinor,
      monthsObserved: context.cashFlow.monthsObserved,
    },
    previousShortfalls: context.previousShortfalls,
    memoryCutoff: params.memoryCutoff ?? null,
    engineVersion: "landed-engine-1.0.0",
  };

  return { snapshot, context };
}

export function memoryQueryForSnapshot(snapshot: DecisionInputSnapshot): string {
  const obligations = snapshot.commitments
    .filter((c) => c.priority !== "discretionary")
    .slice(0, 3)
    .map((c) => c.name)
    .join(", ");
  return [
    `${snapshot.decisionType} ${snapshot.requestedAmountMinor ? (snapshot.requestedAmountMinor / 100).toFixed(2) : "safe amount"} ${snapshot.currency}`,
    snapshot.destinationLabel ? `to ${snapshot.destinationLabel}` : "",
    obligations ? `upcoming ${obligations}` : "",
    snapshot.expectedIncome.length > 0 ? "expected income reliability" : "",
    "transfer fee recipient amount delivery reliability shortfall buffer",
  ].filter(Boolean).join("; ");
}

export function cashFlowInputFromSnapshot(snapshot: DecisionInputSnapshot, memories: ValidatedMemory[] = []) {
  return {
    asOf: new Date(snapshot.asOf),
    currency: snapshot.currency,
    accounts: snapshot.accounts,
    commitments: snapshot.commitments.map((c) => ({ ...c, dueDate: new Date(c.dueDate), status: "upcoming" })),
    savingsGoals: snapshot.savingsGoals,
    expectedIncome: snapshot.expectedIncome.map((i) => ({ ...i, expectedDate: new Date(i.expectedDate) })),
    safetyBufferMinor: snapshot.safetyBufferMinor,
    includeExpectedIncome: snapshot.includeExpectedIncome,
    dailyVariableSpendMinor: snapshot.cashFlow.dailyVariableSpendMinor,
    previousShortfalls: snapshot.previousShortfalls,
    riskPosture: snapshot.riskPosture,
    memories,
  } satisfies CashFlowInput;
}

export async function getDashboard(userId: string) {
  const context = await getFinancialContext(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const asOf = new Date();
  const baseCurrency = user.preferredCurrency;

  const query = `safe to move ${baseCurrency} upcoming bills rent transfer buffer expected income`;
  const retrieval = await recallApplicableMemories(userId, query, { limit: 4, asOf });

  const cashflow = computeCashFlow(
    cashFlowInputFromSnapshot(
      (await buildDecisionInput({
        userId,
        decisionType: "affordability",
        amountMinor: null,
        currency: baseCurrency,
        includeExpectedIncome: false,
      })).snapshot,
      retrieval.memories,
    ),
  );

  const currencies = new Map<string, { currency: string; liquidMinor: number; nonLiquidMinor: number; accounts: number; unverifiedMinor: number }>();
  for (const account of context.accounts) {
    const bucket = currencies.get(account.currency) ?? {
      currency: account.currency, liquidMinor: 0, nonLiquidMinor: 0, accounts: 0, unverifiedMinor: 0,
    };
    if (account.isLiquid) bucket.liquidMinor += account.balanceMinor;
    else bucket.nonLiquidMinor += account.balanceMinor;
    if (account.verificationStatus === "unverified") bucket.unverifiedMinor += account.balanceMinor;
    bucket.accounts += 1;
    currencies.set(account.currency, bucket);
  }

  const upcoming = context.commitments
    .filter((c) => c.status === "upcoming")
    .slice(0, 6)
    .map((c) => ({
      id: c.id,
      name: c.name,
      amountMinor: c.amountMinor,
      currency: c.currency,
      dueDate: c.dueDate,
      priority: c.priority,
      daysUntil: differenceInCalendarDays(c.dueDate, asOf),
    }));

  const recentTransactions = context.transactions
    .filter((t) => t.status === "posted")
    .slice(0, 6);

  const movements = await prisma.moneyMovement.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { route: { select: { name: true } }, decision: { select: { id: true, objective: true } } },
  });

  const pendingDecisions = await prisma.financialDecision.findMany({
    where: { userId, status: { in: ["advised", "accepted", "followed"] } },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  const [memoryCount, confirmedMemoryCount, decisionsCount, evaluatedCount, outcomeAgg] = await Promise.all([
    prisma.memoryRecord.count({ where: { userId } }),
    prisma.memoryRecord.count({ where: { userId, writeStatus: "confirmed" } }),
    prisma.financialDecision.count({ where: { userId } }),
    prisma.decisionOutcome.count({ where: { decision: { userId } } }),
    prisma.decisionOutcome.findMany({
      where: { decision: { userId } },
      select: { shortfallOccurred: true, outcomeStatus: true, predictionError: true },
    }),
  ]);

  const learning = {
    memoryCount,
    confirmedMemoryCount,
    decisionsCount,
    evaluatedCount,
    shortfalls: outcomeAgg.filter((o) => o.shortfallOccurred).length,
    achieved: outcomeAgg.filter((o) => o.outcomeStatus === "achieved").length,
    acceptanceRate: decisionsCount > 0
      ? await prisma.financialDecision.count({ where: { userId, status: { in: ["followed", "completed", "evaluated"] } } }).then((n) => (decisionsCount ? n / decisionsCount : 0))
      : 0,
  };

  const insights: { title: string; body: string; tone: "memory" | "pattern" | "warning"; memoryId?: string; blobId?: string | null }[] = [];
  const rent = context.commitments.find((c) => c.name.toLowerCase().includes("rent") && c.status === "upcoming");
  if (rent) {
    const days = differenceInCalendarDays(rent.dueDate, asOf);
    if (days <= 10 && context.expectedIncome.some((i) => i.expectedDate > rent.dueDate)) {
      insights.push({
        title: "A bill lands before income",
        body: `${rent.name} is due in ${days} day${days === 1 ? "" : "s"}, before your expected ${context.expectedIncome[0]?.label ?? "income"}. LANDED protects it from safe-to-move.`,
        tone: "pattern",
      });
    }
  }
  for (const memory of retrieval.memories.slice(0, 2)) {
    insights.push({
      title: "Remembered",
      body: memory.summary,
      tone: "memory",
      memoryId: memory.id,
      blobId: memory.blobId,
    });
  }
  if (retrieval.mode === "local_rehearsal") {
    insights.push({
      title: "Memory is in rehearsal",
      body: "Walrus is not configured on this deployment. Lessons are being applied from the local rehearsal ledger and are never presented as Mainnet writes.",
      tone: "warning",
    });
  }

  return {
    user: {
      name: user.name,
      currency: baseCurrency,
      safetyBufferMinor: user.safetyBufferMinor,
      isDemo: user.isDemo,
      mainObjective: user.mainObjective,
    },
    asOf,
    currencies: [...currencies.values()],
    baseCurrency,
    totals: {
      liquidMinor: currencies.get(baseCurrency)?.liquidMinor ?? 0,
      nonLiquidMinor: currencies.get(baseCurrency)?.nonLiquidMinor ?? 0,
      allLiquidByCurrency: [...currencies.values()].filter((c) => c.liquidMinor !== 0),
      unverifiedMinor: currencies.get(baseCurrency)?.unverifiedMinor ?? 0,
    },
    cashflow,
    accounts: context.accounts,
    commitments: context.commitments,
    upcoming,
    savingsGoals: context.savingsGoals,
    cashFlowSeries: context.cashFlow.monthly,
    monthlyIncomeMinor: context.cashFlow.monthlyIncomeMinor,
    monthlyExpenseMinor: context.cashFlow.monthlyExpenseMinor,
    recentTransactions,
    movements,
    pendingDecisions,
    expectedIncome: context.expectedIncome,
    learning,
    insights,
    memoryRetrieval: {
      mode: retrieval.mode,
      error: retrieval.error,
      count: retrieval.memories.length,
      used: retrieval.memories.map((m) => ({ id: m.id, summary: m.summary, blobId: m.blobId, confidence: m.confidence })),
    },
    integration: {
      walrusConfigured: (await import("./memory")).memoryConfig().configured,
    },
  };
}
