import type { MemoryRule, ValidatedMemory } from "@/lib/types";
import { formatMinor } from "@/lib/money";

/**
 * Spend Watch: deterministic recurring-charge detection and category pacing.
 *
 * Heuristics only ever produce *proposals*. Alerts are raised exclusively by
 * user-confirmed memories (SPEND_LIMIT, SUBSCRIPTION_WATCH), so every alert
 * can name the lesson that caused it — and without memory there are none.
 */

export interface SpendTransaction {
  id: string;
  amountMinor: number;
  currency: string;
  direction: string;
  category: string;
  merchant: string | null;
  timestamp: Date;
  status: string;
}

export interface SpendWatchInput {
  asOf: Date;
  currency: string;
  transactions: SpendTransaction[];
  memories: ValidatedMemory[];
}

export interface MemoryRef {
  memoryId: string;
  blobId: string | null;
  createdAt: string;
  summary: string;
}

export interface RecurringCharge {
  key: string;
  merchant: string;
  category: string;
  cadence: "weekly" | "monthly" | "yearly";
  charges: number;
  latestAmountMinor: number;
  usualAmountMinor: number;
  latestAt: string;
  nextExpectedAt: string;
  annualCostMinor: number;
  changeMinor: number;
  status: "approved" | "above_approved" | "price_change" | "untracked";
  approvedAmountMinor: number | null;
  memory: MemoryRef | null;
}

export interface CategoryPace {
  category: string;
  monthToDateMinor: number;
  projectedMinor: number;
  usualMonthlyMinor: number;
  monthsObserved: number;
  limitMinor: number | null;
  remainingMinor: number | null;
  status: "over_limit" | "trending_over" | "near_limit" | "within_limit" | "above_usual" | "usual";
  memory: MemoryRef | null;
}

export interface SpendAlert {
  key: string;
  kind: "category_over_limit" | "category_trending_over" | "subscription_above_approved";
  title: string;
  detail: string;
  amountMinor: number;
  memory: MemoryRef;
}

export interface SpendProposal {
  key: string;
  kind: "SPEND_LIMIT" | "SUBSCRIPTION_WATCH";
  title: string;
  detail: string;
  summary: string;
  lesson: string;
  rule: MemoryRule;
  suggestedAmountMinor: number;
  /** 3 = price changed, 2 = running above usual, 1 = routine suggestion. */
  priority: number;
}

export interface SpendWatchResult {
  asOf: string;
  currency: string;
  dayOfMonth: number;
  daysInMonth: number;
  recurring: RecurringCharge[];
  categories: CategoryPace[];
  alerts: SpendAlert[];
  proposals: SpendProposal[];
  recurringMonthlyMinor: number;
  monthToDateMinor: number;
  memoriesApplied: number;
}

const DAY_MS = 86_400_000;

/** Fixed obligations are already protected by the cash-flow engine; pacing them is noise. */
const NON_DISCRETIONARY = new Set(["income", "housing", "utilities", "insurance", "transfer", "savings", "debt"]);

