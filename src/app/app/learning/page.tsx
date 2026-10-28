import { requireUser } from "@/server/auth";
import { getLearningCurve, getLearningMetrics } from "@/server/services/metrics";
import { listMemories, verifyMemoryLedger } from "@/server/services/memory";
import { listDecisions } from "@/server/services/decisions";
import { getCommunityStats, getConsents } from "@/server/services/community";
import { LearningView } from "@/components/LearningView";

export default async function LearningPage() {
  const user = await requireUser();
  const [metrics, memories, decisions, verification, community, consents, curve] = await Promise.all([
    getLearningMetrics(user.id),
    listMemories(user.id),
    listDecisions(user.id, 50),
    verifyMemoryLedger(user.id),
    getCommunityStats(user.id),
    getConsents(user.id),
    getLearningCurve(user.id),
  ]);
  return (
    <LearningView
      metrics={metrics}
      memories={memories}
      decisions={decisions}
      verification={verification}
      community={community}
      consents={consents}
      curve={curve}
    />
  );
}
