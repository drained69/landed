import { prisma, parseJson } from "@/server/db";
import type { DecisionAction, PredictionError, PredictedOutcome } from "@/lib/types";

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export async function getLearningMetrics(userId: string) {
  const [decisions, outcomes, memories, observations, routeStats] = await Promise.all([
    prisma.financialDecision.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.decisionOutcome.findMany({
      where: { decision: { userId } },
      include: { decision: true },
      orderBy: { evaluatedAt: "desc" },
    }),
    prisma.memoryRecord.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.routeObservation.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.communityRouteStatistic.findMany(),
  ]);

  const feeErrors: number[] = [];
  const receivedErrors: number[] = [];
  const deliveryErrors: number[] = [];
  const bufferErrors: number[] = [];
  let shortfalls = 0;
  let achieved = 0;
  let partial = 0;
  let missed = 0;

  for (const outcome of outcomes) {
    const errors = parseJson<PredictionError | null>(outcome.predictionError, null);
    if (errors?.feeErrorMinor !== null && errors?.feeErrorMinor !== undefined) feeErrors.push(Math.abs(errors.feeErrorMinor));
    if (errors?.receivedErrorMinor !== null && errors?.receivedErrorMinor !== undefined) receivedErrors.push(Math.abs(errors.receivedErrorMinor));
    if (errors?.deliveryErrorHours !== null && errors?.deliveryErrorHours !== undefined) deliveryErrors.push(Math.abs(errors.deliveryErrorHours));
    if (errors?.bufferErrorMinor !== null && errors?.bufferErrorMinor !== undefined) bufferErrors.push(Math.abs(errors.bufferErrorMinor));
    if (outcome.shortfallOccurred) shortfalls += 1;
    if (outcome.outcomeStatus === "achieved") achieved += 1;
    if (outcome.outcomeStatus === "partial") partial += 1;
    if (outcome.outcomeStatus === "missed") missed += 1;
  }

  const followed = decisions.filter((d) => ["followed", "completed", "evaluated"].includes(d.status)).length;
  const memoryInfluenced = decisions.filter((d) => {
    const refs = parseJson<unknown[]>(d.memoryReferences, []);
    return refs.length > 0;
  }).length;

  // Modeled counterfactual difference. This is not a measured real-world result.
  let modeledBufferLiftMinor = 0;
  let modeledSamples = 0;
  for (const decision of decisions.slice(0, 8)) {
    const recommended = parseJson<DecisionAction | null>(decision.recommendedAction, null);
    const predicted = parseJson<PredictedOutcome | null>(decision.predictedOutcome, null);
    const baseline = parseJson<DecisionAction | null>(decision.baselineAction, null);
    if (!recommended || !predicted || !baseline) continue;
    if (recommended.amountMinor === baseline.amountMinor) continue;
    // A reduced amount is only interpretable alongside its projected buffer. We
    // report the amount difference, not an invented actual outcome.
    modeledBufferLiftMinor += Math.max(0, baseline.amountMinor - recommended.amountMinor);
    modeledSamples += 1;
  }

  const communityEligible = routeStats.filter((s) => s.contributorCount >= 3);

  return {
    counts: {
      decisions: decisions.length,
      evaluated: outcomes.length,
      achieved,
      partial,
      missed,
      shortfalls,
      memories: memories.length,
      confirmedMemories: memories.filter((m) => m.writeStatus === "confirmed" && m.walrusBlobId).length,
      localRehearsalMemories: memories.filter((m) => m.source === "local_rehearsal").length,
      hypotheses: memories.filter((m) => m.verificationStatus === "hypothesis").length,
      memoryInfluenced,
      followed,
    },
    errors: {
      feeMaeMinor: Math.round(mean(feeErrors)),
      receivedMaeMinor: Math.round(mean(receivedErrors)),
      deliveryMaeHours: Number(mean(deliveryErrors).toFixed(1)),
      bufferMaeMinor: Math.round(mean(bufferErrors)),
      samples: { fee: feeErrors.length, received: receivedErrors.length, delivery: deliveryErrors.length, buffer: bufferErrors.length },
    },
    rates: {
      shortfallRate: outcomes.length > 0 ? shortfalls / outcomes.length : 0,
      objectiveRate: outcomes.length > 0 ? achieved / outcomes.length : 0,
      acceptanceRate: decisions.length > 0 ? followed / decisions.length : 0,
      memoryInfluenceRate: decisions.length > 0 ? memoryInfluenced / decisions.length : 0,
    },
    modeled: {
      amountReducedAcrossDecisionsMinor: modeledBufferLiftMinor,
      samples: modeledSamples,
      note: "This is the modeled amount difference between baseline and memory-informed advice. It is not a measured cash outcome. Measured errors above come only from confirmed outcomes.",
    },
    observations: {
      total: observations.length,
      consented: observations.filter((o) => o.consentToAggregate).length,
      routesWithHistory: new Set(observations.map((o) => o.routeId)).size,
    },
    community: {
      eligibleGroups: communityEligible.length,
      note: communityEligible.length === 0
        ? "Insufficient community history. LANDED will not show a network confidence score until at least 3 independent contributors are present in a route group."
        : `${communityEligible.length} route group${communityEligible.length === 1 ? "" : "s"} meet the minimum contributor threshold.`,
    },
    evidenceNote: "Prediction errors are computed against user-confirmed or onchain-verified outcomes. Missing data is excluded rather than imputed.",
  };
}
