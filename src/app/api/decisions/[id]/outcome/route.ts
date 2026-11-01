import { after } from "next/server";
import { z } from "zod";
import { api, ApiError, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { parseApiAmount } from "@/server/validation";
import { recordOutcome } from "@/server/services/decisions";
import { prisma } from "@/server/db";
import { getTransactionEvidence } from "@/server/services/tatum";
import { flushLessonUpdates } from "@/server/services/memory";

const schema = z.object({
  amountSent: z.union([z.string(), z.number()]).optional(),
  actualFee: z.union([z.string(), z.number()]).optional(),
  actualReceived: z.union([z.string(), z.number()]).optional(),
  deliveryHours: z.coerce.number().min(0).max(24 * 60).optional(),
  bufferAfter: z.union([z.string(), z.number()]).optional(),
  billsCovered: z.boolean().optional(),
  shortfallOccurred: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
  transactionDigest: z.string().max(200).optional().nullable(),
  evidenceType: z.enum(["user_confirmed", "onchain_verified", "demo"]).optional(),
});

export const POST = api(async (req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const decision = await prisma.financialDecision.findFirst({ where: { id, userId: user.id } });
  if (!decision) throw new ApiError(404, "NOT_FOUND", "Decision not found");
  const body = await parseBody(req, schema);

  const recommended = JSON.parse(decision.recommendedAction) as { amountMinor: number; currency: string };
  const amountSentMinor = body.amountSent !== undefined
    ? parseApiAmount(body.amountSent, decision.currency)
    : recommended.amountMinor;
  if (amountSentMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT", "Amount sent must be greater than zero");
  const actualFeeMinor = body.actualFee !== undefined ? parseApiAmount(body.actualFee, decision.currency) : null;
  const destinationCurrency = (JSON.parse(decision.inputSnapshot) as { destinationCurrency: string }).destinationCurrency;
  const actualReceivedMinor = body.actualReceived !== undefined
    ? parseApiAmount(body.actualReceived, destinationCurrency)
    : null;
  const bufferAfterMinor = body.bufferAfter !== undefined ? parseApiAmount(body.bufferAfter, decision.currency, -2_147_483_647) : null;

  // "Onchain verified" is a server-side claim, never a client one: the digest is
  // re-read through Tatum here, and a failed transaction is refused outright.
  const digest = body.transactionDigest?.trim() || null;
  let evidenceType: string | undefined = body.evidenceType === "onchain_verified" ? "user_confirmed" : body.evidenceType;
  if (digest) {
    const evidence = await getTransactionEvidence(digest);
    if (evidence.status !== "success") {
      throw new ApiError(409, "ONCHAIN_NOT_SUCCESS", `Sui transaction ${digest} is ${evidence.status}; it cannot back a settled outcome.`);
    }
    evidenceType = "onchain_verified";
  }

  const result = await recordOutcome({
    userId: user.id,
    decisionId: id,
    amountSentMinor,
    actualFeeMinor,
    actualReceivedMinor,
    deliveryHours: body.deliveryHours ?? null,
    bufferAfterMinor,
    billsCovered: body.billsCovered ?? null,
    shortfallOccurred: body.shortfallOccurred ?? null,
    notes: body.notes ?? null,
    transactionDigest: digest,
    evidenceType,
  });
  // Track-record verdicts become append-only Walrus updates; never block the response.
  after(() => flushLessonUpdates(user.id).catch(() => undefined));
  return result;
});
