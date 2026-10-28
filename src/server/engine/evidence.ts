import type { MemoryRule } from "@/lib/types";
import type { EvaluationResult } from "./outcomes";

/**
 * Memory track record: when an outcome is recorded, every lesson that shaped
 * the decision is judged against what actually happened. A lesson that held
 * gains confidence; one that applied and still failed loses it. Confidence
 * already weights how strongly a rule acts in cash-flow and route ranking, so
 * the track record changes future advice — not just a label.
 */

export type EvidenceVerdict = "held" | "contradicted" | "inconclusive";

export interface EvidenceAssessment {
  verdict: EvidenceVerdict;
  reason: string;
  confidenceBefore: number;
  confidenceAfter: number;
}

const CASH_RULES = new Set<MemoryRule["kind"]>([
  "AMOUNT_CAP", "BUFFER_FLOOR", "RESERVE_COMMITMENT", "EXCLUDE_EXPECTED_INCOME", "SPLIT_TRANSFER", "DELAY_REMAINDER",
]);
const ROUTE_RULES = new Set<MemoryRule["kind"]>(["ROUTE_PENALTY", "ROUTE_PREFERENCE", "PAYOUT_DEDUCTION"]);

/** Confidence moves a fraction of the way toward its bound; never to certainty, never to zero. */
export const CONFIDENCE_CEILING = 0.95;
export const CONFIDENCE_FLOOR = 0.1;
export const REVIEW_THRESHOLD = 0.5;

export function nextConfidence(current: number, verdict: EvidenceVerdict): number {
  const c = Math.max(CONFIDENCE_FLOOR, Math.min(CONFIDENCE_CEILING, current));
  const next = verdict === "held"
    ? c + (CONFIDENCE_CEILING - c) * 0.25
    : verdict === "contradicted"
      ? c - (c - CONFIDENCE_FLOOR) * 0.3
      : c;
  return Math.round(next * 1000) / 1000;
}

export function assessMemory(rule: MemoryRule | null, confidence: number, evaluation: EvaluationResult): EvidenceAssessment {
  const m = evaluation.metric;
  let verdict: EvidenceVerdict = "inconclusive";
  let reason = "The outcome did not test this lesson.";

  if (!rule) {
    reason = "Untyped lesson; recorded as applied without a verdict.";
  } else if (CASH_RULES.has(rule.kind)) {
    if (evaluation.shortfallOccurred || m.bufferProtected === false) {
      verdict = "contradicted";
      reason = "The rule was applied and the buffer still broke. It was not protective enough.";
    } else if (m.bufferProtected === true) {
      verdict = "held";
      reason = "The rule was applied and obligations stayed covered with the buffer intact.";
    }
  } else if (ROUTE_RULES.has(rule.kind)) {
    const checks = [m.receivedWithinTolerance, m.deliveredOnTime].filter((v): v is boolean => v !== null);
    if (checks.length === 0) {
      reason = "No received amount or delivery time was recorded for the route.";
    } else if (checks.every(Boolean)) {
      verdict = "held";
      reason = "The memory-adjusted route delivered the predicted amount on time.";
    } else {
      verdict = "contradicted";
      reason = m.receivedWithinTolerance === false
        ? "The route still delivered less than the memory-adjusted prediction."
        : "The route was slower than the memory-adjusted prediction.";
    }
  }

  return { verdict, reason, confidenceBefore: confidence, confidenceAfter: nextConfidence(confidence, verdict) };
}

export interface TrackRecord {
  applied: number;
  held: number;
  contradicted: number;
  /** Share of decisive verdicts that held; null until at least one decisive verdict. */
  holdRate: number | null;
  needsReview: boolean;
}

export function summarizeTrackRecord(verdicts: EvidenceVerdict[], confidence: number): TrackRecord {
  const held = verdicts.filter((v) => v === "held").length;
  const contradicted = verdicts.filter((v) => v === "contradicted").length;
  const decisive = held + contradicted;
  return {
    applied: verdicts.length,
    held,
    contradicted,
    holdRate: decisive > 0 ? held / decisive : null,
    needsReview: contradicted > 0 && confidence < REVIEW_THRESHOLD,
  };
}
