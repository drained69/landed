import { prisma, parseJson, jsonString } from "@/server/db";
import type {
  Assumption, DecisionAction, DecisionInputSnapshot, DecisionType, LessonCandidate,
  MemoryRule, OutcomeObserved, PredictedOutcome,
} from "@/lib/types";
import { decide, diffActions, ENGINE_VERSION, type DecisionResult } from "@/server/engine/decision";
import {
  evaluateOutcome, extractLessons, formatJournalText, formatMemoryText, type EvaluationContext, type EvaluationResult,
} from "@/server/engine/outcomes";
import { assessMemory } from "@/server/engine/evidence";
import { buildDecisionInput, memoryQueryForSnapshot } from "./financial";
import { journalNamespace, recallApplicableMemories, userNamespace, writeMemoryToWalrus } from "./memory";
import { formatMemoryText as portableText } from "@/server/engine/outcomes";

export interface GenerateDecisionParams {
  decisionType: DecisionType;
  amountMinor: number | null;
  currency: string;
  sourceAccountId?: string | null;
  destinationLabel?: string | null;
  destinationCurrency?: string;
  date?: string;
  includeExpectedIncome?: boolean;
  routeQuoteIds?: string[];
  objective?: string;
  memoryMode?: "live" | "baseline";
}

export async function generateDecision(userId: string, params: GenerateDecisionParams) {
  const { snapshot } = await buildDecisionInput({
    userId,
    decisionType: params.decisionType,
    amountMinor: params.amountMinor,
    currency: params.currency,
    sourceAccountId: params.sourceAccountId,
    destinationLabel: params.destinationLabel,
    destinationCurrency: params.destinationCurrency,
    date: params.date,
    includeExpectedIncome: params.includeExpectedIncome,
    routeQuoteIds: params.routeQuoteIds,
  });

  const query = memoryQueryForSnapshot(snapshot);
  const retrieval = params.memoryMode === "baseline"
    ? { mode: "local_rehearsal" as const, memories: [], query, error: null, recalledCount: 0, health: null }
    : await recallApplicableMemories(userId, query, { limit: 6, cutoff: new Date() });

  const result = decide(snapshot, retrieval.memories);
  const objective = params.objective?.trim() || defaultObjective(params, result);

  const decision = await prisma.financialDecision.create({
    data: {
      userId,
      decisionType: params.decisionType,
      status: "advised",
      objective,
      requestedAmountMinor: params.amountMinor,
      currency: params.currency,
      inputSnapshot: jsonString(snapshot),
      calculationVersion: ENGINE_VERSION,
      recommendedAction: jsonString(result.action),
      baselineAction: jsonString(result.baselineAction),
      assumptions: jsonString(result.assumptions),
      memoryReferences: jsonString(result.effects.map((e) => ({
        memoryId: e.memoryId, blobId: e.memoryBlobId ?? null, code: e.code, label: e.label,
      }))),
      memoryMode: params.memoryMode ?? "live",
      predictedOutcome: jsonString(result.predicted),
      confidence: result.confidence,
      asOf: new Date(snapshot.asOf),
    },
  });

  await prisma.auditEvent.create({
    data: {
      userId,
      type: "decision.generated",
      entity: "FinancialDecision",
      entityId: decision.id,
      payload: JSON.stringify({
        amountMinor: result.action.amountMinor,
        baselineAmountMinor: result.baselineAction.amountMinor,
        memoryCount: result.memories.length,
        memoryRetrievalMode: retrieval.mode,
      }),
    },
  });

  return {
    decision,
    result,
    retrieval: {
      mode: retrieval.mode,
      query,
      error: retrieval.error,
      recalledCount: retrieval.recalledCount,
      memories: retrieval.memories.map((m) => ({
        id: m.id, summary: m.summary, category: m.category, confidence: m.confidence,
        blobId: m.blobId, writeStatus: m.writeStatus, source: m.source,
        rule: m.rule,
      })),
    },
    diffs: diffActions(result.baselineAction, result.action),
  };
}

