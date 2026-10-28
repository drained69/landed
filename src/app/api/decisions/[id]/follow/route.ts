import { api, ApiError } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { declineDecision, markFollowed } from "@/server/services/decisions";

export const POST = api(async (_req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const decision = await markFollowed(user.id, id);
  return { decision };
});

export const DELETE = api(async (_req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  await declineDecision(user.id, id);
  return { ok: true };
});

export const PATCH = api(async (_req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const decision = await markFollowed(user.id, id);
  return { decision };
});

export const GET = api(async () => {
  throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use POST to mark followed");
});
