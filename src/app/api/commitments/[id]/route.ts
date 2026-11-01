import { z } from "zod";
import { prisma } from "@/server/db";
import { api, ApiError, assertOwned, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { dateSchema, parseApiAmount } from "@/server/validation";
import { nextOccurrence } from "@/lib/dates";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  dueDate: dateSchema.optional(),
  recurrence: z.enum(["none", "weekly", "monthly", "yearly"]).optional(),
  priority: z.enum(["essential", "important", "discretionary"]).optional(),
  status: z.enum(["upcoming", "paid", "skipped"]).optional(),
  notes: z.string().max(300).optional().nullable(),
});

export const PATCH = api(async (req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const commitment = assertOwned(await prisma.commitment.findFirst({ where: { id, userId: user.id } }), user.id);
  const body = await parseBody(req, patchSchema);
  const updated = await prisma.commitment.update({
    where: { id: commitment.id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.amount !== undefined ? { amountMinor: parseApiAmount(body.amount, commitment.currency, 1) } : {}),
      ...(body.dueDate !== undefined ? { dueDate: new Date(body.dueDate) } : {}),
      ...(body.recurrence !== undefined ? { recurrence: body.recurrence } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    },
  });
  return { commitment: updated };
});

export const POST = api(async (req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const commitment = assertOwned(await prisma.commitment.findFirst({ where: { id, userId: user.id } }), user.id);
  const body = await parseBody(req, z.object({ accountId: z.string().optional().nullable() }));
  const accountId = body.accountId ?? null;
  if (accountId) {
    assertOwned(await prisma.financialAccount.findFirst({ where: { id: accountId, userId: user.id } }), user.id);
  }
  if (commitment.status === "paid") throw new ApiError(409, "ALREADY_PAID", "This commitment is already marked paid");
  const nextCommitment = await prisma.$transaction(async (tx) => {
    const claimed = await tx.commitment.updateMany({
      where: { id: commitment.id, userId: user.id, status: { not: "paid" } },
      data: { status: "paid" },
    });
    if (claimed.count !== 1) throw new ApiError(409, "ALREADY_PAID", "This commitment is already marked paid");
    await tx.transaction.create({
      data: {
        userId: user.id,
        accountId,
        amountMinor: commitment.amountMinor,
        currency: commitment.currency,
        direction: "out",
        category: "bills",
        merchant: commitment.name,
        description: `Paid ${commitment.name}`,
        timestamp: new Date(),
        source: user.isDemo ? "demo" : "manual",
        status: "posted",
        verificationStatus: "user_confirmed",
        dedupeKey: `bill:${commitment.id}`,
      },
    });
  const next = nextOccurrence(commitment.dueDate, commitment.recurrence);
  if (next) {
    return tx.commitment.create({
      data: {
        userId: user.id,
        name: commitment.name,
        amountMinor: commitment.amountMinor,
        currency: commitment.currency,
        dueDate: next,
        recurrence: commitment.recurrence,
        priority: commitment.priority,
        status: "upcoming",
        notes: commitment.notes,
        isSynthetic: commitment.isSynthetic,
      },
    });
  }
    return null;
  });
  return { ok: true, nextCommitment };
});

export const DELETE = api(async (_req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const commitment = assertOwned(await prisma.commitment.findFirst({ where: { id, userId: user.id } }), user.id);
  await prisma.commitment.delete({ where: { id: commitment.id } });
  return { ok: true };
});
