import type {
  DecisionAction, LessonCandidate, OutcomeObserved, PredictedOutcome,
  PredictionError, RouteQuoteInput,
} from "@/lib/types";
import { formatMinor } from "@/lib/money";

export interface EvaluationResult {
  status: "achieved" | "partial" | "missed" | "inconclusive";
  objectiveAchieved: boolean;
  shortfallOccurred: boolean;
  errors: PredictionError;
  confirmedCauses: string[];
  hypotheses: string[];
  metric: {
    feeWithinTolerance: boolean | null;
    receivedWithinTolerance: boolean | null;
    deliveredOnTime: boolean | null;
    bufferProtected: boolean | null;
  };
}

export interface EvaluationContext {
  predicted: PredictedOutcome;
  action: DecisionAction;
  quote: RouteQuoteInput | null;
  bufferTargetMinor: number;
}

export function evaluateOutcome(
  context: EvaluationContext,
  observed: OutcomeObserved,
): EvaluationResult {
  const p = context.predicted;
  const expectedFee = p.expectedFeeMinor;
  const expectedReceived = p.expectedReceivedMinor;
  const expectedDelivery = p.expectedDeliveryHours;

  const feeError = observed.actualFeeMinor !== null && expectedFee !== null
    ? observed.actualFeeMinor - expectedFee : null;
  const receivedError = observed.actualReceivedMinor !== null && expectedReceived !== null
    ? observed.actualReceivedMinor - expectedReceived : null;
  const deliveryError = observed.deliveryHours !== null && expectedDelivery !== null
    ? observed.deliveryHours - expectedDelivery : null;
  const bufferError = observed.bufferAfterMinor !== null
    ? observed.bufferAfterMinor - p.projectedBufferAfterMinor : null;

  const feeTolerance = expectedFee !== null ? Math.max(100, Math.round(expectedFee * 0.25)) : null;
  const receivedTolerance = expectedReceived !== null ? Math.max(100, Math.round(expectedReceived * 0.05)) : null;
  const deliveryTolerance = expectedDelivery !== null ? Math.max(2, expectedDelivery * 0.5) : null;

  const feeWithin = feeError === null || feeTolerance === null ? null : Math.abs(feeError) <= feeTolerance;
  const receivedWithin = receivedError === null || receivedTolerance === null ? null : Math.abs(receivedError) <= receivedTolerance;
  const deliveredOnTime = deliveryError === null || deliveryTolerance === null ? null : deliveryError <= deliveryTolerance;
  const bufferProtected = observed.shortfallOccurred !== null
    ? !observed.shortfallOccurred
    : observed.bufferAfterMinor !== null
      ? observed.bufferAfterMinor >= context.bufferTargetMinor
      : null;

  const shortfallOccurred = observed.shortfallOccurred ?? (observed.bufferAfterMinor !== null ? observed.bufferAfterMinor < 0 : false);

  const causes: string[] = [];
  const hypotheses: string[] = [];
  if (feeError !== null && feeError > (feeTolerance ?? 100)) {
    causes.push(`Actual fee was ${formatMinor(Math.abs(feeError), context.action.currency)} higher than the quote.`);
  }
  if (receivedError !== null && receivedError < -(receivedTolerance ?? 100)) {
    causes.push(`Recipient received ${formatMinor(Math.abs(receivedError), context.action.currency)} less than predicted.`);
    hypotheses.push("A recipient-side payout or intermediary charge may not have appeared in the quote.");
  }
  if (deliveryError !== null && deliveryError > (deliveryTolerance ?? 2)) {
    causes.push(`Delivery took ${deliveryError.toFixed(1)} hours longer than predicted.`);
    hypotheses.push("Provider processing or batch cut-off times may differ from the advertised window.");
  }
  if (bufferError !== null && bufferError < 0) {
    causes.push(`Cash buffer after the move was ${formatMinor(Math.abs(bufferError), context.action.currency)} lower than predicted.`);
  }
  if (shortfallOccurred && receivedError !== null && receivedError < 0) {
    hypotheses.push("The underestimated cost and the aggressive transfer amount both contributed; causality between them cannot be separated from a single outcome.");
  }

  const missing = observed.actualReceivedMinor === null && observed.actualFeeMinor === null && observed.bufferAfterMinor === null;
  let status: EvaluationResult["status"];
  if (missing) status = "inconclusive";
  else if (shortfallOccurred || observed.billsCovered === false) status = "missed";
  else if (feeWithin === false || receivedWithin === false || deliveredOnTime === false || bufferProtected === false) status = "partial";
  else status = "achieved";

  return {
    status,
    objectiveAchieved: status === "achieved",
    shortfallOccurred,
    errors: {
      feeErrorMinor: feeError,
      receivedErrorMinor: receivedError,
      deliveryErrorHours: deliveryError,
      bufferErrorMinor: bufferError,
      amountErrorMinor: null,
    },
    confirmedCauses: causes,
    hypotheses,
    metric: {
      feeWithinTolerance: feeWithin,
      receivedWithinTolerance: receivedWithin,
      deliveredOnTime,
      bufferProtected,
    },
  };
}

