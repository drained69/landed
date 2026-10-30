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

export interface LearningWeek {
  weekStart: string;
  label: string;
  outcomes: number;
  achieved: number;
  /** Mean absolute buffer error of advice given that week, in minor units; null without samples. */
  bufferErrorMinor: number | null;
  receivedErrorMinor: number | null;
  verdictsHeld: number;
  verdictsContradicted: number;
  lessonsLearned: number;
  /** Confirmed rules in force at the end of the week. */
  rulesInForce: number;
}

/**
 * "Sharper every week": advice accuracy, lessons learned, and rules in force,
 * bucketed by the week the advice was given. Only recorded outcomes count;
 * weeks without one show no accuracy rather than a guessed one.
 */
export async function getLearningCurve(userId: string, weeks = 6, now = new Date()) {
  const DAY = 86_400_000;
  const start = new Date(now.getTime() - weeks * 7 * DAY);
  const [outcomes, memories, evidence] = await Promise.all([
    prisma.decisionOutcome.findMany({
      where: { decision: { userId, createdAt: { gte: start } } },
      include: { decision: { select: { createdAt: true } } },
    }),
    prisma.memoryRecord.findMany({
      where: { userId, category: { not: "reasoning" }, verificationStatus: { in: ["user_confirmed", "verified"] } },
      select: { createdAt: true, excluded: true, supersededBy: true, structuredRule: true },
    }),
    prisma.memoryEvidence.findMany({ where: { userId, createdAt: { gte: start } }, select: { verdict: true, decisionId: true } }),
  ]);
  const decisionWeek = new Map<string, number>();
  const weekOf = (date: Date) => Math.floor((date.getTime() - start.getTime()) / (7 * DAY));

  const series: LearningWeek[] = Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(start.getTime() + i * 7 * DAY);
    return {
      weekStart: weekStart.toISOString(),
      label: i === weeks - 1 ? "This week" : weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      outcomes: 0, achieved: 0, bufferErrorMinor: null, receivedErrorMinor: null,
      verdictsHeld: 0, verdictsContradicted: 0, lessonsLearned: 0, rulesInForce: 0,
    };
  });

  const buffers: number[][] = series.map(() => []);
  const received: number[][] = series.map(() => []);
  for (const o of outcomes) {
    const w = weekOf(o.decision.createdAt);
    if (w < 0 || w >= weeks) continue;
    decisionWeek.set(o.decisionId, w);
    series[w].outcomes += 1;
    if (o.objectiveAchieved) series[w].achieved += 1;
    const errors = parseJson<PredictionError | null>(o.predictionError, null);
    if (errors?.bufferErrorMinor != null) buffers[w].push(Math.abs(errors.bufferErrorMinor));
    if (errors?.receivedErrorMinor != null) received[w].push(Math.abs(errors.receivedErrorMinor));
  }
  series.forEach((week, i) => {
    week.bufferErrorMinor = buffers[i].length ? Math.round(mean(buffers[i])) : null;
    week.receivedErrorMinor = received[i].length ? Math.round(mean(received[i])) : null;
  });
  for (const e of evidence) {
    const w = decisionWeek.get(e.decisionId);
    if (w === undefined) continue;
    if (e.verdict === "held") series[w].verdictsHeld += 1;
    if (e.verdict === "contradicted") series[w].verdictsContradicted += 1;
  }
  for (const m of memories) {
    const learnedAt = m.createdAt; // confirmedAt is when Walrus confirmed the write, not when the rule was learned
    const w = weekOf(learnedAt);
    if (w >= 0 && w < weeks) series[w].lessonsLearned += 1;
    if (!m.structuredRule || m.excluded || m.supersededBy) continue;
    for (let i = Math.max(0, w); i < weeks; i++) series[i].rulesInForce += 1;
  }

  const withOutcomes = series.filter((w) => w.outcomes > 0);
  const totalOutcomes = withOutcomes.reduce((sum, w) => sum + w.outcomes, 0);
  const totalAchieved = withOutcomes.reduce((sum, w) => sum + w.achieved, 0);
  // The honest story of learning: what happened after the most recent miss.
  let lastMiss = -1;
  series.forEach((w, i) => { if (w.outcomes > w.achieved) lastMiss = i; });
  const after = lastMiss >= 0 ? series.slice(lastMiss + 1) : [];
  const sinceMiss = lastMiss >= 0
    ? {
        weekLabel: series[lastMiss].label,
        lessonsLearned: series.slice(lastMiss).reduce((sum, w) => sum + w.lessonsLearned, 0),
        outcomes: after.reduce((sum, w) => sum + w.outcomes, 0),
        achieved: after.reduce((sum, w) => sum + w.achieved, 0),
      }
    : null;
  return {
    weeks: series,
    summary: {
      outcomes: totalOutcomes,
      achieved: totalAchieved,
      lessonsLearned: series.reduce((sum, w) => sum + w.lessonsLearned, 0),
      rulesInForce: series[series.length - 1]?.rulesInForce ?? 0,
      rulesAtStart: series[0]?.rulesInForce ?? 0,
      sinceMiss,
      note: totalOutcomes < 2
        ? "Not enough recorded outcomes yet to show a trend. Each recorded outcome adds a point."
        : `Based on ${totalOutcomes} recorded outcomes. Small samples: read this as direction, not proof.`,
    },
  };
}
