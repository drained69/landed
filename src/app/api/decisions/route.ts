import { api, ApiError, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { decisionRequestSchema } from "@/lib/types";
import { parseAmountToMinor } from "@/lib/money";
import { generateDecision, listDecisions } from "@/server/services/decisions";

export const GET = api(async (req) => {
  const user = await requireApiUser();
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
  return { decisions: await listDecisions(user.id, limit) };
});

export const POST = api(async (req) => {
  const user = await requireApiUser();
  const body = await parseBody(req, decisionRequestSchema);
  let amountMinor: number | null = null;
  if (body.amount !== undefined && body.amount !== "") {
    try {
      amountMinor = parseAmountToMinor(body.amount, body.currency);
    } catch (error) {
      throw new ApiError(400, "INVALID_AMOUNT", error instanceof Error ? error.message : "Invalid amount");
    }
    if (amountMinor <= 0) throw new ApiError(400, "INVALID_AMOUNT", "Amount must be greater than zero");
  }
  if (body.decisionType !== "affordability" && amountMinor === null) {
    throw new ApiError(400, "AMOUNT_REQUIRED", "Enter an amount for this decision");
  }
  const result = await generateDecision(user.id, {
    decisionType: body.decisionType,
    amountMinor,
    currency: body.currency,
    sourceAccountId: body.sourceAccountId,
    destinationLabel: body.destinationLabel,
    destinationCurrency: body.destinationCurrency,
    date: body.date,
    includeExpectedIncome: body.includeExpectedIncome,
    routeQuoteIds: body.routeQuoteIds,
    objective: body.objective,
    memoryMode: body.memoryMode,
  });
  return result;
});
