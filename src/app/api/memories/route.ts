import { api } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { listMemories, verifyMemoryLedger } from "@/server/services/memory";

export const GET = api(async (req) => {
  const user = await requireApiUser();
  const { searchParams } = new URL(req.url);
  if (searchParams.get("verify") === "1") {
    return verifyMemoryLedger(user.id);
  }
  const memories = await listMemories(user.id);
  return { memories };
});
