import { api } from "@/server/api";
import { requireApiUser } from "@/server/auth";

export const GET = api(async () => {
  const user = await requireApiUser();
  return { user };
});