/**
 * Record what LANDED advised and why as a journal entry (category "reasoning").
 * Opt-in via the decision_journal consent. Idempotent per decision. Journal
 * entries have no typed rule and live in their own Walrus namespace, so they
 * can be recalled ("what did you tell me last month?") but never act as rules.
 */
export async function createJournalEntry(userId: string, decisionId: string) {
  const consent = await prisma.consent.findUnique({
    where: { userId_consentType: { userId, consentType: "decision_journal" } },
  });
  if (!consent?.granted) return null;
  const decision = await prisma.financialDecision.findFirst({ where: { id: decisionId, userId } });
  if (!decision || decision.memoryMode !== "live") return null;
  const existing = await prisma.memoryRecord.findFirst({ where: { userId, decisionId, category: "reasoning" } });
  if (existing) return existing;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const action = parseJson<DecisionAction | null>(decision.recommendedAction, null);
  const baseline = parseJson<DecisionAction | null>(decision.baselineAction, null);
  if (!action) return null;
  const refs = parseJson<{ memoryId: string }[]>(decision.memoryReferences, []);
  return prisma.memoryRecord.create({
    data: {
      userId,
      decisionId,
      category: "reasoning",
      summary: `Advised: ${action.headline}`.slice(0, 400),
      lesson: formatJournalText({
        decisionId,
        createdAt: decision.createdAt.toISOString(),
        question: decision.objective,
        advice: action.headline,
        amountMinor: action.amountMinor,
        baselineAmountMinor: baseline?.amountMinor ?? action.amountMinor,
        currency: decision.currency,
        rationale: action.rationale,
        memoryIds: [...new Set(refs.map((r) => r.memoryId))],
      }),
      confidence: decision.confidence,
      evidenceQuality: "verified",
      verificationStatus: "verified",
      namespace: journalNamespace(user.email),
      writeStatus: "pending",
      source: "local_rehearsal",
      isSynthetic: user.isDemo,
      createdAt: decision.createdAt,
    },
  });
}

/** Create the journal entry and write it to Walrus. Safe to run after the response. */
export async function journalDecision(userId: string, decisionId: string) {
  try {
    const entry = await createJournalEntry(userId, decisionId);
    if (!entry || entry.writeStatus === "confirmed") return entry;
    await writeMemoryToWalrus(userId, entry.id);
    return entry;
  } catch (error) {
    console.error("[journal]", error instanceof Error ? error.message : error);
    return null;
  }
}

function defaultObjective(params: GenerateDecisionParams, result: DecisionResult): string {
  if (params.decisionType === "save") return "Grow savings without risking upcoming commitments.";
  if (params.decisionType === "spend") return "Spend without creating a cash shortfall.";
  if (params.destinationLabel) return `Send money to ${params.destinationLabel} without jeopardizing upcoming commitments.`;
  return result.action.amountMinor > 0
    ? "Move money safely while protecting upcoming commitments."
    : "Decide whether moving money is safe right now.";
}

export async function getDecision(userId: string, decisionId: string) {
  const decision = await prisma.financialDecision.findFirst({
    where: { id: decisionId, userId },
    include: {
      outcomes: { include: { movement: true } },
      movements: { include: { route: true } },
      memories: true,
    },
  });
  if (!decision) return null;
  const evidence = await prisma.memoryEvidence.findMany({
    where: { userId, decisionId: decision.id },
    orderBy: { createdAt: "asc" },
    include: { memory: { select: { id: true, summary: true, confidence: true, walrusBlobId: true } } },
  });
  return {
    ...decision,
    evidence,
    recommended: parseJson<DecisionAction | null>(decision.recommendedAction, null),
    baseline: parseJson<DecisionAction | null>(decision.baselineAction, null),
    assumptions: parseJson<Assumption[]>(decision.assumptions, []),
    predicted: parseJson<PredictedOutcome | null>(decision.predictedOutcome, null),
    memoryReferences: parseJson<unknown[]>(decision.memoryReferences, []),
    input: parseJson<DecisionInputSnapshot | null>(decision.inputSnapshot, null),
  };
}

