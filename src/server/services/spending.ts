import { subMonths } from "date-fns";
import { prisma } from "@/server/db";
import { formatMinor } from "@/lib/money";
import type { MemoryRule } from "@/lib/types";
import { computeSpendWatch, type SpendProposal, type SpendWatchResult } from "@/server/engine/spending";
import { recallRuleMemories, supersedeMemory, userNamespace, writeMemoryToWalrus, type RuleRecall } from "./memory";

const SPEND_RULES: MemoryRule["kind"][] = ["SPEND_LIMIT", "SUBSCRIPTION_WATCH"];
const SPEND_QUERY = "LANDED lesson spending limit per month category approved subscription price merchant charge";

export type SpendWatch = SpendWatchResult & { recall: Omit<RuleRecall, "memories"> };

export async function getSpendWatch(userId: string, options: { withMemory?: boolean; asOf?: Date } = {}): Promise<SpendWatch> {
  const asOf = options.asOf ?? new Date();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const [transactions, recall] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, direction: "out", timestamp: { gte: subMonths(asOf, 5), lte: asOf } },
      orderBy: { timestamp: "asc" },
    }),
    options.withMemory === false
      ? Promise.resolve<RuleRecall>({ memories: [], mode: "local_rehearsal", total: 0, recalled: 0, error: null })
      : recallRuleMemories(userId, SPEND_RULES, SPEND_QUERY, asOf),
  ]);
  const { memories, ...recallInfo } = recall;
  const result = computeSpendWatch({
    asOf,
    currency: user.preferredCurrency,
    transactions: transactions.map((t) => ({
      id: t.id,
      amountMinor: t.amountMinor,
      currency: t.currency,
      direction: t.direction,
      category: t.category,
      merchant: t.merchant,
      timestamp: t.timestamp,
      status: t.status,
    })),
    memories,
  });
  return { ...result, recall: recallInfo };
}

/**
 * Turn a Spend Watch proposal (or a change to an existing limit/approval) into a
 * user-confirmed typed memory, supersede the rule it replaces, and write it to
 * Walrus. The user's click is the confirmation; nothing here is automatic.
 */
export async function rememberSpendRule(userId: string, key: string, amountMinor?: number | null) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const watch = await getSpendWatch(userId);
  const currency = watch.currency;

  let proposal: Pick<SpendProposal, "kind" | "summary" | "lesson" | "rule"> | undefined =
    watch.proposals.find((p) => p.key === key);
  let replaces: string | null = null;

  if (!proposal) {
    // Updating an existing rule: rebuild it from the current observation.
    const [type, name] = key.split(":");
    if (type === "limit") {
      const pace = watch.categories.find((c) => c.category === name && c.memory);
      if (pace?.memory) {
        replaces = pace.memory.memoryId;
        proposal = {
          kind: "SPEND_LIMIT",
          summary: "",
          lesson: "",
          rule: { kind: "SPEND_LIMIT", category: pace.category, monthlyLimitMinor: pace.limitMinor ?? 0, currency },
        };
      }
    } else if (type === "sub") {
      const charge = watch.recurring.find((r) => r.key === name && r.memory);
      if (charge?.memory) {
        replaces = charge.memory.memoryId;
        proposal = {
          kind: "SUBSCRIPTION_WATCH",
          summary: "",
          lesson: "",
          rule: { kind: "SUBSCRIPTION_WATCH", merchant: charge.merchant, approvedAmountMinor: charge.latestAmountMinor, currency, tolerancePercent: 5 },
        };
      }
    }
  }
  if (!proposal) throw new Error("Spend Watch item not found");

  const rule = withAmount(proposal.rule, amountMinor);
  const { summary, lesson } = describe(rule, currency, replaces !== null);

  const memory = await prisma.memoryRecord.create({
    data: {
      userId,
      category: rule.kind === "SPEND_LIMIT" ? "preference" : "financial_pattern",
      summary,
      lesson,
      structuredRule: JSON.stringify(rule),
      conditions: JSON.stringify({ source: "spend_watch", key, currency }),
      evidenceRefs: JSON.stringify({ observedAt: watch.asOf, key }),
      confidence: 0.85,
      evidenceQuality: "user_confirmed",
      verificationStatus: "user_confirmed",
      namespace: userNamespace(user.email),
      writeStatus: "pending",
      source: "local_rehearsal",
      isSynthetic: user.isDemo,
      confirmedAt: new Date(),
    },
  });
  if (replaces) await supersedeMemory(userId, replaces, memory.id, "Replaced by a newer Spend Watch rule");

  await prisma.auditEvent.create({
    data: {
      userId,
      type: "memory.spend_rule.confirmed",
      entity: "MemoryRecord",
      entityId: memory.id,
      payload: JSON.stringify({ key, rule, replaces }),
    },
  });

  const write = await writeMemoryToWalrus(userId, memory.id);
  return { memory, write, replaces };
}

function withAmount(rule: MemoryRule, amountMinor?: number | null): MemoryRule {
  if (amountMinor === undefined || amountMinor === null) return rule;
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new Error("Amount must be a positive whole number of minor units");
  if (rule.kind === "SPEND_LIMIT") return { ...rule, monthlyLimitMinor: amountMinor };
  if (rule.kind === "SUBSCRIPTION_WATCH") return { ...rule, approvedAmountMinor: amountMinor };
  return rule;
}

function describe(rule: MemoryRule, currency: string, isUpdate: boolean): { summary: string; lesson: string } {
  if (rule.kind === "SPEND_LIMIT") {
    const amount = formatMinor(rule.monthlyLimitMinor, currency);
    return {
      summary: `${isUpdate ? "Updated: keep" : "Keep"} ${rule.category} at or under ${amount} per month.`,
      lesson: `The user set a monthly ${rule.category} limit of ${amount}. Warn before a purchase would exceed it and when the month is pacing over it.`,
    };
  }
  if (rule.kind === "SUBSCRIPTION_WATCH") {
    const amount = formatMinor(rule.approvedAmountMinor, currency);
    return {
      summary: `${isUpdate ? "Re-approved" : "Approved"} ${rule.merchant} at ${amount}; flag charges more than ${rule.tolerancePercent}% above it.`,
      lesson: `The user approved ${rule.merchant} at ${amount} per billing period. A charge above that price is a change the user has not agreed to and should be surfaced.`,
    };
  }
  throw new Error("Unsupported Spend Watch rule");
}

/** Find the learned limit that matches free text like "dinner out" or "groceries". */
export function matchCategory(watch: SpendWatchResult, message: string): string | null {
  const m = message.toLowerCase();
  const synonyms: Record<string, string[]> = {
    dining: ["dining", "dinner", "lunch", "restaurant", "eat out", "eating out", "takeout", "brunch"],
    food: ["food", "grocer", "groceries", "supermarket"],
    transport: ["transport", "uber", "taxi", "transit", "ride", "train", "bus"],
    shopping: ["shopping", "clothes", "shoes", "gadget", "amazon"],
    entertainment: ["entertainment", "concert", "movie", "cinema", "game", "tickets"],
  };
  for (const c of watch.categories) {
    if (c.limitMinor === null) continue;
    const words = [c.category, ...(synonyms[c.category] ?? [])];
    if (words.some((w) => m.includes(w))) return c.category;
  }
  return null;
}
