import { currencySchema } from "@/server/validation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { api, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";

const routeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  providerOrMethod: z.string().trim().min(1).max(80),
  originCurrency: currencySchema,
  destinationCurrency: currencySchema,
  payoutMethod: z.enum(["bank_deposit", "wallet", "cash_pickup", "mobile_money", "instant"]),
  routeType: z.enum(["onchain", "bank", "remittance", "mobile_money", "cash"]),
  description: z.string().max(300).optional().nullable(),
});

export const GET = api(async () => {
  const user = await requireApiUser();
  const routes = await prisma.paymentRoute.findMany({
    where: { userId: user.id },
    include: { quotes: { orderBy: { quotedAt: "desc" }, take: 3 } },
    orderBy: { createdAt: "asc" },
  });
  return { routes };
});

export const POST = api(async (req) => {
  const user = await requireApiUser();
  const body = await parseBody(req, routeSchema);
  const route = await prisma.paymentRoute.create({
    data: {
      userId: user.id,
      name: body.name.trim(),
      providerOrMethod: body.providerOrMethod.trim(),
      originCurrency: body.originCurrency,
      destinationCurrency: body.destinationCurrency,
      payoutMethod: body.payoutMethod,
      routeType: body.routeType,
      description: body.description ?? null,
      isSynthetic: user.isDemo,
    },
  });
  return { route };
});