export async function listDecisions(userId: string, limit = 50) {
  const decisions = await prisma.financialDecision.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      outcomes: true,
      movements: true,
      memories: { select: { id: true, summary: true, writeStatus: true, walrusBlobId: true, category: true } },
    },
  });
  return decisions.map((d) => ({
    ...d,
    recommended: parseJson<DecisionAction | null>(d.recommendedAction, null),
    baseline: parseJson<DecisionAction | null>(d.baselineAction, null),
    predicted: parseJson<PredictedOutcome | null>(d.predictedOutcome, null),
    assumptions: parseJson<Assumption[]>(d.assumptions, []),
  }));
}

export async function markFollowed(userId: string, decisionId: string) {
  const decision = await prisma.financialDecision.findFirst({ where: { id: decisionId, userId } });
  if (!decision) throw new Error("Decision not found");
  return prisma.financialDecision.update({
    where: { id: decision.id },
    data: { status: "followed", followedAt: new Date() },
  });
}

export async function declineDecision(userId: string, decisionId: string) {
  const decision = await prisma.financialDecision.findFirst({ where: { id: decisionId, userId } });
  if (!decision) throw new Error("Decision not found");
  return prisma.financialDecision.update({ where: { id: decision.id }, data: { status: "declined" } });
}

export async function recordOutcome(params: {
  userId: string;
  decisionId: string;
  amountSentMinor: number;
  actualFeeMinor: number | null;
  actualReceivedMinor: number | null;
  deliveryHours: number | null;
  bufferAfterMinor: number | null;
  billsCovered: boolean | null;
  shortfallOccurred: boolean | null;
  notes?: string | null;
  transactionDigest?: string | null;
  evidenceType?: string;
}) {
  const decision = await prisma.financialDecision.findFirst({
    where: { id: params.decisionId, userId: params.userId },
    include: { outcomes: true, memories: true },
  });
  if (!decision) throw new Error("Decision not found");
  if (decision.outcomes.some((o) => o.evaluatedAt)) {
    throw new Error("This decision already has a settled outcome. LANDED does not overwrite an audited evaluation.");
  }

  const input = parseJson<DecisionInputSnapshot | null>(decision.inputSnapshot, null);
  const predicted = parseJson<PredictedOutcome | null>(decision.predictedOutcome, null);
  const action = parseJson<DecisionAction | null>(decision.recommendedAction, null);
  if (!input || !predicted || !action) throw new Error("Decision snapshot is incomplete");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: params.userId } });
  const routeId = action.routeId ?? null;
  const quote = input.routeQuotes.find((q) => q.routeId === routeId) ?? null;
  const route = routeId
    ? await prisma.paymentRoute.findFirst({ where: { id: routeId, userId: params.userId } })
    : null;

  const movement = await prisma.moneyMovement.create({
    data: {
      userId: params.userId,
      decisionId: decision.id,
      routeId: routeId ?? undefined,
      amountMinor: params.amountSentMinor,
      currency: decision.currency,
      destinationCurrency: input.destinationCurrency,
      recipientLabel: input.destinationLabel,
      status: "settled",
      actualFeeMinor: params.actualFeeMinor,
      actualReceivedMinor: params.actualReceivedMinor,
      deliveryHours: params.deliveryHours,
      completedAt: new Date(),
      evidenceType: params.evidenceType ?? "user_confirmed",
      transactionDigest: params.transactionDigest ?? null,
      onchainStatus: params.evidenceType === "onchain_verified" ? "success" : null,
      notes: params.notes ?? null,
      isSynthetic: decision.memoryMode === "replay" ? false : user.isDemo,
    },
  });

  const observed: OutcomeObserved = {
    amountSentMinor: params.amountSentMinor,
    actualFeeMinor: params.actualFeeMinor,
    actualReceivedMinor: params.actualReceivedMinor,
    deliveryHours: params.deliveryHours,
    bufferAfterMinor: params.bufferAfterMinor,
    billsCovered: params.billsCovered,
    shortfallOccurred: params.shortfallOccurred,
    notes: params.notes ?? null,
  };

  const evalContext: EvaluationContext = {
    predicted,
    action,
    quote,
    bufferTargetMinor: input.safetyBufferMinor,
  };
  const evaluation = evaluateOutcome(evalContext, observed);

  const daysToObligation = input.commitments
    .map((c) => Math.ceil((new Date(c.dueDate).getTime() - new Date(input.asOf).getTime()) / 86_400_000))
    .filter((d) => d >= 0)
    .sort((a, b) => a - b)[0] ?? null;

  const lessons = extractLessons({
    evaluation,
    context: evalContext,
    observed,
    corridor: quote ? `${quote.originCurrency}>${quote.destinationCurrency}` : null,
    payoutMethod: quote?.payoutMethod ?? route?.payoutMethod ?? null,
    routeName: quote?.routeName ?? route?.name ?? null,
    provider: quote?.providerOrMethod ?? route?.providerOrMethod ?? null,
    daysToObligation,
    decisionId: decision.id,
    movementId: movement.id,
  });

  const outcome = await prisma.decisionOutcome.create({
    data: {
      decisionId: decision.id,
      movementId: movement.id,
      observedResult: jsonString(observed),
      predictionError: jsonString(evaluation.errors),
      outcomeStatus: evaluation.status,
      objectiveAchieved: evaluation.objectiveAchieved,
      shortfallOccurred: evaluation.shortfallOccurred,
      confirmedCauses: jsonString(evaluation.confirmedCauses),
      hypotheses: jsonString(evaluation.hypotheses),
      metricJson: jsonString(evaluation.metric),
      evaluatedAt: new Date(),
    },
  });

  await prisma.financialDecision.update({
    where: { id: decision.id },
    data: { status: "evaluated" },
  });

  const evidence = await recordMemoryEvidence(params.userId, decision.id, outcome.id, decision.memoryReferences, evaluation);

  const consent = await prisma.consent.findUnique({
    where: { userId_consentType: { userId: params.userId, consentType: "community_route_intelligence" } },
  });
  if (quote && route) {
    await prisma.routeObservation.create({
      data: {
        userId: params.userId,
        routeId: route.id,
        decisionId: decision.id,
        movementId: movement.id,
        corridor: `${quote.originCurrency}>${quote.destinationCurrency}`,
        payoutMethod: quote.payoutMethod,
        sendAmountMinor: params.amountSentMinor,
        expectedCostMinor: (predicted.expectedFeeMinor ?? 0),
        actualCostMinor: params.actualFeeMinor ?? 0,
        expectedReceivedMinor: predicted.expectedReceivedMinor ?? 0,
        actualReceivedMinor: params.actualReceivedMinor ?? 0,
        expectedDeliveryHours: Math.round(predicted.expectedDeliveryHours ?? 0),
        actualDeliveryHours: Math.round(params.deliveryHours ?? 0),
        consentToAggregate: consent?.granted ?? false,
        contributorHash: (await import("node:crypto")).createHash("sha256")
          .update(`${params.userId}:${process.env.MEMWAL_ACCOUNT_ID ?? "landed"}`)
          .digest("hex").slice(0, 32),
      },
    });
  }

  // Draft lessons are recorded but never used until the user confirms them.
  const onchainVerified = params.evidenceType === "onchain_verified" && Boolean(params.transactionDigest);
  const createdMemories = [];
  for (const lesson of lessons) {
    const memory = await prisma.memoryRecord.create({
      data: {
        userId: params.userId,
        decisionId: decision.id,
        category: lesson.category,
        summary: lesson.summary,
        lesson: lesson.lesson,
        structuredRule: lesson.rule ? jsonString(lesson.rule) : null,
        originalExpectation: lesson.originalExpectation,
        actualOutcome: lesson.actualOutcome,
        conditions: lesson.conditions ? jsonString(lesson.conditions) : null,
        evidenceRefs: jsonString(lesson.evidenceRefs),
        // A Tatum-verified settlement is stronger evidence than a self-report.
        confidence: onchainVerified ? Math.min(0.95, lesson.confidence + 0.05) : lesson.confidence,
        evidenceQuality: onchainVerified ? "verified_onchain" : lesson.evidenceQuality,
        verificationStatus: lesson.verificationStatus,
        namespace: userNamespace(user.email),
        writeStatus: "pending",
        source: "local_rehearsal",
        isSynthetic: user.isDemo,
      },
    });
    createdMemories.push(memory);
  }

  await prisma.auditEvent.create({
    data: {
      userId: params.userId,
      type: "outcome.evaluated",
      entity: "DecisionOutcome",
      entityId: outcome.id,
      payload: JSON.stringify({
        decisionId: decision.id,
        status: evaluation.status,
        shortfall: evaluation.shortfallOccurred,
        lessonCandidates: createdMemories.length,
      }),
    },
  });

  return {
    outcome,
    movement,
    evaluation,
    evidence,
    lessons: createdMemories,
    note: "Draft lessons are stored locally and excluded from decisions until you confirm them. Confirming writes the lesson to Walrus when credentials are configured.",
  };
}

