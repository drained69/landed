import { api, ApiError } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { replayDecision } from "@/server/services/decisions";

export const GET = api(async (req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const cutoff = searchParams.get("cutoff") ?? undefined;
  if (cutoff && Number.isNaN(new Date(cutoff).getTime())) {
    throw new ApiError(400, "INVALID_CUTOFF", "Cutoff must be a valid ISO date");
  }
  const replay = await replayDecision(user.id, id, cutoff);
  return { replay };
});

export const POST = api(async (_req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  return { replay: await replayDecision(user.id, id) };
});
