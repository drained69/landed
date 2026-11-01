import { z } from "zod";

export type CurrencyCode =
  | "USD" | "EUR" | "GBP" | "PHP" | "MXN" | "INR"
  | "NGN" | "KES" | "JPY" | "KRW" | "VND";

export type DecisionType = "send" | "save" | "spend" | "affordability";
export type DecisionStatus =
  | "advised" | "accepted" | "followed" | "declined" | "completed" | "evaluated";
export type MemoryCategory =
  | "financial_pattern" | "preference" | "outcome" | "correction" | "route_intelligence";
export type WriteStatus =
  | "pending" | "writing" | "confirmed" | "failed" | "blocked" | "superseded";
export type VerificationStatus =
  | "verified" | "user_confirmed" | "hypothesis" | "rejected";

export type Money = { minor: number; currency: string };

export interface SplitSuggestion {
  firstMinor: number;
  remainderMinor: number;
  remainderAfter: string | null;
  reason: string;
}

export interface DecisionAction {
  kind: "send" | "save" | "spend" | "wait" | "insufficient_data";
  amountMinor: number;
  currency: string;
  timing: "today" | "on_date" | "wait_for_income" | "wait";
  timingDate?: string | null;
  routeId?: string | null;
  routeName?: string | null;
  split?: SplitSuggestion | null;
  headline: string;
  rationale: string;
  riskLevel: "low" | "medium" | "high" | "unknown";
  adjustments: ActionAdjustment[];
}

export interface ActionAdjustment {
  code: string;
  label: string;
  detail: string;
  memoryId?: string;
  memoryBlobId?: string | null;
  deltaMinor?: number;
}

export interface Assumption {
  key: string;
  label: string;
  detail: string;
  source: "user" | "database" | "onchain" | "memory" | "estimate" | "missing";
}

export interface PredictedOutcome {
  amountSentMinor: number;
  currency: string;
  expectedFeeMinor: number | null;
  expectedReceivedMinor: number | null;
  expectedDeliveryHours: number | null;
  projectedBufferAfterMinor: number;
  projectedMinBalanceMinor: number;
  obligationsCovered: { name: string; amountMinor: number; dueDate: string; covered: boolean }[];
  shortfallRisk: number; // 0..1
  expectedRemainderDate?: string | null;
}

export interface DecisionInputSnapshot {
  asOf: string;
  currency: string;
  requestedAmountMinor: number | null;
  decisionType: DecisionType;
  sourceAccountId: string | null;
  destinationLabel: string | null;
  destinationCurrency: string;
  routeQuotes: RouteQuoteInput[];
  includeExpectedIncome: boolean;
  accounts: {
    id: string; name: string; balanceMinor: number; currency: string;
    isLiquid: boolean; includeInSafeToMove?: boolean; verificationStatus: string; balanceSource: string;
  }[];
  commitments: {
    id: string; name: string; amountMinor: number; currency: string;
    dueDate: string; priority: string; recurrence: string; status?: string;
  }[];
  savingsGoals: {
    id: string; name: string; currentMinor: number; targetMinor: number;
    currency: string; monthlyContributionMinor: number; priority: string;
  }[];
  expectedIncome: {
    id: string; label: string; amountMinor: number; currency: string;
    expectedDate: string; reliability: number;
  }[];
  safetyBufferMinor: number;
  riskPosture: string;
  cashFlow: {
    monthlyIncomeMinor: number;
    monthlyExpenseMinor: number;
    dailyVariableSpendMinor: number;
    monthsObserved: number;
  };
  previousShortfalls: number;
  memoryCutoff: string | null;
  engineVersion: string;
}

export interface RouteQuoteInput {
  quoteId: string;
  routeId: string;
  routeName: string;
  providerOrMethod: string;
  originCurrency: string;
  destinationCurrency: string;
  payoutMethod: string;
  sendAmountMinor: number;
  feeMinor: number;
  networkFeeMinor: number;
  exchangeRate: string;
  expectedReceivedMinor: number;
  estimatedDeliveryHours: number;
  source: string;
  evidenceQuality: string;
  quotedAt: string;
  expiresAt: string | null;
  isSynthetic: boolean;
  reliability: { score: number; sampleSize: number; source: "history" | "network" | "none" };
}