/**
 * Judge each memory that shaped this decision against the real outcome and move
 * its confidence. Idempotent per (memory, decision).
 */
async function recordMemoryEvidence(
  userId: string,
  decisionId: string,
  outcomeId: string,
  memoryReferences: string,
  evaluation: EvaluationResult,
) {
  const refs = parseJson<{ memoryId: string }[]>(memoryReferences, []);
  const ids = [...new Set(refs.map((r) => r.memoryId))];
  if (ids.length === 0) return [];
  const memories = await prisma.memoryRecord.findMany({ where: { userId, id: { in: ids } } });
  const results = [];
  for (const memory of memories) {
    const existing = await prisma.memoryEvidence.findUnique({
      where: { memoryId_decisionId: { memoryId: memory.id, decisionId } },
    });
    if (existing) {
      results.push(existing);
      continue;
    }
    const assessment = assessMemory(parseJson<MemoryRule | null>(memory.structuredRule, null), memory.confidence, evaluation);
    const [row] = await prisma.$transaction([
      prisma.memoryEvidence.create({
        data: { userId, memoryId: memory.id, decisionId, outcomeId, ...assessment },
      }),
      prisma.memoryRecord.update({
        where: { id: memory.id },
        data: { confidence: assessment.confidenceAfter },
      }),
    ]);
    results.push(row);
  }
  if (results.length > 0) {
    await prisma.auditEvent.create({
      data: {
        userId,
        type: "memory.evidence.recorded",
        entity: "FinancialDecision",
        entityId: decisionId,
        payload: JSON.stringify(results.map((r) => ({ memoryId: r.memoryId, verdict: r.verdict, before: r.confidenceBefore, after: r.confidenceAfter }))),
      },
    });
  }
  return results;
}

