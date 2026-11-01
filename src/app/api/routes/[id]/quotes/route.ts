import { z } from "zod";
import { prisma } from "@/server/db";
import { api, ApiError, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { decimalsFor } from "@/lib/money";
import { dateSchema, MAX_STORED_MINOR, parseApiAmount } from "@/server/validation";

const quoteSchema = z.object({
  sendAmount: z.union([z.string(), z.number()]),
  fee: z.union([z.string(), z.number()]).default("0"),
  networkFee: z.union([z.string(), z.number()]).default("0"),
  exchangeRate: z.string().max(40).regex(/^\d+(\.\d+)?$/, "Enter a positive exchange rate")
    .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, "Enter a positive exchange rate").default("1"),
  expectedReceived: z.union([z.string(), z.number()]).optional(),
  estimatedDeliveryHours: z.coerce.number().min(0).max(24 * 30),
  source: z.literal("user_entered").default("user_entered"),
  evidenceQuality: z.literal("user_reported").default("user_reported"),
  expiresAt: dateSchema.optional().nullable(),
  notes: z.string().max(300).optional().nullable(),
});

export const POST = api(async (req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const route = await prisma.paymentRoute.findFirst({ where: { id, userId: user.id } });
  if (!route) throw new ApiError(404, "NOT_FOUND", "Route not found");
  const body = await parseBody(req, quoteSchema);
  const sendAmountMinor = parseApiAmount(body.sendAmount, route.originCurrency);
  if (sendAmountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT", "Send amount must be positive");
  const feeMinor = parseApiAmount(body.fee, route.originCurrency);
  const networkFeeMinor = parseApiAmount(body.networkFee, route.originCurrency);
  let expectedReceivedMinor: number;
  if (body.expectedReceived !== undefined) {
    expectedReceivedMinor = parseApiAmount(body.expectedReceived, route.destinationCurrency);
  } else {
    const scale = 10 ** (decimalsFor(route.destinationCurrency) - decimalsFor(route.originCurrency));
    expectedReceivedMinor = Math.round(Math.max(0, sendAmountMinor - feeMinor - networkFeeMinor) * Number(body.exchangeRate) * scale);
  }
  if (!Number.isSafeInteger(expectedReceivedMinor) || expectedReceivedMinor < 0 || expectedReceivedMinor > MAX_STORED_MINOR) {
    throw new ApiError(400, "INVALID_RECEIVED", "Expected receipt is outside the supported range");
  }
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
      isSynthetic: user.isDemo,
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
  const body = await parseBody(req, z.object({ isActive: z.boolean() }));
  return prisma.paymentRoute.update({
    where: { id: route.id },
    data: { isActive: typeof body.isActive === "boolean" ? body.isActive : route.isActive },
  });
});