export function normalizeMerchant(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeCategory(value: string): string {
  return value.toLowerCase().trim();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function memoryRef(memory: ValidatedMemory): MemoryRef {
  return { memoryId: memory.id, blobId: memory.blobId, createdAt: memory.createdAt, summary: memory.summary };
}

function utcMonthStart(date: Date, offset = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

function cadenceFor(gapDays: number): RecurringCharge["cadence"] | null {
  if (gapDays >= 6 && gapDays <= 8) return "weekly";
  if (gapDays >= 25 && gapDays <= 35) return "monthly";
  if (gapDays >= 350 && gapDays <= 380) return "yearly";
  return null;
}

const PER_YEAR: Record<RecurringCharge["cadence"], number> = { weekly: 52, monthly: 12, yearly: 1 };
const CADENCE_DAYS: Record<RecurringCharge["cadence"], number> = { weekly: 7, monthly: 30, yearly: 365 };

function roundUpTo(minor: number, stepMinor: number): number {
  return Math.ceil(minor / stepMinor) * stepMinor;
}

/** Newest confirmed rule wins per key; memories arrive pre-filtered (not excluded, not superseded). */
function rulesOf<K extends MemoryRule["kind"]>(memories: ValidatedMemory[], kind: K) {
  return memories
    .filter((m) => m.rule?.kind === kind)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) as (ValidatedMemory & { rule: Extract<MemoryRule, { kind: K }> })[];
}

export function detectRecurring(input: SpendWatchInput): Omit<RecurringCharge, "status" | "approvedAmountMinor" | "memory">[] {
  const groups = new Map<string, SpendTransaction[]>();
  for (const tx of input.transactions) {
    if (tx.direction !== "out" || tx.status !== "posted" || tx.currency !== input.currency || !tx.merchant) continue;
    if (tx.timestamp > input.asOf) continue;
    const key = normalizeMerchant(tx.merchant);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), tx]);
  }

  const found: Omit<RecurringCharge, "status" | "approvedAmountMinor" | "memory">[] = [];
  for (const [key, txs] of groups) {
    if (txs.length < 2) continue;
    const sorted = [...txs].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const gaps = sorted.slice(1).map((tx, i) => (tx.timestamp.getTime() - sorted[i].timestamp.getTime()) / DAY_MS);
    const gap = median(gaps);
    const cadence = cadenceFor(gap);
    if (!cadence) continue;
    // Every gap must be close to the median: a regular schedule, not a habit.
    if (gaps.some((g) => Math.abs(g - gap) > Math.max(3, gap * 0.2))) continue;

    // Subscriptions bill a fixed price. Earlier charges must agree within 3%;
    // the latest charge is allowed to differ — that is the price change we want to see.
    const latest = sorted[sorted.length - 1];
    const earlier = sorted.slice(0, -1).map((t) => t.amountMinor);
    const usual = median(earlier);
    if (earlier.some((a) => Math.abs(a - usual) > usual * 0.03)) continue;

    found.push({
      key,
      merchant: latest.merchant!,
      category: normalizeCategory(latest.category),
      cadence,
      charges: sorted.length,
      latestAmountMinor: latest.amountMinor,
      usualAmountMinor: usual,
      latestAt: latest.timestamp.toISOString(),
      nextExpectedAt: new Date(latest.timestamp.getTime() + CADENCE_DAYS[cadence] * DAY_MS).toISOString(),
      annualCostMinor: latest.amountMinor * PER_YEAR[cadence],
      changeMinor: latest.amountMinor - usual,
    });
  }
  return found.sort((a, b) => b.annualCostMinor - a.annualCostMinor);
}