const CATEGORY_BY_ERROR = {
  fee: "route_intelligence" as const,
  delivery: "route_intelligence" as const,
  buffer: "correction" as const,
  success: "outcome" as const,
};

export function extractLessons(params: {
  evaluation: EvaluationResult;
  context: EvaluationContext;
  observed: OutcomeObserved;
  corridor: string | null;
  payoutMethod: string | null;
  routeName: string | null;
  provider: string | null;
  daysToObligation: number | null;
  decisionId: string;
  movementId: string;
}): LessonCandidate[] {
  const { evaluation, context, observed } = params;
  const lessons: LessonCandidate[] = [];
  const currency = context.action.currency;
  const providerMatch = params.provider ?? params.routeName ?? "this route";
  const conditions = {
    corridor: params.corridor,
    payoutMethod: params.payoutMethod,
    provider: providerMatch,
    daysToObligation: params.daysToObligation,
    amountBand: observed.amountSentMinor <= 20_000 ? "small" : observed.amountSentMinor <= 100_000 ? "medium" : "large",
  };

  if (evaluation.status === "inconclusive") return lessons;

  if (evaluation.shortfallOccurred || (evaluation.errors.bufferErrorMinor !== null && evaluation.errors.bufferErrorMinor < -Math.max(100, context.bufferTargetMinor * 0.25))) {
    lessons.push({
      category: CATEGORY_BY_ERROR.buffer,
      summary: `A ${formatMinor(observed.amountSentMinor, currency)} transfer left the cash buffer ${evaluation.errors.bufferErrorMinor !== null ? formatMinor(Math.abs(evaluation.errors.bufferErrorMinor), currency) : "below target"} and triggered a shortfall near a scheduled commitment.`,
      lesson: "When a large commitment is due within 10 days, do not treat expected income as cleared. Reserve the full commitment and split the transfer instead of sending the full requested amount at once.",
      rule: { kind: "RESERVE_COMMITMENT", match: "rent", daysBefore: 10, reservePercent: 1 },
      confidence: 0.82,
      evidenceQuality: "user_confirmed",
      verificationStatus: "hypothesis",
      originalExpectation: `Buffer after transfer predicted at ${formatMinor(context.predicted.projectedBufferAfterMinor, currency)} with obligations covered.`,
      actualOutcome: `Buffer after transfer reported at ${observed.bufferAfterMinor !== null ? formatMinor(observed.bufferAfterMinor, currency) : "unknown"}${evaluation.shortfallOccurred ? "; a shortfall occurred before a scheduled bill." : "."}`,
      conditions,
      evidenceRefs: [params.decisionId, params.movementId],
      causes: evaluation.confirmedCauses,
      hypotheses: evaluation.hypotheses,
    });
  }

  if (evaluation.errors.feeErrorMinor !== null && evaluation.errors.feeErrorMinor > Math.max(100, (context.predicted.expectedFeeMinor ?? 0) * 0.25)) {
    lessons.push({
      category: CATEGORY_BY_ERROR.fee,
      summary: `${providerMatch} charged ${formatMinor(observed.actualFeeMinor ?? 0, currency)} versus a quoted ${formatMinor(context.predicted.expectedFeeMinor ?? 0, currency)} on a ${params.corridor ?? "transfer"} transfer.`,
      lesson: `Add an observed fee premium for ${providerMatch} instead of trusting its headline quote, and show the realized recipient amount in route comparisons for this corridor.`,
      rule: {
        kind: "ROUTE_PENALTY",
        match: providerMatch,
        scorePenalty: 0.3,
        feeAdjustmentMinor: observed.actualFeeMinor !== null && context.predicted.expectedFeeMinor !== null
          ? observed.actualFeeMinor - context.predicted.expectedFeeMinor : undefined,
      },
      confidence: 0.68,
      evidenceQuality: "user_confirmed",
      verificationStatus: "hypothesis",
      originalExpectation: `Quoted fee ${formatMinor(context.predicted.expectedFeeMinor ?? 0, currency)}.`,
      actualOutcome: `Observed fee ${formatMinor(observed.actualFeeMinor ?? 0, currency)}.`,
      conditions,
      evidenceRefs: [params.decisionId, params.movementId],
      causes: evaluation.confirmedCauses,
      hypotheses: evaluation.hypotheses,
    });
  }

  if (evaluation.errors.receivedErrorMinor !== null && evaluation.errors.receivedErrorMinor < -Math.max(100, (context.predicted.expectedReceivedMinor ?? 0) * 0.05)) {
    lessons.push({
      category: "route_intelligence",
      summary: `Recipient received ${formatMinor(observed.actualReceivedMinor ?? 0, currency)} through ${providerMatch}, ${formatMinor(Math.abs(evaluation.errors.receivedErrorMinor), currency)} less than the quote predicted.`,
      lesson: `For ${providerMatch} ${params.corridor ?? ""} ${params.payoutMethod?.replaceAll("_", " ") ?? "payout"}, expect a recipient-side deduction and compare on the realized amount, not the advertised rate.`,
      rule: {
        kind: "PAYOUT_DEDUCTION",
        match: providerMatch,
        observedPercent: context.predicted.expectedReceivedMinor
          ? Math.min(0.25, Math.abs(evaluation.errors.receivedErrorMinor) / context.predicted.expectedReceivedMinor)
          : 0.03,
      },
      confidence: 0.6,
      evidenceQuality: "user_confirmed",
      verificationStatus: "hypothesis",
      originalExpectation: `Predicted recipient amount ${formatMinor(context.predicted.expectedReceivedMinor ?? 0, currency)}.`,
      actualOutcome: `Observed recipient amount ${formatMinor(observed.actualReceivedMinor ?? 0, currency)}.`,
      conditions,
      evidenceRefs: [params.decisionId, params.movementId],
      causes: evaluation.confirmedCauses,
      hypotheses: evaluation.hypotheses,
    });
  }

  if (evaluation.errors.deliveryErrorHours !== null && evaluation.errors.deliveryErrorHours > Math.max(2, (context.predicted.expectedDeliveryHours ?? 0) * 0.5)) {
    lessons.push({
      category: "route_intelligence",
      summary: `${providerMatch} delivered in ${observed.deliveryHours?.toFixed(1)} hours against a ${context.predicted.expectedDeliveryHours?.toFixed(1)}-hour estimate.`,
      lesson: `When timing matters for ${providerMatch}, plan for the observed delivery window rather than the advertised one and prefer a route with verified delivery history.`,
      rule: {
        kind: "ROUTE_PENALTY",
        match: providerMatch,
        scorePenalty: 0.18,
        deliveryMultiplier: (observed.deliveryHours ?? 0) / Math.max(1, context.predicted.expectedDeliveryHours ?? 1),
      },
      confidence: 0.55,
      evidenceQuality: "user_confirmed",
      verificationStatus: "hypothesis",
      originalExpectation: `Delivery predicted in ${context.predicted.expectedDeliveryHours?.toFixed(1)} hours.`,
      actualOutcome: `Delivery observed at ${observed.deliveryHours?.toFixed(1)} hours.`,
      conditions,
      evidenceRefs: [params.decisionId, params.movementId],
      causes: evaluation.confirmedCauses,
      hypotheses: evaluation.hypotheses,
    });
  }

  if (evaluation.status === "achieved") {
    lessons.push({
      category: CATEGORY_BY_ERROR.success,
      summary: `A ${formatMinor(observed.amountSentMinor, currency)} transfer through ${providerMatch} met the predicted recipient amount and protected the cash buffer.`,
      lesson: `This route and amount band worked when obligations were covered; keep it as a positive reference, but do not treat one success as proof for every corridor.`,
      rule: {
        kind: "ROUTE_PREFERENCE",
        match: providerMatch,
        scoreBonus: 0.08,
      },
      confidence: 0.5,
      evidenceQuality: "user_confirmed",
      verificationStatus: "user_confirmed",
      originalExpectation: `Predicted recipient ${formatMinor(context.predicted.expectedReceivedMinor ?? 0, currency)}, buffer ${formatMinor(context.predicted.projectedBufferAfterMinor, currency)}.`,
      actualOutcome: `Observed recipient ${formatMinor(observed.actualReceivedMinor ?? 0, currency)}, buffer ${observed.bufferAfterMinor !== null ? formatMinor(observed.bufferAfterMinor, currency) : "not reported"}.`,
      conditions,
      evidenceRefs: [params.decisionId, params.movementId],
      causes: ["The predicted outcome was within tolerance."],
      hypotheses: [],
    });
  }

  return lessons;
}

