import { api } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { getDecision } from "@/server/services/decisions";

export const GET = api(async (_req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const decision = await getDecision(user.id, id);
  if (!decision) return Response.json({ error: "Decision not found", code: "NOT_FOUND" }, { status: 404 });
  return { decision };
});