export function computeSpendWatch(input: SpendWatchInput): SpendWatchResult {
  const { asOf, currency } = input;
  const monthStart = utcMonthStart(asOf);
  const dayOfMonth = asOf.getUTCDate();
  const daysInMonth = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0)).getUTCDate();
  const trailingStart = utcMonthStart(asOf, -3);

  const watches = rulesOf(input.memories, "SUBSCRIPTION_WATCH").filter((m) => m.rule.currency === currency);
  const limits = rulesOf(input.memories, "SPEND_LIMIT").filter((m) => m.rule.currency === currency);
  const applied = new Set<string>();

  // ── Recurring charges ────────────────────────────────────────────────────
  // Rent and utilities are obligations the cash-flow engine already protects.
  const recurring: RecurringCharge[] = detectRecurring(input).filter((r) => !NON_DISCRETIONARY.has(r.category)).map((r) => {
    const watch = watches.find((w) => normalizeMerchant(w.rule.merchant) === r.key);
    if (watch) {
      applied.add(watch.id);
      const ceiling = Math.floor(watch.rule.approvedAmountMinor * (1 + Math.max(0, watch.rule.tolerancePercent) / 100));
      return {
        ...r,
        status: r.latestAmountMinor > ceiling ? "above_approved" : "approved",
        approvedAmountMinor: watch.rule.approvedAmountMinor,
        memory: memoryRef(watch),
      };
    }
    return {
      ...r,
      status: r.changeMinor !== 0 ? "price_change" : "untracked",
      approvedAmountMinor: null,
      memory: null,
    };
  });

  // ── Category pacing ──────────────────────────────────────────────────────
  const mtd = new Map<string, number>();
  const trailing = new Map<string, Map<number, number>>();
  for (const tx of input.transactions) {
    if (tx.direction !== "out" || tx.status !== "posted" || tx.currency !== currency) continue;
    if (tx.timestamp > asOf) continue;
    const category = normalizeCategory(tx.category);
    if (tx.timestamp >= monthStart) {
      mtd.set(category, (mtd.get(category) ?? 0) + tx.amountMinor);
    } else if (tx.timestamp >= trailingStart) {
      const month = tx.timestamp.getUTCFullYear() * 12 + tx.timestamp.getUTCMonth();
      const byMonth = trailing.get(category) ?? new Map<number, number>();
      byMonth.set(month, (byMonth.get(month) ?? 0) + tx.amountMinor);
      trailing.set(category, byMonth);
    }
  }

  const categoryNames = new Set([...mtd.keys(), ...trailing.keys(), ...limits.map((l) => normalizeCategory(l.rule.category))]);
  const categories: CategoryPace[] = [];
  for (const category of categoryNames) {
    if (NON_DISCRETIONARY.has(category)) continue;
    const monthToDate = mtd.get(category) ?? 0;
    const months = trailing.get(category);
    const monthsObserved = months?.size ?? 0;
    const usual = monthsObserved > 0 ? Math.round([...months!.values()].reduce((s, v) => s + v, 0) / monthsObserved) : 0;
    // Linear pacing is meaningless in the first week; never project below what is already spent.
    const projected = dayOfMonth >= 7 ? Math.max(monthToDate, Math.round((monthToDate * daysInMonth) / dayOfMonth)) : Math.max(monthToDate, usual);

    const limit = limits.find((l) => normalizeCategory(l.rule.category) === category);
    let status: CategoryPace["status"];
    if (limit) {
      applied.add(limit.id);
      const cap = limit.rule.monthlyLimitMinor;
      status = monthToDate > cap ? "over_limit" : projected > cap ? "trending_over" : monthToDate >= cap * 0.8 ? "near_limit" : "within_limit";
    } else {
      status = usual > 0 && dayOfMonth >= 7 && projected > usual * 1.25 ? "above_usual" : "usual";
    }
    categories.push({
      category,
      monthToDateMinor: monthToDate,
      projectedMinor: projected,
      usualMonthlyMinor: usual,
      monthsObserved,
      limitMinor: limit?.rule.monthlyLimitMinor ?? null,
      remainingMinor: limit ? limit.rule.monthlyLimitMinor - monthToDate : null,
      status,
      memory: limit ? memoryRef(limit) : null,
    });
  }
  categories.sort((a, b) => b.monthToDateMinor - a.monthToDateMinor || b.usualMonthlyMinor - a.usualMonthlyMinor);

  // ── Alerts: memory-driven only ───────────────────────────────────────────
  const alerts: SpendAlert[] = [];
  for (const c of categories) {
    if (!c.memory || c.limitMinor === null) continue;
    if (c.status === "over_limit") {
      alerts.push({
        key: `limit:${c.category}`,
        kind: "category_over_limit",
        title: `${title(c.category)} is ${formatMinor(c.monthToDateMinor - c.limitMinor, currency)} over your limit`,
        detail: `${formatMinor(c.monthToDateMinor, currency)} spent this month against the ${formatMinor(c.limitMinor, currency)} limit you set.`,
        amountMinor: c.monthToDateMinor - c.limitMinor,
        memory: c.memory,
      });
    } else if (c.status === "trending_over") {
      alerts.push({
        key: `limit:${c.category}`,
        kind: "category_trending_over",
        title: `${title(c.category)} is on pace to pass your ${formatMinor(c.limitMinor, currency)} limit`,
        detail: `${formatMinor(c.monthToDateMinor, currency)} spent by day ${dayOfMonth}; at this pace the month ends near ${formatMinor(c.projectedMinor, currency)}. ${formatMinor(Math.max(0, c.remainingMinor ?? 0), currency)} left.`,
        amountMinor: c.projectedMinor - c.limitMinor,
        memory: c.memory,
      });
    }
  }
  for (const r of recurring) {
    if (r.status !== "above_approved" || !r.memory || r.approvedAmountMinor === null) continue;
    alerts.push({
      key: `sub:${r.key}`,
      kind: "subscription_above_approved",
      title: `${r.merchant} charged ${formatMinor(r.latestAmountMinor, currency)} — you approved ${formatMinor(r.approvedAmountMinor, currency)}`,
      detail: `That is ${formatMinor((r.latestAmountMinor - r.approvedAmountMinor) * PER_YEAR[r.cadence], currency)} more per year than the price you agreed to keep.`,
      amountMinor: r.latestAmountMinor - r.approvedAmountMinor,
      memory: r.memory,
    });
  }

  // ── Proposals: heuristics the user may turn into memory ─────────────────
  const proposals: SpendProposal[] = [];
  for (const r of recurring) {
    if (r.memory) continue;
    const changed = r.changeMinor !== 0;
    proposals.push({
      key: `sub:${r.key}`,
      kind: "SUBSCRIPTION_WATCH",
      title: changed
        ? `${r.merchant} went from ${formatMinor(r.usualAmountMinor, currency)} to ${formatMinor(r.latestAmountMinor, currency)}`
        : `Watch ${r.merchant} at ${formatMinor(r.latestAmountMinor, currency)}/${r.cadence === "monthly" ? "mo" : r.cadence === "weekly" ? "wk" : "yr"}`,
      detail: `${r.charges} ${r.cadence} charges · ${formatMinor(r.annualCostMinor, currency)} a year. Approve a price and LANDED flags any charge above it.`,
      summary: `Approved ${r.merchant} at ${formatMinor(r.latestAmountMinor, currency)} per ${r.cadence.replace("ly", "")}; flag charges more than 5% above it.`,
      lesson: `The user approved ${r.merchant} as a ${r.cadence} charge of ${formatMinor(r.latestAmountMinor, currency)}. A later charge above that price is a change the user has not agreed to and should be surfaced.`,
      rule: { kind: "SUBSCRIPTION_WATCH", merchant: r.merchant, approvedAmountMinor: r.latestAmountMinor, currency, tolerancePercent: 5 },
      suggestedAmountMinor: r.latestAmountMinor,
      priority: changed ? 3 : 1,
    });
  }
  for (const c of categories) {
    if (c.memory || c.usualMonthlyMinor <= 0) continue;
    // Subscriptions are better watched per merchant than as one pooled limit.
    if (c.category === "subscriptions") continue;
    const suggested = roundUpTo(c.usualMonthlyMinor, 1000);
    proposals.push({
      key: `limit:${c.category}`,
      kind: "SPEND_LIMIT",
      title: c.status === "above_usual"
        ? `${title(c.category)} is running ${formatMinor(c.projectedMinor - c.usualMonthlyMinor, currency)} above your usual month`
        : `Set a monthly limit for ${c.category}`,
      detail: `Usual month ${formatMinor(c.usualMonthlyMinor, currency)} (${c.monthsObserved} month${c.monthsObserved === 1 ? "" : "s"} observed) · ${formatMinor(c.monthToDateMinor, currency)} so far this month.`,
      summary: `Keep ${c.category} at or under ${formatMinor(suggested, currency)} per month.`,
      lesson: `The user set a monthly ${c.category} limit of ${formatMinor(suggested, currency)}, based on a usual month of ${formatMinor(c.usualMonthlyMinor, currency)}. Warn before a purchase would exceed it and when the month is pacing over.`,
      rule: { kind: "SPEND_LIMIT", category: c.category, monthlyLimitMinor: suggested, currency },
      suggestedAmountMinor: suggested,
      priority: c.status === "above_usual" ? 2 : 1,
    });
  }
  proposals.sort((a, b) => b.priority - a.priority);

  const recurringMonthly = recurring.reduce((s, r) => s + Math.round(r.annualCostMinor / 12), 0);

  return {
    asOf: asOf.toISOString(),
    currency,
    dayOfMonth,
    daysInMonth,
    recurring,
    categories,
    alerts,
    proposals,
    recurringMonthlyMinor: recurringMonthly,
    monthToDateMinor: [...mtd.entries()].filter(([c]) => !NON_DISCRETIONARY.has(c)).reduce((s, [, v]) => s + v, 0),
    memoriesApplied: applied.size,
  };
}

/** Check a prospective purchase against a learned category limit. */
export function checkPurchase(
  watch: SpendWatchResult,
  category: string,
  amountMinor: number,
): { category: CategoryPace; fits: boolean; remainingAfterMinor: number } | null {
  const pace = watch.categories.find((c) => c.category === normalizeCategory(category));
  if (!pace || pace.limitMinor === null) return null;
  const remainingAfter = pace.limitMinor - pace.monthToDateMinor - amountMinor;
  return { category: pace, fits: remainingAfter >= 0, remainingAfterMinor: remainingAfter };
}

function title(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
