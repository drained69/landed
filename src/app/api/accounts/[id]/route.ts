import { z } from "zod";
import { prisma } from "@/server/db";
import { api, assertOwned, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { parseAmountToMinor } from "@/lib/money";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  balance: z.union([z.string(), z.number()]).optional(),
  isLiquid: z.boolean().optional(),
  includeInSafeToMove: z.boolean().optional(),
  verificationStatus: z.enum(["unverified", "user_confirmed", "verified_onchain"]).optional(),
  notes: z.string().max(500).optional().nullable(),
});

export const PATCH = api(async (req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const account = assertOwned(
    await prisma.financialAccount.findFirst({ where: { id, userId: user.id } }),
    user.id,
  );
  const body = await parseBody(req, patchSchema);
  const updated = await prisma.financialAccount.update({
    where: { id: account.id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.balance !== undefined ? { balanceMinor: parseAmountToMinor(body.balance, account.currency) } : {}),
      ...(body.isLiquid !== undefined ? { isLiquid: body.isLiquid } : {}),
      ...(body.includeInSafeToMove !== undefined ? { includeInSafeToMove: body.includeInSafeToMove } : {}),
      ...(body.verificationStatus !== undefined ? { verificationStatus: body.verificationStatus } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      balanceSource: body.balance !== undefined ? "manual" : account.balanceSource,
    },
  });
  return { account: updated };
});

export const DELETE = api(async (_req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const account = assertOwned(
    await prisma.financialAccount.findFirst({ where: { id, userId: user.id } }),
    user.id,
  );
  await prisma.financialAccount.delete({ where: { id: account.id } });
  return { ok: true };
});
