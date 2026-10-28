import { z } from "zod";
import { prisma } from "@/server/db";
import { api, ApiError, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { parseAmountToMinor, applyRate } from "@/lib/money";

const quoteSchema = z.object({
  sendAmount: z.union([z.string(), z.number()]),
  fee: z.union([z.string(), z.number()]).default("0"),
  networkFee: z.union([z.string(), z.number()]).default("0"),
  exchangeRate: z.string().default("1"),
  expectedReceived: z.union([z.string(), z.number()]).optional(),
  estimatedDeliveryHours: z.coerce.number().min(0).max(24 * 30),
  source: z.enum(["user_entered", "provider_api", "demo"]).default("user_entered"),
  evidenceQuality: z.enum(["user_reported", "provider_quote", "verified_outcome"]).default("user_reported"),
  expiresAt: z.string().optional().nullable(),
  notes: z.string().max(300).optional().nullable(),
});

export const POST = api(async (req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const route = await prisma.paymentRoute.findFirst({ where: { id, userId: user.id } });
  if (!route) throw new ApiError(404, "NOT_FOUND", "Route not found");
  const body = await parseBody(req, quoteSchema);
  const sendAmountMinor = parseAmountToMinor(body.sendAmount, route.originCurrency);
  if (sendAmountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT", "Send amount must be positive");
  const feeMinor = parseAmountToMinor(body.fee, route.originCurrency);
  const networkFeeMinor = parseAmountToMinor(body.networkFee, route.originCurrency);
  let expectedReceivedMinor: number;
  if (body.expectedReceived !== undefined) {
    expectedReceivedMinor = parseAmountToMinor(body.expectedReceived, route.destinationCurrency);
  } else {
    expectedReceivedMinor = applyRate(Math.max(0, sendAmountMinor - feeMinor - networkFeeMinor), body.exchangeRate);
  }
  if (expectedReceivedMinor < 0) throw new ApiError(400, "INVALID_RECEIVED", "Expected received cannot be negative");
  const quote = await prisma.routeQuote.create({
    data: {
      routeId: route.id,
      sendAmountMinor,
      feeMinor,
      networkFeeMinor,
      exchangeRate: body.exchangeRate,
      expectedReceivedMinor,
      estimatedDeliveryHours: Math.round(body.estimatedDeliveryHours),
      source: body.source,
      evidenceQuality: body.evidenceQuality,
      quotedAt: new Date(),
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      isSynthetic: body.source === "demo" || user.isDemo,
      notes: body.notes ?? null,
    },
  });
  return { quote };
});

export const PATCH = api(async (req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const route = await prisma.paymentRoute.findFirst({ where: { id, userId: user.id } });
  if (!route) throw new ApiError(404, "NOT_FOUND", "Route not found");
  const body = await req.json().catch(() => ({}));
  return prisma.paymentRoute.update({
    where: { id: route.id },
    data: { isActive: typeof body.isActive === "boolean" ? body.isActive : route.isActive },
  });
});
