import { api } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { getDashboard } from "@/server/services/financial";

export const GET = api(async () => {
  const user = await requireApiUser();
  return getDashboard(user.id);
});