export async function confirmLesson(params: {
  userId: string;
  memoryId: string;
  action: "confirm" | "reject" | "correct";
  correction?: string;
}) {
  const memory = await prisma.memoryRecord.findFirst({
    where: { id: params.memoryId, userId: params.userId },
    include: { decision: true },
  });
  if (!memory) throw new Error("Memory not found");

  if (params.action === "reject") {
    const updated = await prisma.memoryRecord.update({
      where: { id: memory.id },
      data: {
        verificationStatus: "rejected",
        excluded: true,
        exclusionReason: "Rejected by user during Advice Autopsy",
        writeStatus: "blocked",
        writeError: "User rejected this lesson; it was not written to Walrus.",
      },
    });
    return { memory: updated, write: null };
  }

  const correction = params.correction?.trim();
  const updated = await prisma.memoryRecord.update({
    where: { id: memory.id },
    data: {
      verificationStatus: "user_confirmed",
      excluded: false,
      exclusionReason: null,
      ...(params.action === "correct" && correction
        ? {
            lesson: correction,
            summary: `User correction: ${correction}`.slice(0, 400),
            confidence: Math.min(0.9, memory.confidence + 0.05),
            evidenceQuality: "user_confirmed",
          }
        : {}),
    },
  });

  const write = await writeMemoryToWalrus(params.userId, updated.id);
  return { memory: updated, write };
}

