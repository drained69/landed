import { currencySchema } from "@/server/validation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { api, ApiError, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { parseApiAmount } from "@/server/validation";
import { jsonString } from "@/server/db";

const accountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  accountType: z.enum(["bank", "cash", "wallet", "stablecoin", "savings"]),
  provider: z.string().max(80).optional().nullable(),
  currency: currencySchema,
  balance: z.union([z.string(), z.number()]),
  isLiquid: z.boolean().default(true),
  includeInSafeToMove: z.boolean().default(true),
  notes: z.string().max(500).optional().nullable(),
});

export const GET = api(async () => {
  const user = await requireApiUser();
  const accounts = await prisma.financialAccount.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  return { accounts };
});

export const POST = api(async (req) => {
  const user = await requireApiUser();
  const body = await parseBody(req, accountSchema);
  const balanceMinor = parseApiAmount(body.balance, body.currency);
  if (balanceMinor < 0) throw new ApiError(400, "INVALID_BALANCE", "A balance cannot be negative");
  const existing = await prisma.financialAccount.findUnique({
    where: { userId_name: { userId: user.id, name: body.name.trim() } },
  });
  if (existing) throw new ApiError(409, "ACCOUNT_EXISTS", "An account with that name already exists");
  const account = await prisma.financialAccount.create({
    data: {
      userId: user.id,
      name: body.name.trim(),
      accountType: body.accountType,
      provider: body.provider ?? null,
      currency: body.currency,
      balanceMinor,
      isLiquid: body.isLiquid,
      includeInSafeToMove: body.includeInSafeToMove,
      balanceSource: "manual",
      verificationStatus: "user_confirmed",
      notes: body.notes ?? null,
    },
  });
  await prisma.auditEvent.create({
    data: { userId: user.id, type: "account.created", entity: "FinancialAccount", entityId: account.id, payload: jsonString({ currency: account.currency, balanceMinor }) },
  });
  return { account };
});
