/**
 * LANDED demo dataset.
 *
 * Everything created here is synthetic and explicitly labelled `isSynthetic`
 * or `source: "demo"`. No bank connection, live remittance price, onchain
 * balance, or Walrus write is fabricated. Lessons start in the local rehearsal
 * ledger with writeStatus=blocked until real Walrus credentials are configured
 * and `pnpm walrus:backfill` (or SEED_WALRUS=true) is run.
 */
import { addDays, addHours, addMonths, max as maxDate, setDate, startOfMonth, subDays } from "date-fns";
import { prisma, jsonString } from "../src/server/db";
import type { Prisma } from "@prisma/client";
import { hashPassword } from "../src/server/auth";
import { buildDecisionInput } from "../src/server/services/financial";
import { decide, ENGINE_VERSION } from "../src/server/engine/decision";
import { generateDecision, recordOutcome } from "../src/server/services/decisions";
import { listActiveRuleMemories, writeMemoryToWalrus } from "../src/server/services/memory";

const DEMO_EMAIL = "demo@landed.app";
const DEMO_PASSWORD = "landed-demo-2026";

function atDay(base: Date, monthsAgo: number, day: number): Date {
  const month = addMonths(base, -monthsAgo);
  return setDate(month, day);
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const now = new Date();
  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: "Maya Chen",
      passwordHash: hashPassword(DEMO_PASSWORD),
      isDemo: true,
      preferredCurrency: "USD",
      locale: "en-US",
      safetyBufferMinor: 10000,
      mainObjective: "Protect rent, send money home, and build a six-month buffer.",
      riskPosture: "balanced",
      onboardingComplete: true,
      consents: {
        create: [
          { consentType: "community_route_intelligence", granted: false },
          { consentType: "anonymous_research", granted: false },
          { consentType: "product_updates", granted: false },
        ],
      },
    },
  });

  const accounts = await Promise.all([
    prisma.financialAccount.create({
      data: {
        userId: user.id, name: "Everyday checking", accountType: "bank", provider: "Demo Bank",
        currency: "USD", balanceMinor: 452000, balanceSource: "demo", verificationStatus: "user_confirmed",
        isLiquid: true, isSynthetic: true, notes: "Synthetic demo balance. Not a bank connection.",
      },
    }),
    prisma.financialAccount.create({
      data: {
        userId: user.id, name: "Cash wallet", accountType: "cash", provider: "Self-reported",
        currency: "USD", balanceMinor: 18000, balanceSource: "demo", verificationStatus: "user_confirmed",
        isLiquid: true, isSynthetic: true,
      },
    }),
    prisma.financialAccount.create({
      data: {
        userId: user.id, name: "Emergency savings", accountType: "savings", provider: "Demo Bank",
        currency: "USD", balanceMinor: 120000, balanceSource: "demo", verificationStatus: "user_confirmed",
        isLiquid: false, isSynthetic: true, notes: "Reserved savings; excluded from safe-to-move.",
      },
    }),
    prisma.financialAccount.create({
      data: {
        userId: user.id, name: "Travel wallet", accountType: "wallet", provider: "Self-reported",
        currency: "EUR", balanceMinor: 41000, balanceSource: "demo", verificationStatus: "user_confirmed",
        isLiquid: false, isSynthetic: true, notes: "Held in EUR. LANDED does not convert it without a sourced rate.",
      },
    }),
    prisma.financialAccount.create({
      data: {
        userId: user.id, name: "Sui wallet · USDC (demo)", accountType: "stablecoin", provider: "Demo · connect Tatum for verified reads",
        currency: "USD", balanceMinor: 32450, balanceSource: "demo", verificationStatus: "user_confirmed",
        isLiquid: true, isSynthetic: true, chain: "sui",
        notes: "Synthetic wallet balance. Not a verified onchain balance; connect a wallet with Tatum to replace it.",
      },
    }),
  ]);

  await prisma.commitment.create({
    data: {
      userId: user.id, name: "Rent", amountMinor: 145000, currency: "USD",
      dueDate: addDays(now, 11), recurrence: "monthly", priority: "essential", status: "upcoming", isSynthetic: true,
    },
  });
  await prisma.commitment.createMany({
    data: [
      { userId: user.id, name: "Internet", amountMinor: 6500, currency: "USD", dueDate: addDays(now, 9), recurrence: "monthly", priority: "essential", status: "upcoming", isSynthetic: true },
      { userId: user.id, name: "Phone", amountMinor: 4500, currency: "USD", dueDate: addDays(now, 12), recurrence: "monthly", priority: "important", status: "upcoming", isSynthetic: true },
      { userId: user.id, name: "Health insurance", amountMinor: 12000, currency: "USD", dueDate: addDays(now, 18), recurrence: "monthly", priority: "essential", status: "upcoming", isSynthetic: true },
      { userId: user.id, name: "Streaming bundle", amountMinor: 1800, currency: "USD", dueDate: addDays(now, 3), recurrence: "monthly", priority: "discretionary", status: "upcoming", isSynthetic: true },
    ],
  });

  await prisma.savingsGoal.createMany({
    data: [
      { userId: user.id, name: "Emergency fund", targetMinor: 600000, currentMinor: 120000, currency: "USD", targetDate: addMonths(now, 10), monthlyContributionMinor: 25000, priority: "essential", isSynthetic: true },
      { userId: user.id, name: "Japan trip", targetMinor: 350000, currentMinor: 62000, currency: "USD", targetDate: addMonths(now, 8), monthlyContributionMinor: 15000, priority: "discretionary", isSynthetic: true },
    ],
  });

  // ── Transactions: four months of synthetic activity ──────────────────────
  const txRows: Prisma.TransactionCreateManyInput[] = [];
  const salaryDays = [5, 5, 9, 5]; // scenario 1: one late salary
  for (let i = 0; i < 4; i++) {
    txRows.push({
      userId: user.id,
      amountMinor: i === 2 ? 315000 : 320000,
      currency: "USD",
      direction: "in",
      category: "income",
      merchant: "Northwind Payroll",
      description: "Monthly salary (synthetic)",
      timestamp: atDay(now, 3 - i, salaryDays[i]),
      source: "demo",
      status: "posted",
      verificationStatus: "user_confirmed",
      isSynthetic: true,
      dedupeKey: `seed-salary-${i}`,
    });
    txRows.push({
      userId: user.id,
      amountMinor: 145000,
      currency: "USD",
      direction: "out",
      category: "housing",
      merchant: "Demo Landlord",
      description: "Rent (synthetic)",
      timestamp: atDay(now, 3 - i, 3),
      source: "demo",
      status: "posted",
      verificationStatus: "user_confirmed",
      isSynthetic: true,
      dedupeKey: `seed-rent-${i}`,
    });
    txRows.push({
      userId: user.id,
      // Scenario 11: the streaming bundle quietly raised its price this month.
      amountMinor: i === 3 ? 2199 : 1800, // i = 3 is the current month
      currency: "USD",
      direction: "out",
      category: "subscriptions",
      merchant: "Streaming bundle",
      description: "Streaming subscription (synthetic)",
      timestamp: atDay(now, 3 - i, 2),
      source: "demo",
      status: "posted",
      verificationStatus: "user_confirmed",
      isSynthetic: true,
      dedupeKey: `seed-stream-${i}`,
    });
    txRows.push({
      userId: user.id,
      amountMinor: 6500,
      currency: "USD",
      direction: "out",
      category: "utilities",
      merchant: "Demo Fiber",
      description: "Internet (synthetic)",
      timestamp: atDay(now, 3 - i, 10),
      source: "demo",
      status: "posted",
      verificationStatus: "user_confirmed",
      isSynthetic: true,
      dedupeKey: `seed-internet-${i}`,
    });
  }

  const groceries = [9800, 11250, 8600, 13400, 10200, 9600, 12100, 8900, 11000, 10500, 9200, 11800];
  groceries.forEach((amount, i) => {
    txRows.push({
      userId: user.id, amountMinor: amount, currency: "USD", direction: "out", category: "food",
      merchant: i % 3 === 0 ? "Green Market" : "Corner Grocer",
      description: "Groceries (synthetic)", timestamp: subDays(now, i * 7 + 2),
      source: "demo", status: "posted", verificationStatus: "user_confirmed", isSynthetic: true,
      dedupeKey: `seed-grocery-${i}`,
    });
  });

  const transport = [2600, 3200, 2800, 4200, 2400, 3000, 3600, 2900];
  transport.forEach((amount, i) => {
    txRows.push({
      userId: user.id, amountMinor: amount, currency: "USD", direction: "out", category: "transport",
      merchant: "City Transit", description: "Transport (synthetic)", timestamp: subDays(now, i * 9 + 4),
      source: "demo", status: "posted", verificationStatus: "user_confirmed", isSynthetic: true,
      dedupeKey: `seed-transport-${i}`,
    });
  });

  const dining = [2400, 1800, 3200, 2800, 5400, 2100, 3800];
  dining.forEach((amount, i) => {
    txRows.push({
      userId: user.id, amountMinor: amount, currency: "USD", direction: "out", category: "dining",
      merchant: "Local Kitchen", description: "Dining (synthetic)", timestamp: subDays(now, i * 11 + 1),
      source: "demo", status: "posted", verificationStatus: "user_confirmed", isSynthetic: true,
      dedupeKey: `seed-dining-${i}`,
    });
  });

  // ── Spend Watch scenarios: subscriptions and a dining streak this month ──
  const spendWatchRows: Prisma.TransactionCreateManyInput[] = [];
  for (let i = 0; i < 4; i++) {
    spendWatchRows.push({
      userId: user.id, amountMinor: 4500, currency: "USD", direction: "out", category: "subscriptions",
      merchant: "FitClub", description: "Gym membership (synthetic)", timestamp: subDays(now, 9 + 30 * i),
      source: "demo", status: "posted", verificationStatus: "user_confirmed", isSynthetic: true,
      dedupeKey: `seed-gym-${i}`,
    });
    spendWatchRows.push({
      userId: user.id, amountMinor: 999, currency: "USD", direction: "out", category: "subscriptions",
      merchant: "CloudBox Storage", description: "Cloud storage (synthetic)", timestamp: subDays(now, 17 + 30 * i),
      source: "demo", status: "posted", verificationStatus: "user_confirmed", isSynthetic: true,
      dedupeKey: `seed-cloud-${i}`,
    });
  }
  // Two extra dinners out, kept inside the current month so the limit scenario holds on any date.
  const monthFloor = addHours(startOfMonth(now), 12);
  [[4200, 3], [3600, 6]].forEach(([amount, daysAgo], i) => {
    spendWatchRows.push({
      userId: user.id, amountMinor: amount, currency: "USD", direction: "out", category: "dining",
      merchant: "Local Kitchen", description: "Dining (synthetic)",
      timestamp: maxDate([subDays(now, daysAgo), monthFloor]),
      source: "demo", status: "posted", verificationStatus: "user_confirmed", isSynthetic: true,
      dedupeKey: `seed-dining-streak-${i}`,
    });
  });
  // Keep the trailing 90-day spend identical to the original scenario so the
  // documented safe-to-move walkthrough ($300 → $150 now / $150 later) is unchanged:
  // the added Spend Watch spend is taken out of grocery rows inside the window.
  const window90 = subDays(now, 90);
  const inWindow = (row: Prisma.TransactionCreateManyInput) => new Date(row.timestamp as Date) >= window90;
  const streamingHike = txRows.filter((r) => r.dedupeKey === "seed-stream-3" && inWindow(r)).length * (2199 - 1800);
  let offset = spendWatchRows.filter(inWindow).reduce((sum, r) => sum + r.amountMinor, 0) + streamingHike;
  const groceryRows = txRows.filter((r) => String(r.dedupeKey).startsWith("seed-grocery-") && inWindow(r));
  groceryRows.forEach((row, i) => {
    const share = i === groceryRows.length - 1 ? offset : Math.floor(offset / (groceryRows.length - i));
    row.amountMinor -= share;
    offset -= share;
  });
  txRows.push(...spendWatchRows);

  await prisma.transaction.createMany({ data: txRows });

  // ── Routes and user-entered demo quotes ──────────────────────────────────
  const fastRemit = await prisma.paymentRoute.create({
    data: {
      userId: user.id, name: "FastRemit", providerOrMethod: "FastRemit", originCurrency: "USD",
      destinationCurrency: "USD", payoutMethod: "bank_deposit", routeType: "remittance",
      description: "Synthetic provider quote. Represents a low advertised fee and 4-hour promise.",
      isSynthetic: true,
    },
  });
  const northline = await prisma.paymentRoute.create({
    data: {
      userId: user.id, name: "Northline Bank", providerOrMethod: "Northline", originCurrency: "USD",
      destinationCurrency: "USD", payoutMethod: "bank_deposit", routeType: "bank",
      description: "Synthetic bank transfer quote with a higher fee but reliable delivery.",
      isSynthetic: true,
    },
  });
  const suiRoute = await prisma.paymentRoute.create({
    data: {
      userId: user.id, name: "Sui USDC wallet", providerOrMethod: "Sui direct", originCurrency: "USD",
      destinationCurrency: "USD", payoutMethod: "wallet", routeType: "onchain",
      description: "Synthetic onchain route. Onchain settlement is not proof of recipient withdrawal.",
      isSynthetic: true,
    },
  });
  const remitOne = await prisma.paymentRoute.create({
    data: {
      userId: user.id, name: "RemitOne instant", providerOrMethod: "RemitOne", originCurrency: "USD",
      destinationCurrency: "USD", payoutMethod: "instant", routeType: "remittance",
      description: "Synthetic instant route with a higher fee.",
      isSynthetic: true,
    },
  });

  const nowMinus2d = subDays(now, 2);
  const quoted = [
    {
      routeId: fastRemit.id, sendAmountMinor: 15000, feeMinor: 99, networkFeeMinor: 0,
      exchangeRate: "1", expectedReceivedMinor: 14901, estimatedDeliveryHours: 4,
      source: "demo", evidenceQuality: "user_reported", notes: "Advertised 4-hour delivery, $0.99 headline fee. This quote is synthetic.",
    },
    {
      routeId: northline.id, sendAmountMinor: 15000, feeMinor: 250, networkFeeMinor: 0,
      exchangeRate: "1", expectedReceivedMinor: 14750, estimatedDeliveryHours: 20,
      source: "demo", evidenceQuality: "user_reported", notes: "Synthetic bank quote.",
    },
    {
      routeId: suiRoute.id, sendAmountMinor: 15000, feeMinor: 0, networkFeeMinor: 3,
      exchangeRate: "1", expectedReceivedMinor: 14550, estimatedDeliveryHours: 1,
      source: "demo", evidenceQuality: "user_reported", notes: "Synthetic onchain quote includes a $9 demo withdrawal cost.",
    },
    {
      routeId: remitOne.id, sendAmountMinor: 15000, feeMinor: 699, networkFeeMinor: 0,
      exchangeRate: "1", expectedReceivedMinor: 14301, estimatedDeliveryHours: 1,
      source: "demo", evidenceQuality: "user_reported", notes: "Synthetic instant quote.",
    },
  ];
  for (const q of quoted) {
    await prisma.routeQuote.create({
      data: {
        ...q,
        quotedAt: nowMinus2d,
        expiresAt: addDays(now, 2),
        isSynthetic: true,
      },
    });
  }

  // ── Historical decision 1: the memory-forming mistake ────────────────────
  const decisionAsOf = subDays(now, 9);
  const { snapshot: signatureSnapshot } = await buildDecisionInput({
    userId: user.id,
    decisionType: "send",
    amountMinor: 30000,
    currency: "USD",
    destinationLabel: "my sister",
    destinationCurrency: "USD",
    date: decisionAsOf.toISOString(),
    includeExpectedIncome: true,
  });
  const signatureResult = decide(signatureSnapshot, []);
  const signatureDecision = await prisma.financialDecision.create({
    data: {
      userId: user.id,
      decisionType: "send",
      status: "followed",
      objective: "Send $300 to my sister without missing rent.",
      requestedAmountMinor: 30000,
      currency: "USD",
      inputSnapshot: jsonString(signatureSnapshot),
      calculationVersion: ENGINE_VERSION,
      recommendedAction: jsonString(signatureResult.action),
      baselineAction: jsonString(signatureResult.baselineAction),
      assumptions: jsonString(signatureResult.assumptions),
      memoryReferences: "[]",
      memoryMode: "live",
      predictedOutcome: jsonString(signatureResult.predicted),
      confidence: signatureResult.confidence,
      asOf: decisionAsOf,
      followedAt: subDays(now, 9),
      createdAt: subDays(now, 9),
    },
  });

  const signatureOutcome = await recordOutcome({
    userId: user.id,
    decisionId: signatureDecision.id,
    amountSentMinor: 30000,
    actualFeeMinor: 1480,
    actualReceivedMinor: 28520,
    deliveryHours: 31,
    bufferAfterMinor: 8800,
    billsCovered: false,
    shortfallOccurred: true,
    notes:
      "Synthetic outcome: FastRemit charged $14.80 instead of $0.99, delivered in 31 hours instead of 4, and the salary arrived late. Rent was paid late and only after borrowing.",
    evidenceType: "demo",
  });

  // Confirm the lessons that came from the outcome. They remain local until the
  // Walrus backfill script writes them with real credentials.
  for (const lesson of signatureOutcome.lessons) {
    await prisma.memoryRecord.update({
      where: { id: lesson.id },
      data: {
        verificationStatus: "user_confirmed",
        writeStatus: "blocked",
        writeError: "Walrus Memory is not configured. This is a local rehearsal lesson, not a Mainnet write.",
        source: "local_rehearsal",
        confirmedAt: subDays(now, 8),
        createdAt: subDays(now, 8),
      },
    });
  }

  // ── Additional confirmed lessons (scenarios 3–10) ────────────────────────
  const makeMemory = async (input: {
    category: string; summary: string; lesson: string; rule: unknown; confidence: number;
    daysAgo: number; decisionId?: string | null; conditions?: unknown; original?: string; actual?: string;
    verification?: string; evidenceQuality?: string; writeStatus?: string; supersededBy?: string | null;
  }) => {
    return prisma.memoryRecord.create({
      data: {
        userId: user.id,
        decisionId: input.decisionId ?? signatureDecision.id,
        category: input.category,
        summary: input.summary,
        lesson: input.lesson,
        structuredRule: jsonString(input.rule),
        originalExpectation: input.original ?? null,
        actualOutcome: input.actual ?? null,
        conditions: jsonString(input.conditions ?? {}),
        evidenceRefs: jsonString([signatureDecision.id]),
        confidence: input.confidence,
        evidenceQuality: input.evidenceQuality ?? "user_confirmed",
        verificationStatus: input.verification ?? "user_confirmed",
        namespace: null,
        writeStatus: input.writeStatus ?? "blocked",
        writeError: input.writeStatus === "superseded"
          ? "Superseded by newer evidence; excluded from decisions."
          : "Walrus Memory is not configured. Local rehearsal only.",
        source: "local_rehearsal",
        isSynthetic: true,
        supersededBy: input.supersededBy ?? null,
        createdAt: subDays(now, input.daysAgo),
        confirmedAt: subDays(now, input.daysAgo),
      },
    });
  };

  await makeMemory({
    category: "financial_pattern",
    summary: "Salary has arrived late twice in the last four months, once after rent was due.",
    lesson: "Expected salary is a forecast, not cleared cash. When rent is due within 10 days, exclude expected income from safe-to-move unless it has actually landed.",
    rule: { kind: "EXCLUDE_EXPECTED_INCOME", reliabilityThreshold: 0.7 },
    confidence: 0.82,
    daysAgo: 8,
    conditions: { pattern: "late_income", observedLateArrivals: 2, windowMonths: 4 },
    original: "Salary was expected before rent.",
    actual: "Salary arrived after rent was due; a shortfall occurred.",
  });

  await makeMemory({
    category: "correction",
    summary: "A $300 transfer was too aggressive before rent, even though the simple balance looked sufficient.",
    lesson: "Cap a single discretionary transfer at 50% of safe-to-move when rent is due within 14 days, and split the remainder after confirmed income.",
    rule: { kind: "AMOUNT_CAP", capPercentOfSafe: 0.5 },
    confidence: 0.78,
    daysAgo: 8,
    conditions: { decisionType: "send", daysToRent: 20, corridor: "USD>USD" },
    original: "Predicted buffer after transfer was positive.",
    actual: "Buffer fell to $88 and rent was covered only by borrowing.",
  });

  await makeMemory({
    category: "correction",
    summary: "A single transfer before a large bill should be split into two legs when income is still expected.",
    lesson: "Prefer two smaller transfers around confirmed income instead of one large transfer when near-term obligations are at risk.",
    rule: { kind: "SPLIT_TRANSFER", maxTodayPercent: 0.5 },
    confidence: 0.74,
    daysAgo: 8,
    conditions: { decisionType: "send", incomeExpected: true },
  });

  const fastFee = await makeMemory({
    category: "route_intelligence",
    summary: "FastRemit charged $14.80 against a $0.99 quote on a USD>USD bank deposit.",
    lesson: "FastRemit's headline fee understated the realized cost by $13.81 on this corridor. Compare on realized recipient amount, not the advertised fee.",
    rule: { kind: "ROUTE_PENALTY", match: "FastRemit", scorePenalty: 0.38, feeAdjustmentMinor: 1381 },
    confidence: 0.72,
    daysAgo: 8,
    conditions: { corridor: "USD>USD", payoutMethod: "bank_deposit", amountBand: "medium" },
    original: "Quoted fee $0.99, recipient $299.01.",
    actual: "Fee $14.80, recipient $285.20.",
  });

  await makeMemory({
    category: "route_intelligence",
    summary: "FastRemit delivered in 31 hours despite a 4-hour promise.",
    lesson: "FastRemit's advertised delivery window is unreliable for USD>USD bank deposits. Apply a delivery penalty when timing matters.",
    rule: { kind: "ROUTE_PENALTY", match: "FastRemit", scorePenalty: 0.22, deliveryMultiplier: 7.75 },
    confidence: 0.66,
    daysAgo: 8,
    conditions: { corridor: "USD>USD", payoutMethod: "bank_deposit" },
  });

  await makeMemory({
    category: "route_intelligence",
    summary: "FastRemit's recipient amount was $13.81 below the quote, consistent with an unaccounted payout deduction.",
    lesson: "Expect a recipient-side deduction of roughly 4.6% on FastRemit USD>USD bank deposits. This is one observation, so keep the adjustment conservative.",
    rule: { kind: "PAYOUT_DEDUCTION", match: "FastRemit", observedPercent: 0.046 },
    confidence: 0.55,
    daysAgo: 8,
    conditions: { corridor: "USD>USD", payoutMethod: "bank_deposit", observations: 1 },
  });

  const northlinePreference = await makeMemory({
    category: "route_intelligence",
    summary: "Northline Bank delivered $120 in 19 hours for a $2.50 fee, close to its quoted 20 hours.",
    lesson: "Northline Bank has reliable delivery and exact fees for small USD>USD transfers. A slightly higher fee can be worth it when bill coverage matters.",
    rule: { kind: "ROUTE_PREFERENCE", match: "Northline", scoreBonus: 0.1 },
    confidence: 0.62,
    daysAgo: 20,
    conditions: { corridor: "USD>USD", payoutMethod: "bank_deposit", amountBand: "small" },
    original: "Quoted $2.50 fee and 20 hours.",
    actual: "Observed $2.50 fee and 19 hours.",
  });

  await makeMemory({
    category: "preference",
    summary: "Maya prioritizes guaranteed bill coverage over transfer speed.",
    lesson: "When ranked routes are close, prefer the route with higher observed reliability and a lower realized cost, even if it is slower.",
    rule: { kind: "ROUTE_PREFERENCE", match: "Northline", scoreBonus: 0.05 },
    confidence: 0.9,
    daysAgo: 30,
    conditions: { preference: "coverage_over_speed" },
    verification: "user_confirmed",
    evidenceQuality: "user_confirmed",
  });

  await makeMemory({
    category: "preference",
    summary: "Maya wants at least $150 left after any discretionary transfer.",
    lesson: "Use a $150 buffer floor for discretionary transfers, above the account-level $100 default.",
    rule: { kind: "BUFFER_FLOOR", amountMinor: 15000 },
    confidence: 0.88,
    daysAgo: 30,
    conditions: { preference: "buffer_floor", currency: "USD" },
    verification: "user_confirmed",
  });

  await makeMemory({
    category: "outcome",
    summary: "A $150 savings contribution made three days after rent succeeded without a shortfall.",
    lesson: "Saving after essential bills clear works for this user. Prefer post-rent contribution timing over saving immediately after payday.",
    rule: { kind: "DELAY_REMAINDER", waitForIncome: false },
    confidence: 0.6,
    daysAgo: 24,
    conditions: { decisionType: "save", amountMinor: 15000 },
    original: "Predicted buffer remained above $100.",
    actual: "Buffer remained above target and the contribution was confirmed.",
  });

  await makeMemory({
    category: "route_intelligence",
    summary: "RemitOne introduced a $4 recipient deduction on a $150 instant transfer.",
    lesson: "For RemitOne instant transfers, add a small payout deduction estimate before recommending it as the cheapest option.",
    rule: { kind: "PAYOUT_DEDUCTION", match: "RemitOne", observedPercent: 0.027 },
    confidence: 0.5,
    daysAgo: 16,
    conditions: { corridor: "USD>USD", payoutMethod: "instant", observations: 1 },
  });

  // Scenario 9: an older lesson contradicted by newer evidence.
  const oldBelief = await makeMemory({
    category: "route_intelligence",
    summary: "FastRemit was previously treated as the cheapest USD>USD route based on its headline fee.",
    lesson: "FastRemit's headline fee is the lowest quoted cost.",
    rule: { kind: "ROUTE_PREFERENCE", match: "FastRemit", scoreBonus: 0.12 },
    confidence: 0.4,
    daysAgo: 45,
    conditions: { corridor: "USD>USD" },
    verification: "user_confirmed",
    evidenceQuality: "single_observation",
    writeStatus: "superseded",
  });
  await prisma.memoryRecord.update({
    where: { id: oldBelief.id },
    data: { supersededBy: fastFee.id },
  });

  await makeMemory({
    category: "correction",
    summary: "User corrected LANDED's explanation: the late salary, not the transfer alone, caused the rent shortfall.",
    lesson: "Do not attribute a shortfall solely to transfer size when income timing also changed. Separate amount risk from income-timing risk.",
    rule: { kind: "EXCLUDE_EXPECTED_INCOME", reliabilityThreshold: 0.65 },
    confidence: 0.8,
    daysAgo: 7,
    conditions: { correction: "causality", decisionId: signatureDecision.id },
    verification: "user_confirmed",
    evidenceQuality: "user_confirmed",
  });

  // ── Historical decision 2: a savings contribution that worked ────────────
  const saveAsOf = subDays(now, 25);
  const { snapshot: saveSnapshot } = await buildDecisionInput({
    userId: user.id, decisionType: "save", amountMinor: 15000, currency: "USD",
    date: saveAsOf.toISOString(), includeExpectedIncome: false,
  });
  const saveResult = decide(saveSnapshot, []);
  const saveDecision = await prisma.financialDecision.create({
    data: {
      userId: user.id, decisionType: "save", status: "evaluated",
      objective: "Save $150 this week without risking rent.",
      requestedAmountMinor: 15000, currency: "USD",
      inputSnapshot: jsonString(saveSnapshot), calculationVersion: ENGINE_VERSION,
      recommendedAction: jsonString(saveResult.action), baselineAction: jsonString(saveResult.baselineAction),
      assumptions: jsonString(saveResult.assumptions), memoryReferences: "[]", memoryMode: "live",
      predictedOutcome: jsonString(saveResult.predicted), confidence: saveResult.confidence,
      asOf: saveAsOf, followedAt: saveAsOf, createdAt: saveAsOf,
    },
  });
  await recordOutcome({
    userId: user.id, decisionId: saveDecision.id, amountSentMinor: 15000,
    actualFeeMinor: 0, actualReceivedMinor: 15000, deliveryHours: 0,
    bufferAfterMinor: 240000, billsCovered: true, shortfallOccurred: false,
    notes: "Synthetic confirmed savings contribution; no shortfall.",
    evidenceType: "demo",
  });

  // ── Historical decision 3: Northline route success ──────────────────────
  const northQuote = await prisma.routeQuote.findFirst({ where: { routeId: northline.id } });
  const routeAsOf = subDays(now, 20);
  const { snapshot: routeSnapshot } = await buildDecisionInput({
    userId: user.id, decisionType: "send", amountMinor: 12000, currency: "USD",
    destinationLabel: "my sister", destinationCurrency: "USD",
    date: routeAsOf.toISOString(), includeExpectedIncome: false,
    routeQuoteIds: northQuote ? [northQuote.id] : [],
  });
  const routeResult = decide(routeSnapshot, [{
    id: northlinePreference.id,
    blobId: northlinePreference.walrusBlobId,
    category: northlinePreference.category,
    summary: northlinePreference.summary,
    lesson: northlinePreference.lesson,
    confidence: northlinePreference.confidence,
    verificationStatus: northlinePreference.verificationStatus,
    writeStatus: northlinePreference.writeStatus,
    source: northlinePreference.source,
    createdAt: northlinePreference.createdAt.toISOString(),
    rule: JSON.parse(northlinePreference.structuredRule ?? "null"),
    excluded: northlinePreference.excluded,
    supersededBy: northlinePreference.supersededBy,
  }]);
  const routeDecision = await prisma.financialDecision.create({
    data: {
      userId: user.id, decisionType: "send", status: "evaluated",
      objective: "Send $120 to my sister with reliable delivery.",
      requestedAmountMinor: 12000, currency: "USD",
      inputSnapshot: jsonString(routeSnapshot), calculationVersion: ENGINE_VERSION,
      recommendedAction: jsonString(routeResult.action), baselineAction: jsonString(routeResult.baselineAction),
      assumptions: jsonString(routeResult.assumptions),
      memoryReferences: jsonString([{ memoryId: northlinePreference.id, blobId: null, code: "ROUTE_PREFERENCE", label: "Northline preference" }]),
      memoryMode: "live", predictedOutcome: jsonString(routeResult.predicted),
      confidence: routeResult.confidence, asOf: routeAsOf, followedAt: routeAsOf, createdAt: routeAsOf,
    },
  });
  await recordOutcome({
    userId: user.id, decisionId: routeDecision.id, amountSentMinor: 12000,
    actualFeeMinor: 250, actualReceivedMinor: 11750, deliveryHours: 19,
    bufferAfterMinor: 210000, billsCovered: true, shortfallOccurred: false,
    notes: "Synthetic Northline outcome; fee and delivery close to quote.",
    evidenceType: "demo",
  });

  // ── Historical decision 4: learned rules applied, and they held ─────────
  // Scenario 13: the track record. Lessons that shaped this $100 transfer are
  // judged against its outcome and gain confidence through recordOutcome.
  const heldAsOf = subDays(now, 4);
  const { snapshot: heldSnapshot } = await buildDecisionInput({
    userId: user.id, decisionType: "send", amountMinor: 10000, currency: "USD",
    destinationLabel: "my sister", destinationCurrency: "USD",
    date: heldAsOf.toISOString(), includeExpectedIncome: false,
  });
  const heldMemories = await listActiveRuleMemories(
    user.id,
    ["AMOUNT_CAP", "BUFFER_FLOOR", "RESERVE_COMMITMENT", "EXCLUDE_EXPECTED_INCOME", "SPLIT_TRANSFER", "ROUTE_PENALTY", "ROUTE_PREFERENCE", "PAYOUT_DEDUCTION"],
    heldAsOf,
  );
  const heldResult = decide(heldSnapshot, heldMemories);
  const heldDecision = await prisma.financialDecision.create({
    data: {
      userId: user.id, decisionType: "send", status: "followed",
      objective: "Send $100 to my sister without touching rent money.",
      requestedAmountMinor: 10000, currency: "USD",
      inputSnapshot: jsonString(heldSnapshot), calculationVersion: ENGINE_VERSION,
      recommendedAction: jsonString(heldResult.action), baselineAction: jsonString(heldResult.baselineAction),
      assumptions: jsonString(heldResult.assumptions),
      memoryReferences: jsonString(heldResult.effects.map((e) => ({ memoryId: e.memoryId, blobId: null, code: e.code, label: e.label }))),
      memoryMode: "live", predictedOutcome: jsonString(heldResult.predicted),
      confidence: heldResult.confidence, asOf: heldAsOf, followedAt: heldAsOf, createdAt: heldAsOf,
    },
  });
  await recordOutcome({
    userId: user.id, decisionId: heldDecision.id, amountSentMinor: heldResult.action.amountMinor,
    actualFeeMinor: heldResult.predicted.expectedFeeMinor, actualReceivedMinor: heldResult.predicted.expectedReceivedMinor,
    deliveryHours: heldResult.predicted.expectedDeliveryHours,
    bufferAfterMinor: Math.max(heldResult.predicted.projectedBufferAfterMinor, 15000), billsCovered: true, shortfallOccurred: false,
    notes: "Synthetic outcome: the memory-shaped amount and route arrived as predicted; rent stayed covered.",
    evidenceType: "demo",
  });

  // ── Spend Watch memories (scenarios 11–12) ──────────────────────────────
  // Typed rules the user set earlier; they raise alerts that a no-memory view cannot.
  await prisma.memoryRecord.createMany({
    data: [
      {
        userId: user.id,
        category: "financial_pattern",
        summary: "Approved Streaming bundle at $18.00; flag charges more than 5% above it.",
        lesson: "The user approved Streaming bundle at $18.00 per billing period. A charge above that price is a change the user has not agreed to and should be surfaced.",
        structuredRule: jsonString({ kind: "SUBSCRIPTION_WATCH", merchant: "Streaming bundle", approvedAmountMinor: 1800, currency: "USD", tolerancePercent: 5 }),
        conditions: jsonString({ source: "spend_watch", key: "sub:streaming bundle", currency: "USD" }),
        evidenceRefs: jsonString({ key: "sub:streaming bundle" }),
        confidence: 0.85, evidenceQuality: "user_confirmed", verificationStatus: "user_confirmed",
        writeStatus: "blocked", writeError: "Walrus Memory is not configured. Local rehearsal only.",
        source: "local_rehearsal", isSynthetic: true,
        createdAt: subDays(now, 60), confirmedAt: subDays(now, 60),
      },
      {
        userId: user.id,
        category: "preference",
        summary: "Keep dining at or under $120.00 per month.",
        lesson: "The user set a monthly dining limit of $120.00, based on a usual month of about $90. Warn before a purchase would exceed it and when the month is pacing over it.",
        structuredRule: jsonString({ kind: "SPEND_LIMIT", category: "dining", monthlyLimitMinor: 12000, currency: "USD" }),
        conditions: jsonString({ source: "spend_watch", key: "limit:dining", currency: "USD" }),
        evidenceRefs: jsonString({ key: "limit:dining" }),
        confidence: 0.85, evidenceQuality: "user_confirmed", verificationStatus: "user_confirmed",
        writeStatus: "blocked", writeError: "Walrus Memory is not configured. Local rehearsal only.",
        source: "local_rehearsal", isSynthetic: true,
        createdAt: subDays(now, 34), confirmedAt: subDays(now, 34),
      },
    ],
  });

  // ── Live decision after learning: same $300 ask, changed answer ──────────
  const live = await generateDecision(user.id, {
    decisionType: "send",
    amountMinor: 30000,
    currency: "USD",
    destinationLabel: "my sister",
    destinationCurrency: "USD",
    includeExpectedIncome: false,
    objective: "Can I send $300 to my sister today?",
  });

  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      type: "demo.seeded",
      entity: "User",
      entityId: user.id,
      payload: JSON.stringify({
        accounts: accounts.length,
        memories: await prisma.memoryRecord.count({ where: { userId: user.id } }),
        signatureDecision: signatureDecision.id,
        liveDecision: live.decision.id,
        scenarioCoverage: [
          "late income shortfall", "unexpected transfer fee", "slow route",
          "overlooked recurring bill", "successful savings recommendation",
          "safety buffer preference", "more expensive route wins",
          "user-corrected explanation", "lesson superseded", "memory changes next decision",
          "subscription price above approved", "category pacing over learned limit",
          "lessons judged by a later outcome",
        ],
      }),
    },
  });

  if (process.env.SEED_WALRUS === "true") {
    const confirmed = await prisma.memoryRecord.findMany({
      where: { userId: user.id, verificationStatus: "user_confirmed", writeStatus: "blocked" },
    });
    for (const memory of confirmed) {
      await writeMemoryToWalrus(user.id, memory.id);
    }
  }

  const counts = {
    accounts: await prisma.financialAccount.count({ where: { userId: user.id } }),
    transactions: await prisma.transaction.count({ where: { userId: user.id } }),
    commitments: await prisma.commitment.count({ where: { userId: user.id } }),
    routes: await prisma.paymentRoute.count({ where: { userId: user.id } }),
    decisions: await prisma.financialDecision.count({ where: { userId: user.id } }),
    memories: await prisma.memoryRecord.count({ where: { userId: user.id } }),
    confirmedWalrus: await prisma.memoryRecord.count({ where: { userId: user.id, writeStatus: "confirmed" } }),
  };

  console.log("LANDED demo seeded", {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    ...counts,
    liveRecommendation: live.result.action.amountMinor,
    baseline: live.result.baselineAction.amountMinor,
    walrusConfigured: Boolean(process.env.MEMWAL_PRIVATE_KEY && process.env.MEMWAL_ACCOUNT_ID),
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
