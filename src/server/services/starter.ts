import { prisma } from "@/server/db";

export interface OnboardingInput {
  currency: string;
  objective: string;
  startingBalanceMinor: number;
  obligations: { name: string; amountMinor: number; dueDate: Date; priority: string; recurrence: string }[];
  safetyBufferMinor: number;
  riskPosture: string;
  /** The most recent paycheck actually received; its cadence lets LANDED forecast the next one. */
  income?: { label: string; amountMinor: number; receivedAt: Date; cadenceDays: number } | null;
}

/**
 * Turn onboarding answers into the person's own records. Nothing synthetic is
 * created for a real account: the demo account is where example data lives.
 */
export async function completeOnboarding(userId: string, input: OnboardingInput) {
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
        name: "Everyday account",
        accountType: "bank",
        provider: "Self-reported",
        currency: input.currency,
        balanceMinor: input.startingBalanceMinor,
        balanceSource: "manual",
        verificationStatus: "user_confirmed",
        isLiquid: true,
        includeInSafeToMove: true,
        notes: "Balance entered during onboarding. Update it, import a CSV, or sync a Sui wallet any time.",
      },
    });
  }

  if (input.income) {
    const account = await prisma.financialAccount.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
    await prisma.transaction.create({
      data: {
        userId,
        accountId: account?.id ?? null,
        amountMinor: input.income.amountMinor,
        currency: input.currency,
        direction: "in",
        category: "income",
        merchant: input.income.label,
        description: "Most recent paycheck (entered during onboarding)",
        timestamp: input.income.receivedAt,
        source: "manual",
        status: "posted",
        verificationStatus: "user_confirmed",
        dedupeKey: `onboarding-income-${userId}`,
        metadata: JSON.stringify({ cadenceDays: input.income.cadenceDays }),
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
        recurrence: obligation.recurrence,
        priority: obligation.priority,
        status: "upcoming",
      },
    });
  }

  if (input.safetyBufferMinor > 0) {
    const hasGoal = await prisma.savingsGoal.count({ where: { userId } });
    if (hasGoal === 0) {
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
  }

  await prisma.auditEvent.create({
    data: {
      userId,
      type: "onboarding.completed",
      entity: "User",
      entityId: userId,
      payload: JSON.stringify({ currency: input.currency, obligations: input.obligations.length }),
    },
  });

  return { ok: true };
}