/** Typed lesson. Stored in Postgres/SQLite and also embedded in the Walrus text. */
export type MemoryRule =
  | { kind: "RESERVE_COMMITMENT"; match: string; daysBefore: number; reservePercent: number }
  | { kind: "EXCLUDE_EXPECTED_INCOME"; reliabilityThreshold: number }
  | { kind: "AMOUNT_CAP"; capPercentOfSafe: number }
  | { kind: "DELAY_REMAINDER"; waitForIncome: boolean }
  | { kind: "ROUTE_PENALTY"; match: string; scorePenalty: number; feeAdjustmentMinor?: number; deliveryMultiplier?: number }
  | { kind: "ROUTE_PREFERENCE"; match: string; scoreBonus: number }
  | { kind: "BUFFER_FLOOR"; amountMinor: number }
  | { kind: "SPLIT_TRANSFER"; maxTodayPercent: number }
  | { kind: "SPEND_LIMIT"; category: string; monthlyLimitMinor: number; currency: string }
  | { kind: "SUBSCRIPTION_WATCH"; merchant: string; approvedAmountMinor: number; currency: string; tolerancePercent: number }
  | { kind: "PAYOUT_DEDUCTION"; match: string; observedPercent: number };

export interface ValidatedMemory {
  id: string;
  blobId: string | null;
  category: string;
  summary: string;
  lesson: string;
  confidence: number;
  verificationStatus: string;
  writeStatus: string;
  source: string;
  createdAt: string;
  rule: MemoryRule | null;
  distance?: number;
  excluded?: boolean;
  supersededBy?: string | null;
  /** Where this rule came from on this request: a live Walrus recall hit, or the local ledger. */
  recalledFrom?: "walrus" | "local";
}

export interface MemoryEffect {
  code: string;
  label: string;
  detail: string;
  memoryId: string;
  memoryBlobId: string | null;
  rule: MemoryRule;
}

export interface RouteScore {
  quote: RouteQuoteInput;
  score: number;
  rank: number;
  expectedReceivedMinor: number;
  totalCostMinor: number;
  effectiveCostPercent: number;
  reliabilityScore: number;
  contributions: { label: string; value: number; weight: number }[];
  adjustments: { label: string; delta: number; memoryId?: string }[];
  confidence: "high" | "medium" | "low";
}

export interface RouteComparison {
  corridor: string;
  quotes: RouteScore[];
  best: RouteScore | null;
  excluded: { quoteId: string; reason: string }[];
  notes: string[];
}

export interface OutcomeObserved {
  amountSentMinor: number;
  actualFeeMinor: number | null;
  actualReceivedMinor: number | null;
  deliveryHours: number | null;
  bufferAfterMinor: number | null;
  billsCovered: boolean | null;
  shortfallOccurred: boolean | null;
  notes?: string | null;
}

export interface PredictionError {
  feeErrorMinor: number | null;
  receivedErrorMinor: number | null;
  deliveryErrorHours: number | null;
  bufferErrorMinor: number | null;
  amountErrorMinor: number | null;
}

export interface LessonCandidate {
  category: MemoryCategory;
  summary: string;
  lesson: string;
  rule: MemoryRule | null;
  confidence: number;
  evidenceQuality: string;
  verificationStatus: VerificationStatus;
  originalExpectation: string | null;
  actualOutcome: string | null;
  conditions: Record<string, unknown> | null;
  evidenceRefs: string[];
  causes: string[];
  hypotheses: string[];
}

export const decimalString = z.string().regex(/^\d+(\.\d+)?$/, "Must be a positive decimal");

export const amountInputSchema = z.object({
  amount: z.union([z.string().min(1), z.number()]),
  currency: z.string().length(3),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const signupSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  currency: z.string().length(3).default("USD"),
});

export const decisionRequestSchema = z.object({
  decisionType: z.enum(["send", "save", "spend", "affordability"]).default("send"),
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().length(3).default("USD"),
  sourceAccountId: z.string().optional().nullable(),
  destinationLabel: z.string().max(120).optional().nullable(),
  destinationCurrency: z.string().length(3).default("USD"),
  routeQuoteIds: z.array(z.string()).optional(),
  date: z.string().optional(),
  includeExpectedIncome: z.boolean().default(false),
  objective: z.string().max(400).optional(),
  memoryMode: z.enum(["live", "baseline"]).default("live"),
});

export const askSchema = z.object({
  message: z.string().min(1).max(1000),
});

export const outcomeSchema = z.object({
  movementId: z.string().min(1),
  actualFee: z.union([z.string(), z.number()]).optional(),
  actualReceived: z.union([z.string(), z.number()]).optional(),
  deliveryHours: z.coerce.number().min(0).max(24 * 60).optional(),
  bufferAfter: z.union([z.string(), z.number()]).optional(),
  billsCovered: z.boolean().optional(),
  shortfallOccurred: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

export const memoryFeedbackSchema = z.object({
  action: z.enum(["confirm", "reject", "correct"]),
  correction: z.string().max(1000).optional(),
});