/** A stable, semantic, portable memory text. The typed rule is embedded for recall portability. */
export function formatMemoryText(params: {
  memoryId: string;
  category: string;
  summary: string;
  lesson: string;
  rule: unknown;
  confidence: number;
  conditions: unknown;
  decisionId: string;
  createdAt: string;
}): string {
  return [
    `LANDED lesson [${params.memoryId}]`,
    `category=${params.category}`,
    `created=${params.createdAt}`,
    `decision=${params.decisionId}`,
    `confidence=${params.confidence.toFixed(2)}`,
    `summary: ${oneLine(params.summary)}`,
    `lesson: ${oneLine(params.lesson)}`,
    `rule: ${JSON.stringify(params.rule)}`,
    `conditions: ${JSON.stringify(params.conditions)}`,
    "scope: personal financial decision; evidence is limited to the referenced outcome. Do not universalize.",
  ].join("\n");
}

/** The portable text is line-oriented; a newline inside a field would break parsing. */
function oneLine(value: string): string {
  return value.replace(/\s*\n\s*/g, " ").trim();
}

export interface PortableLesson {
  memoryId: string;
  category: string;
  createdAt: string | null;
  decisionId: string | null;
  confidence: number | null;
  summary: string;
  lesson: string;
  rule: unknown | null;
  conditions: unknown | null;
}

