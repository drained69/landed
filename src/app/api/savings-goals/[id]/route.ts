import { z } from "zod";
import { prisma } from "@/server/db";
import { api, ApiError, assertOwned, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { parseAmountToMinor } from "@/lib/money";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  target: z.union([z.string(), z.number()]).optional(),
  targetDate: z.string().optional().nullable(),
  monthlyContribution: z.union([z.string(), z.number()]).optional(),
  priority: z.enum(["essential", "important", "discretionary"]).optional(),
  status: z.enum(["active", "achieved", "paused"]).optional(),
});

export const PATCH = api(async (req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const goal = assertOwned(await prisma.savingsGoal.findFirst({ where: { id, userId: user.id } }), user.id);
  const body = await parseBody(req, patchSchema);
  const updated = await prisma.savingsGoal.update({
    where: { id: goal.id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.target !== undefined ? { targetMinor: parseAmountToMinor(body.target, goal.currency) } : {}),
      ...(body.targetDate !== undefined ? { targetDate: body.targetDate ? new Date(body.targetDate) : null } : {}),
      ...(body.monthlyContribution !== undefined ? { monthlyContributionMinor: parseAmountToMinor(body.monthlyContribution, goal.currency) } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    },
  });
  return { goal: updated };
});

const contributeSchema = z.object({ amount: z.union([z.string(), z.number()]), accountId: z.string().optional().nullable() });

export const POST = api(async (req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const goal = assertOwned(await prisma.savingsGoal.findFirst({ where: { id, userId: user.id } }), user.id);
  const body = await parseBody(req, contributeSchema);
  const amount = parseAmountToMinor(body.amount, goal.currency);
  if (amount <= 0) throw new ApiError(400, "INVALID_AMOUNT", "Contribution must be positive");
  if (body.accountId) {
    assertOwned(await prisma.financialAccount.findFirst({ where: { id: body.accountId, userId: user.id } }), user.id);
  }
  const newTotal = goal.currentMinor + amount;
  const updated = await prisma.savingsGoal.update({
    where: { id: goal.id },
    data: {
      currentMinor: newTotal,
      status: newTotal >= goal.targetMinor ? "achieved" : goal.status,
    },
  });
  await prisma.transaction.create({
    data: {
      userId: user.id,
      accountId: body.accountId ?? null,
      amountMinor: amount,
      currency: goal.currency,
      direction: "out",
      category: "savings",
      merchant: goal.name,
      description: `Contribution to ${goal.name}`,
      timestamp: new Date(),
      source: user.isDemo ? "demo" : "manual",
      status: "posted",
      verificationStatus: "user_confirmed",
      dedupeKey: `savings:${crypto.randomUUID()}`,
    },
  });
  return { goal: updated };
});

export const DELETE = api(async (_req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const goal = assertOwned(await prisma.savingsGoal.findFirst({ where: { id, userId: user.id } }), user.id);
  await prisma.savingsGoal.delete({ where: { id: goal.id } });
  return { ok: true };
});
