import { z } from "zod";
import { prisma } from "@/server/db";
import { api, ApiError, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { parseAmountToMinor } from "@/lib/money";

const commitmentSchema = z.object({
  name: z.string().min(1).max(80),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().length(3),
  dueDate: z.string(),
  recurrence: z.enum(["none", "weekly", "monthly", "yearly"]).default("none"),
  priority: z.enum(["essential", "important", "discretionary"]).default("essential"),
  notes: z.string().max(300).optional().nullable(),
});

export const GET = api(async () => {
  const user = await requireApiUser();
  const commitments = await prisma.commitment.findMany({
    where: { userId: user.id },
    orderBy: { dueDate: "asc" },
  });
  return { commitments };
});

export const POST = api(async (req) => {
  const user = await requireApiUser();
  const body = await parseBody(req, commitmentSchema);
  const amountMinor = parseAmountToMinor(body.amount, body.currency);
  if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT", "Amount must be positive");
  const dueDate = new Date(body.dueDate);
  if (Number.isNaN(dueDate.getTime())) throw new ApiError(400, "INVALID_DATE", "Due date is invalid");
  const commitment = await prisma.commitment.create({
    data: {
      userId: user.id,
      name: body.name.trim(),
      amountMinor,
      currency: body.currency,
      dueDate,
      recurrence: body.recurrence,
      priority: body.priority,
      notes: body.notes ?? null,
      isSynthetic: user.isDemo,
    },
  });
  return { commitment };
});

export const PATCH = api(async () => {
  throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use /api/commitments/[id]");
});