/**
 * Inverse of formatMemoryText. Used to rebuild a ledger from Walrus alone, so a
 * fresh install can recover its lessons. Returns null for text that is not a
 * LANDED lesson.
 */
export function parsePortableLesson(text: string): PortableLesson | null {
  const id = text.match(/^LANDED lesson \[([^\]\n]+)\]/m)?.[1];
  if (!id) return null;
  const field = (name: string, sep: "=" | ":") => {
    const match = text.match(new RegExp(`^${name}${sep}\\s?(.*)$`, "m"));
    return match ? match[1].trim() : null;
  };
  const json = (raw: string | null) => {
    if (!raw) return null;
    try { return JSON.parse(raw) as unknown; } catch { return null; }
  };
  const confidence = Number(field("confidence", "="));
  const created = field("created", "=");
  const decision = field("decision", "=");
  return {
    memoryId: id,
    category: field("category", "=") ?? "outcome",
    createdAt: created && !Number.isNaN(Date.parse(created)) ? new Date(created).toISOString() : null,
    decisionId: decision && decision !== "none" ? decision : null,
    confidence: Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : null,
    summary: field("summary", ":") ?? "",
    lesson: field("lesson", ":") ?? "",
    rule: json(field("rule", ":")),
    conditions: json(field("conditions", ":")),
  };
}

/** A decision journal entry: what LANDED advised, against what, and why. Never a rule. */
export function formatJournalText(params: {
  decisionId: string;
  createdAt: string;
  question: string;
  advice: string;
  amountMinor: number;
  baselineAmountMinor: number;
  currency: string;
  rationale: string;
  memoryIds: string[];
}): string {
  return [
    `LANDED decision journal [${params.decisionId}]`,
    `created=${params.createdAt}`,
    `currency=${params.currency}`,
    `amount_minor=${params.amountMinor}`,
    `baseline_minor=${params.baselineAmountMinor}`,
    `question: ${oneLine(params.question)}`,
    `advice: ${oneLine(params.advice)}`,
    `because: ${oneLine(params.rationale)}`,
    `memories: ${params.memoryIds.join(", ") || "none"}`,
    "scope: a record of advice given, not a rule. It never changes a future recommendation by itself.",
  ].join("\n");
}

export function parseJournalText(text: string): { decisionId: string; createdAt: string | null; question: string; advice: string; because: string } | null {
  const id = text.match(/^LANDED decision journal \[([^\]\n]+)\]/m)?.[1];
  if (!id) return null;
  const line = (name: string) => text.match(new RegExp(`^${name}[:=]\\s?(.*)$`, "m"))?.[1]?.trim() ?? "";
  const created = line("created");
  return {
    decisionId: id,
    createdAt: created && !Number.isNaN(Date.parse(created)) ? new Date(created).toISOString() : null,
    question: line("question"),
    advice: line("advice"),
    because: line("because"),
  };
}

export function parseRuleFromMemoryText(text: string): unknown | null {
  const match = text.match(/^rule:\s*(\{.*\})$/m);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}
