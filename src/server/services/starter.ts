import { addDays, addMonths, subDays } from "date-fns";
import { prisma } from "@/server/db";

export interface OnboardingInput {
  currency: string;
  objective: string;
  startingBalanceMinor: number;
  obligations: { name: string; amountMinor: number; dueDate: Date; priority: string }[];
  safetyBufferMinor: number;
  riskPosture: string;
  includeExampleData: boolean;
}

export async function completeOnboarding(userId: string, input: OnboardingInput) {
  const now = new Date();

  await prisma.user.update({
    where: { id: userId },
    data: {
      preferredCurrency: input.currency,
      mainObjective: input.objective,
      safetyBufferMinor: input.safetyBufferMinor,
      riskPosture: input.riskPosture,
      onboardingComplete: true,
    },
  });

  const existing = await prisma.financialAccount.count({ where: { userId } });
  if (existing === 0) {
    await prisma.financialAccount.create({
      data: {
        userId,
        name: input.includeExampleData ? "Example · Everyday account" : "Everyday account",
        accountType: "bank",
        provider: "Self-reported",
        currency: input.currency,
        balanceMinor: input.startingBalanceMinor,
        balanceSource: input.includeExampleData ? "demo" : "manual",
        verificationStatus: "user_confirmed",
        isLiquid: true,
        includeInSafeToMove: true,
        isSynthetic: input.includeExampleData,
        notes: input.includeExampleData
          ? "Synthetic example account created during onboarding. Clearly labelled, not a bank connection."
          : "Manually entered balance.",
      },
    });
  }

  for (const obligation of input.obligations) {
    if (!obligation.name || obligation.amountMinor <= 0) continue;
    await prisma.commitment.create({
      data: {
        userId,
        name: obligation.name,
        amountMinor: obligation.amountMinor,
        currency: input.currency,
        dueDate: obligation.dueDate,
        recurrence: "none",
        priority: obligation.priority,
        status: "upcoming",
        isSynthetic: input.includeExampleData,
      },
    });
  }

  if (input.includeExampleData) {
    await prisma.financialAccount.createMany({
      data: [
        {
          userId,
          name: "Example · Cash",
          accountType: "cash",
          provider: "Self-reported",
          currency: input.currency,
          balanceMinor: 22000,
          balanceSource: "demo",
          verificationStatus: "user_confirmed",
          isLiquid: true,
          isSynthetic: true,
        },
        {
          userId,
          name: "Example · Emergency savings",
          accountType: "savings",
          provider: "Self-reported",
          currency: input.currency,
          balanceMinor: 120000,
          balanceSource: "demo",
          verificationStatus: "user_confirmed",
          isLiquid: false,
          isSynthetic: true,
        },
      ],
    });

    const examples = [
      { name: "Example · Rent", amountMinor: 145000, days: 6, priority: "essential" },
      { name: "Example · Internet", amountMinor: 6500, days: 9, priority: "essential" },
      { name: "Example · Phone", amountMinor: 4500, days: 12, priority: "important" },
      { name: "Example · Streaming", amountMinor: 1800, days: 3, priority: "discretionary" },
    ];
    for (const e of examples) {
      await prisma.commitment.create({
        data: {
          userId,
          name: e.name,
          amountMinor: e.amountMinor,
          currency: input.currency,
          dueDate: addDays(now, e.days),
          recurrence: e.name.includes("Streaming") ? "monthly" : "none",
          priority: e.priority,
          status: "upcoming",
          isSynthetic: true,
        },
      });
    }

    await prisma.savingsGoal.createMany({
      data: [
        {
          userId,
          name: "Example · Emergency fund",
          targetMinor: 600000,
          currentMinor: 120000,
          currency: input.currency,
          targetDate: addMonths(now, 10),
          monthlyContributionMinor: 25000,
          priority: "essential",
          isSynthetic: true,
        },
      ],
    });

    const income = [320000, 320000, 335000];
    for (let i = 0; i < 3; i++) {
      const date = subDays(now, 8 + i * 30);
      await prisma.transaction.create({
        data: {
          userId,
          amountMinor: income[i],
          currency: input.currency,
          direction: "in",
          category: "income",
          merchant: "Example · Salary",
          description: "Synthetic salary for demonstration",
          timestamp: date,
          source: "demo",
          status: "posted",
          verificationStatus: "user_confirmed",
          isSynthetic: true,
          dedupeKey: `onboarding-income-${userId}-${i}`,
        },
      });
      await prisma.transaction.create({
        data: {
          userId,
          amountMinor: 145000,
          currency: input.currency,
          direction: "out",
          category: "housing",
          merchant: "Example · Rent",
          description: "Synthetic rent payment",
          timestamp: subDays(now, 5 + i * 30),
          source: "demo",
          status: "posted",
          verificationStatus: "user_confirmed",
          isSynthetic: true,
          dedupeKey: `onboarding-rent-${userId}-${i}`,
        },
      });
    }

    const route = await prisma.paymentRoute.create({
      data: {
        userId,
        name: "Example · Bank transfer",
        providerOrMethod: "Example Bank",
        originCurrency: input.currency,
        destinationCurrency: input.currency,
        payoutMethod: "bank_deposit",
        routeType: "bank",
        description: "Synthetic route quote for the planner. Not a live provider price.",
        isSynthetic: true,
      },
    });
    await prisma.routeQuote.create({
      data: {
        routeId: route.id,
        sendAmountMinor: 15000,
        feeMinor: 250,
        networkFeeMinor: 0,
        exchangeRate: "1",
        expectedReceivedMinor: 14750,
        estimatedDeliveryHours: 24,
        source: "demo",
        evidenceQuality: "user_reported",
        isSynthetic: true,
        notes: "Synthetic quote. Replace with a real provider quote.",
      },
    });
  } else {
    await prisma.savingsGoal.create({
      data: {
        userId,
        name: "Emergency fund",
        targetMinor: input.safetyBufferMinor * 3,
        currentMinor: 0,
        currency: input.currency,
        monthlyContributionMinor: Math.round(input.safetyBufferMinor * 0.2),
        priority: "essential",
      },
    });
  }

  await prisma.auditEvent.create({
    data: {
      userId,
      type: "onboarding.completed",
      entity: "User",
      entityId: userId,
      payload: JSON.stringify({ includeExampleData: input.includeExampleData, currency: input.currency }),
    },
  });

  return { ok: true, includeExampleData: input.includeExampleData };
}
