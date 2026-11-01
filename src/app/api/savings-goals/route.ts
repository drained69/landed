import { currencySchema } from "@/server/validation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { api, ApiError, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { dateSchema, parseApiAmount } from "@/server/validation";

const goalSchema = z.object({
  name: z.string().trim().min(1).max(80),
  target: z.union([z.string(), z.number()]),
  current: z.union([z.string(), z.number()]).default("0"),
  currency: currencySchema,
  targetDate: dateSchema.optional().nullable(),
  monthlyContribution: z.union([z.string(), z.number()]).default("0"),
  priority: z.enum(["essential", "important", "discretionary"]).default("important"),
});

export const GET = api(async () => {
  const user = await requireApiUser();
  const goals = await prisma.savingsGoal.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  return { goals };
});

export const POST = api(async (req) => {
  const user = await requireApiUser();
  const body = await parseBody(req, goalSchema);
  const targetMinor = parseApiAmount(body.target, body.currency);
  const currentMinor = parseApiAmount(body.current, body.currency);
  const monthlyContributionMinor = parseApiAmount(body.monthlyContribution, body.currency);
  if (targetMinor <= 0) throw new ApiError(400, "INVALID_TARGET", "Target must be greater than zero");
  const goal = await prisma.savingsGoal.create({
    data: {
      userId: user.id,
      name: body.name.trim(),
      targetMinor,
      currentMinor,
      currency: body.currency,
      targetDate: body.targetDate ? new Date(body.targetDate) : null,
      monthlyContributionMinor,
      priority: body.priority,
      isSynthetic: user.isDemo,
    },
  });
  return { goal };
});
