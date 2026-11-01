import { currencySchema } from "@/server/validation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { api, ApiError, assertOwned, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { dateSchema, parseLimit, parseApiAmount } from "@/server/validation";

const transactionSchema = z.object({
  accountId: z.string().optional().nullable(),
  amount: z.union([z.string(), z.number()]),
  currency: currencySchema,
  direction: z.enum(["in", "out"]),
  category: z.string().trim().min(1).max(60).default("uncategorized"),
  merchant: z.string().max(120).optional().nullable(),
  description: z.string().max(300).optional().nullable(),
  date: dateSchema.optional(),
  status: z.enum(["pending", "posted"]).default("posted"),
});

export const GET = api(async (req) => {
  const user = await requireApiUser();
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"), 100, 500);
  const direction = searchParams.get("direction");
  const category = searchParams.get("category");
  const transactions = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      ...(direction === "in" || direction === "out" ? { direction } : {}),
      ...(category ? { category } : {}),
    },
    orderBy: { timestamp: "desc" },
    take: limit,
    include: { account: { select: { id: true, name: true, verificationStatus: true } } },
  });
  return { transactions };
});

export const POST = api(async (req) => {
  const user = await requireApiUser();
  const body = await parseBody(req, transactionSchema);
  if (body.accountId) {
    assertOwned(await prisma.financialAccount.findFirst({ where: { id: body.accountId, userId: user.id } }), user.id);
  }
  const amountMinor = parseApiAmount(body.amount, body.currency);
  if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT", "Amount must be greater than zero");
  const transaction = await prisma.transaction.create({
    data: {
      userId: user.id,
      accountId: body.accountId ?? null,
      amountMinor,
      currency: body.currency,
      direction: body.direction,
      category: body.category,
      merchant: body.merchant ?? null,
      description: body.description ?? null,
      timestamp: body.date ? new Date(body.date) : new Date(),
      source: user.isDemo ? "demo" : "manual",
      status: body.status,
      verificationStatus: "user_confirmed",
      dedupeKey: `manual:${crypto.randomUUID()}`,
    },
  });
  return { transaction };
});