/**
 * A replay may only see the world as it existed when the decision was made.
 * A requested cutoff later than the decision creation is clamped, so a lesson
 * learned afterwards can never leak into the counterfactual informed arm.
 */
export function resolveReplayCutoff(decisionCreatedAt: Date, requested?: string | null): {
  cutoff: Date;
  requested: string | null;
  clamped: boolean;
  reason: string | null;
} {
  const decisionTime = new Date(decisionCreatedAt);
  if (Number.isNaN(decisionTime.getTime())) throw new Error("Decision timestamp is invalid");
  const now = new Date();
  let cutoff = decisionTime;
  let clamped = false;
  let reason: string | null = null;

  if (requested) {
    const parsed = new Date(requested);
    if (Number.isNaN(parsed.getTime())) throw new Error("Replay cutoff is not a valid date");
    if (parsed.getTime() > decisionTime.getTime()) {
      clamped = true;
      reason = "Requested cutoff was after the decision was recorded; it was clamped to the decision time to prevent future-information leakage.";
    } else {
      cutoff = parsed;
    }
  }
  if (cutoff.getTime() > now.getTime()) {
    cutoff = now;
    clamped = true;
    reason = "Cutoff was in the future; it was clamped to now.";
  }

  return { cutoff, requested: requested ?? null, clamped, reason };
}

