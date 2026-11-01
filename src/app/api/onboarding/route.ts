import { currencySchema } from "@/server/validation";
import { z } from "zod";
import { api, ApiError, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { dateSchema, parseApiAmount } from "@/server/validation";
import { completeOnboarding } from "@/server/services/starter";
import { prisma } from "@/server/db";

const schema = z.object({
  currency: currencySchema.default("USD"),
  objective: z.string().trim().min(1).max(200),
  startingBalance: z.union([z.string(), z.number()]).default("0"),
  obligations: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    amount: z.union([z.string(), z.number()]),
    dueDate: dateSchema,
    priority: z.enum(["essential", "important", "discretionary"]).default("essential"),
    recurrence: z.enum(["none", "weekly", "monthly", "yearly"]).default("monthly"),
  })).max(20).default([]),
  safetyBuffer: z.union([z.string(), z.number()]).default("100"),
  riskPosture: z.enum(["cautious", "balanced", "flexible"]).default("balanced"),
  income: z.object({
    label: z.string().trim().min(1).max(60),
    amount: z.union([z.string(), z.number()]),
    lastReceived: dateSchema,
    cadence: z.enum(["weekly", "biweekly", "monthly"]),
  }).optional(),
});

const CADENCE_DAYS = { weekly: 7, biweekly: 14, monthly: 30 } as const;

export const POST = api(async (req) => {
  const user = await requireApiUser();
  if (user.onboardingComplete) throw new ApiError(409, "ALREADY_ONBOARDED", "Setup is already complete. Update your information in Settings.");
  const body = await parseBody(req, schema);
  let startingBalanceMinor = 0;
  let safetyBufferMinor = 0;
  try {
    startingBalanceMinor = parseApiAmount(body.startingBalance, body.currency);
    safetyBufferMinor = parseApiAmount(body.safetyBuffer, body.currency);
  } catch (error) {
    throw new ApiError(400, "INVALID_AMOUNT", error instanceof Error ? error.message : "Invalid amount");
  }
  if (startingBalanceMinor < 0 || safetyBufferMinor < 0) {
    throw new ApiError(400, "INVALID_AMOUNT", "Balances and buffers cannot be negative");
  }
  const obligations = body.obligations.map((o) => ({
    name: o.name.trim(),
    amountMinor: parseApiAmount(o.amount, body.currency, 1),
    dueDate: new Date(o.dueDate),
    priority: o.priority,
    recurrence: o.recurrence,
  }));

  let income: { label: string; amountMinor: number; receivedAt: Date; cadenceDays: number } | null = null;
  if (body.income) {
    const amountMinor = parseApiAmount(body.income.amount, body.currency);
    const receivedAt = new Date(body.income.lastReceived);
    if (amountMinor <= 0 || Number.isNaN(receivedAt.getTime()) || receivedAt.getTime() > Date.now() + 86_400_000) {
      throw new ApiError(400, "INVALID_INCOME", "Enter the amount and date of a paycheck you have already received");
    }
    income = { label: body.income.label, amountMinor, receivedAt, cadenceDays: CADENCE_DAYS[body.income.cadence] };
  }

  const result = await completeOnboarding(user.id, {
    currency: body.currency,
    objective: body.objective,
    startingBalanceMinor,
    obligations,
    safetyBufferMinor,
    riskPosture: body.riskPosture,
    income,
  });
  await prisma.auditEvent.create({
    data: { userId: user.id, type: "onboarding.api", entity: "User", entityId: user.id },
  });
  return result;
});
