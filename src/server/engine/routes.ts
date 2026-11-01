import type {
  RouteComparison, RouteQuoteInput, RouteScore, ValidatedMemory,
} from "@/lib/types";

export interface RoutePreferences {
  preference: "lower_fees" | "faster" | "reliability" | "balanced";
}

const WEIGHTS: Record<string, { recipient: number; cost: number; speed: number; reliability: number; freshness: number }> = {
  balanced: { recipient: 0.35, cost: 0.25, speed: 0.2, reliability: 0.15, freshness: 0.05 },
  lower_fees: { recipient: 0.4, cost: 0.35, speed: 0.1, reliability: 0.1, freshness: 0.05 },
  faster: { recipient: 0.3, cost: 0.15, speed: 0.35, reliability: 0.15, freshness: 0.05 },
  reliability: { recipient: 0.3, cost: 0.15, speed: 0.1, reliability: 0.4, freshness: 0.05 },
};

function freshnessScore(quotedAt: string, asOf: Date): number {
  const ageHours = Math.max(0, (asOf.getTime() - new Date(quotedAt).getTime()) / 3_600_000);
  if (ageHours <= 1) return 1;
  if (ageHours <= 24) return 0.8;
  if (ageHours <= 72) return 0.5;
  return 0.2;
}

function smoothedReliability(score: number, sampleSize: number): number {
  return (score * sampleSize + 0.5 * 3) / (sampleSize + 3);
}

function matches(match: string, quote: RouteQuoteInput): boolean {
  const m = match.toLowerCase();
  return (
    quote.providerOrMethod.toLowerCase().includes(m) ||
    quote.routeName.toLowerCase().includes(m)
  );
}

