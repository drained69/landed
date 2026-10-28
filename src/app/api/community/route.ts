import { api } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { aggregateCommunityRoutes, getCommunityStats } from "@/server/services/community";

export const GET = api(async () => {
  const user = await requireApiUser();
  return getCommunityStats(user.id);
});

export const POST = api(async () => {
  await requireApiUser();
  const result = await aggregateCommunityRoutes();
  return result;
});
