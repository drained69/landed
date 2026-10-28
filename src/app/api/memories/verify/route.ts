import { api } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { verifyMemoryLedger } from "@/server/services/memory";

export const GET = api(async () => {
  const user = await requireApiUser();
  return verifyMemoryLedger(user.id);
});