export async function replayDecision(userId: string, decisionId: string, cutoff?: string) {
  const decision = await prisma.financialDecision.findFirst({
    where: { id: decisionId, userId },
    include: { outcomes: true, movements: true },
  });
  if (!decision) throw new Error("Decision not found");
  const input = parseJson<DecisionInputSnapshot | null>(decision.inputSnapshot, null);
  if (!input) throw new Error("Decision input snapshot is missing");

  const resolved = resolveReplayCutoff(decision.createdAt, cutoff);
  const cutoffDate = resolved.cutoff;
  const query = memoryQueryForSnapshot(input);
  const retrieval = await recallApplicableMemories(userId, query, {
    limit: 8,
    cutoff: cutoffDate,
  });

  // Both arms use the identical input snapshot. Only memory availability differs.
  const baseline = decide(input, []);
  const informed = decide(input, retrieval.memories);

  const predicted = parseJson<PredictedOutcome | null>(decision.predictedOutcome, null);
  const outcome = decision.outcomes[0]
    ? {
        ...decision.outcomes[0],
        observed: parseJson<unknown>(decision.outcomes[0].observedResult, {}),
        errors: parseJson<unknown>(decision.outcomes[0].predictionError, {}),
        metric: parseJson<unknown>(decision.outcomes[0].metricJson, {}),
      }
    : null;

  return {
    decision: {
      id: decision.id,
      objective: decision.objective,
      createdAt: decision.createdAt,
      status: decision.status,
      originalRecommendation: parseJson<DecisionAction | null>(decision.recommendedAction, null),
      originalPredicted: predicted,
    },
    baseline: {
      action: baseline.action,
      predicted: baseline.predicted,
      cashflow: {
        safeToMoveMinor: baseline.cashflow.safeToMoveMinor,
        projectedMinBalanceMinor: baseline.cashflow.projectedMinBalanceMinor,
        confidence: baseline.cashflow.confidence,
      },
      route: baseline.routeComparison.best
        ? { name: baseline.routeComparison.best.quote.routeName, score: baseline.routeComparison.best.score, expectedReceivedMinor: baseline.routeComparison.best.expectedReceivedMinor }
        : null,
      memories: [],
    },
    informed: {
      action: informed.action,
      predicted: informed.predicted,
      cashflow: {
        safeToMoveMinor: informed.cashflow.safeToMoveMinor,
        projectedMinBalanceMinor: informed.cashflow.projectedMinBalanceMinor,
        confidence: informed.cashflow.confidence,
      },
      route: informed.routeComparison.best
        ? { name: informed.routeComparison.best.quote.routeName, score: informed.routeComparison.best.score, expectedReceivedMinor: informed.routeComparison.best.expectedReceivedMinor }
        : null,
      memories: retrieval.memories.map((m) => ({
        id: m.id, summary: m.summary, blobId: m.blobId, category: m.category,
        confidence: m.confidence, writeStatus: m.writeStatus, source: m.source,
        rule: m.rule, createdAt: m.createdAt,
      })),
    },
    diffs: diffActions(baseline.action, informed.action),
    routeDiffs: baseline.routeComparison.best?.quote.routeName !== informed.routeComparison.best?.quote.routeName
      ? [`Route changed from ${baseline.routeComparison.best?.quote.routeName ?? "none"} to ${informed.routeComparison.best?.quote.routeName ?? "none"}.`]
      : [],
    cutoff: cutoffDate.toISOString(),
    retrieval: {
      mode: retrieval.mode,
      error: retrieval.error,
      recalledCount: retrieval.recalledCount,
    },
    outcome,
    modeledRiskDelta: {
      bufferDeltaMinor: informed.predicted.projectedBufferAfterMinor - baseline.predicted.projectedBufferAfterMinor,
      safeToMoveDeltaMinor: informed.cashflow.safeToMoveMinor - baseline.cashflow.safeToMoveMinor,
      note: "Modeled difference in the counterfactual plan, not a measured real-world result. Actual improvement is shown only for evaluated decisions.",
    },
    timeConsistency: {
      inputsIdentical: true,
      memoryCutoff: cutoffDate.toISOString(),
      decisionRecordedAt: decision.createdAt.toISOString(),
      requestedCutoff: resolved.requested,
      cutoffClamped: resolved.clamped,
      newMemoriesExcluded: retrieval.memories.filter((m) => new Date(m.createdAt) > cutoffDate).length,
      note: resolved.reason ?? "Both replay arms reuse the same input snapshot; only memories written at or before the decision time can influence the informed arm.",
    },
  };
}

export function parseCandidate(candidateText: string): LessonCandidate | null {
  try {
    return JSON.parse(candidateText) as LessonCandidate;
  } catch {
    return null;
  }
}

/** Ensure a memory is memory-shaped before writing: typed rule optional but preferred. */
export function memoryTextFor(memory: {
  id: string; category: string; summary: string; lesson: string;
  structuredRule: string | null; confidence: number; conditions: string | null;
  decisionId: string | null; createdAt: Date;
}) {
  return formatMemoryText({
    memoryId: memory.id,
    category: memory.category,
    summary: memory.summary,
    lesson: memory.lesson,
    rule: parseJson<MemoryRule | null>(memory.structuredRule, null),
    confidence: memory.confidence,
    conditions: parseJson(memory.conditions, null),
    decisionId: memory.decisionId ?? "none",
    createdAt: memory.createdAt.toISOString(),
  });
}

export { portableText };