export function rankRoutes(
  quotes: RouteQuoteInput[],
  memories: ValidatedMemory[],
  preferences: RoutePreferences,
  asOf: Date = new Date(),
): RouteComparison {
  if (quotes.length === 0) {
    return {
      corridor: "—",
      quotes: [],
      best: null,
      excluded: [],
      notes: ["No route quotes available. Add user-entered quotes to compare routes."],
    };
  }

  const corridors = new Set(quotes.map((q) => `${q.originCurrency}>${q.destinationCurrency}`));
  if (corridors.size > 1) {
    return {
      corridor: [...corridors].join(", "),
      quotes: [],
      best: null,
      excluded: quotes.map((q) => ({ quoteId: q.quoteId, reason: "Mixed currency corridors cannot be ranked together." })),
      notes: ["Quotes for different currency pairs are kept separate; LANDED will not rank incompatible corridors."],
    };
  }

  const sendAmounts = new Set(quotes.map((q) => q.sendAmountMinor));
  if (sendAmounts.size > 1) {
    return {
      corridor: [...corridors][0],
      quotes: [],
      best: null,
      excluded: quotes.map((q) => ({ quoteId: q.quoteId, reason: "Quotes were requested for different send amounts." })),
      notes: ["Normalize for the same send amount before comparing routes."],
    };
  }

  const asOfMs = asOf.getTime();
  const excluded: { quoteId: string; reason: string }[] = [];
  const eligible = quotes.filter((q) => {
    if (q.expiresAt && new Date(q.expiresAt).getTime() < asOfMs) {
      excluded.push({ quoteId: q.quoteId, reason: "Quote expired" });
      return false;
    }
    if (q.sendAmountMinor <= 0) {
      excluded.push({ quoteId: q.quoteId, reason: "Invalid send amount" });
      return false;
    }
    return true;
  });

  if (eligible.length === 0) {
    return {
      corridor: [...corridors][0],
      quotes: [],
      best: null,
      excluded,
      notes: ["All available quotes have expired. Refresh a quote before deciding."],
    };
  }

  const maxReceived = Math.max(...eligible.map((q) => q.expectedReceivedMinor), 1);
  const maxCostRatio = Math.max(
    ...eligible.map((q) => (q.feeMinor + q.networkFeeMinor) / q.sendAmountMinor),
    0.0001,
  );
  const maxDelivery = Math.max(...eligible.map((q) => q.estimatedDeliveryHours), 1);
  const weights = WEIGHTS[preferences.preference] ?? WEIGHTS.balanced;

  const scored: RouteScore[] = eligible.map((quote) => {
    let expectedReceived = quote.expectedReceivedMinor;
    const adjustments: { label: string; delta: number; memoryId?: string }[] = [];

    for (const memory of memories) {
      if (!memory.rule || memory.excluded || memory.supersededBy || !["verified", "user_confirmed"].includes(memory.verificationStatus)) continue;
      const rule = memory.rule;
      if (rule.kind === "PAYOUT_DEDUCTION" && matches(rule.match, quote)) {
        const deduction = Math.round(expectedReceived * rule.observedPercent * Math.max(0.5, memory.confidence));
        if (deduction > 0) {
          expectedReceived -= deduction;
          adjustments.push({
            label: `Expected recipient-side deduction from prior outcome`,
            delta: -deduction,
            memoryId: memory.id,
          });
        }
      }
    }

    const totalCost = quote.feeMinor + quote.networkFeeMinor;
    const costRatio = totalCost / quote.sendAmountMinor;
    const recipientScore = expectedReceived / maxReceived;
    const costScore = 1 - costRatio / maxCostRatio;
    const speedScore = 1 - Math.min(1, quote.estimatedDeliveryHours / maxDelivery);
    const reliabilityScore = smoothedReliability(quote.reliability.score, quote.reliability.sampleSize);
    const fresh = freshnessScore(quote.quotedAt, asOf);

    const contributions = [
      { label: "Recipient amount", value: recipientScore, weight: weights.recipient },
      { label: "Total cost", value: costScore, weight: weights.cost },
      { label: "Delivery speed", value: speedScore, weight: weights.speed },
      { label: "Observed reliability", value: reliabilityScore, weight: weights.reliability },
      { label: "Quote freshness", value: fresh, weight: weights.freshness },
    ];
    let score =
      recipientScore * weights.recipient +
      costScore * weights.cost +
      speedScore * weights.speed +
      reliabilityScore * weights.reliability +
      fresh * weights.freshness;

    for (const memory of memories) {
      if (!memory.rule || memory.excluded || memory.supersededBy || !["verified", "user_confirmed"].includes(memory.verificationStatus)) continue;
      const rule = memory.rule;
      const confidence = Math.max(0.25, Math.min(1, memory.confidence));
      if (rule.kind === "ROUTE_PENALTY" && matches(rule.match, quote)) {
        const delta = -rule.scorePenalty * confidence;
        score += delta;
        adjustments.push({ label: `Reliability penalty: ${memory.summary}`, delta, memoryId: memory.id });
      }
      if (rule.kind === "ROUTE_PREFERENCE" && matches(rule.match, quote)) {
        const delta = rule.scoreBonus * confidence;
        score += delta;
        adjustments.push({ label: `Preferred from prior outcome`, delta, memoryId: memory.id });
      }
    }

    const confidence: RouteScore["confidence"] =
      quote.evidenceQuality === "verified_outcome" || (quote.evidenceQuality === "provider_quote" && quote.reliability.sampleSize >= 3)
        ? "high"
        : quote.isSynthetic || quote.source === "demo"
          ? "low"
          : "medium";

    return {
      quote,
      score: Math.max(0, Math.min(1, score)),
      rank: 0,
      expectedReceivedMinor: Math.max(0, expectedReceived),
      totalCostMinor: totalCost,
      effectiveCostPercent: totalCost / quote.sendAmountMinor,
      reliabilityScore,
      contributions,
      adjustments,
      confidence,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  scored.forEach((s, i) => (s.rank = i + 1));

  const notes: string[] = [];
  if (eligible.some((q) => q.isSynthetic || q.source === "demo" || q.source === "user_entered")) {
    notes.push("Some quotes are user-entered or demonstration data, not live provider pricing.");
  }
  if (scored.some((s) => s.quote.reliability.sampleSize === 0)) {
    notes.push("Routes with no observed history use a neutral reliability prior (0.5).");
  }
  if (scored.some((s) => s.adjustments.length > 0)) {
    notes.push("Ranking includes adjustments from previously observed outcomes.");
  }

  return {
    corridor: [...corridors][0],
    quotes: scored,
    best: scored[0] ?? null,
    excluded,
    notes,
  };
}
