import { api } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { getLearningMetrics } from "@/server/services/metrics";
import { listMemories, verifyMemoryLedger } from "@/server/services/memory";
import { listDecisions } from "@/server/services/decisions";
import { getCommunityStats } from "@/server/services/community";

export const GET = api(async () => {
  const user = await requireApiUser();
  const [metrics, memories, decisions, verification, community] = await Promise.all([
    getLearningMetrics(user.id),
    listMemories(user.id),
    listDecisions(user.id, 30),
    verifyMemoryLedger(user.id),
    getCommunityStats(user.id),
  ]);
  return { metrics, memories, decisions, verification, community };
});
