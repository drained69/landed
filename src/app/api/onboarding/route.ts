import { z } from "zod";
import { api, ApiError, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { parseAmountToMinor } from "@/lib/money";
import { completeOnboarding } from "@/server/services/starter";
import { prisma } from "@/server/db";

const schema = z.object({
  currency: z.string().length(3).default("USD"),
  objective: z.string().min(1).max(200),
  startingBalance: z.union([z.string(), z.number()]).default("0"),
  obligations: z.array(z.object({
    name: z.string().min(1).max(80),
    amount: z.union([z.string(), z.number()]),
    dueDate: z.string(),
    priority: z.enum(["essential", "important", "discretionary"]).default("essential"),
  })).max(20).default([]),
  safetyBuffer: z.union([z.string(), z.number()]).default("100"),
  riskPosture: z.enum(["cautious", "balanced", "flexible"]).default("balanced"),
  includeExampleData: z.boolean().default(false),
});

export const POST = api(async (req) => {
  const user = await requireApiUser();
  const body = await parseBody(req, schema);
  let startingBalanceMinor = 0;
  let safetyBufferMinor = 0;
  try {
    startingBalanceMinor = parseAmountToMinor(body.startingBalance, body.currency);
    safetyBufferMinor = parseAmountToMinor(body.safetyBuffer, body.currency);
  } catch (error) {
    throw new ApiError(400, "INVALID_AMOUNT", error instanceof Error ? error.message : "Invalid amount");
  }
  if (startingBalanceMinor < 0 || safetyBufferMinor < 0) {
    throw new ApiError(400, "INVALID_AMOUNT", "Balances and buffers cannot be negative");
  }
  const obligations = body.obligations.map((o) => ({
    name: o.name.trim(),
    amountMinor: parseAmountToMinor(o.amount, body.currency),
    dueDate: new Date(o.dueDate),
    priority: o.priority,
  })).filter((o) => o.amountMinor > 0 && !Number.isNaN(o.dueDate.getTime()));

  const result = await completeOnboarding(user.id, {
    currency: body.currency,
    objective: body.objective,
    startingBalanceMinor,
    obligations,
    safetyBufferMinor,
    riskPosture: body.riskPosture,
    includeExampleData: body.includeExampleData,
  });
  await prisma.auditEvent.create({
    data: { userId: user.id, type: "onboarding.api", entity: "User", entityId: user.id },
  });
  return result;
});
