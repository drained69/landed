import { startOfMonth, endOfMonth } from "date-fns";
import { prisma, parseJson } from "@/server/db";
import { formatMinor } from "@/lib/money";
import type { DecisionAction, DecisionType } from "@/lib/types";
import { generateDecision } from "./decisions";
import { getFinancialContext, buildDecisionInput } from "./financial";
import { recallApplicableMemories, recallJournal } from "./memory";
import { computeCashFlow } from "@/server/engine/cashflow";
import { rankRoutes } from "@/server/engine/routes";
import { cashFlowInputFromSnapshot } from "./financial";
import { getSpendWatch, matchCategory } from "./spending";
import { checkPurchase } from "@/server/engine/spending";

export interface AskResponse {
  kind: "decision" | "answer" | "learning" | "routes" | "clarify";
  message: string;
  decision?: Awaited<ReturnType<typeof generateDecision>>;
  cards?: { label: string; value: string; detail?: string; tone?: "default" | "success" | "warning" }[];
  memories?: { id: string; summary: string; blobId: string | null; confidence: number }[];
  suggestions?: string[];
  warning?: string | null;
}

const AMOUNT_RE = /(?:\$|usd\s*)?(\d[\d,]*(?:\.\d{1,2})?)\s*(?:dollars?|usd)?/i;

function extractAmount(message: string): number | null {
  const match = message.match(AMOUNT_RE);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

function detectType(message: string): DecisionType {
  const m = message.toLowerCase();
  if (/\bsave|saving|savings|set aside|put away\b/.test(m)) return "save";
  if (/\bspend|buy|purchase|afford\b/.test(m)) return "spend";
  if (/\bsend|transfer|remit|pay my|pay\b/.test(m) && !/bill/.test(m)) return "send";
  return "affordability";
}

function recipient(message: string): string | null {
  const toMatch = message.match(/\bto\s+(?:my\s+)?([a-z][a-z\s'-]{1,40})(?:\s+(?:today|tomorrow|this|before|after|via|through|by)\b|[.?!]|$)/i);
  if (toMatch) return toMatch[1].trim();
  return null;
}

export async function askLanded(userId: string, message: string): Promise<AskResponse> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const m = message.toLowerCase();
  const currency = user.preferredCurrency;

  if (/\b(what did you (tell|advise|say|recommend)|last time|previously|advice history|journal)\b/.test(m)) {
    const journal = await recallJournal(userId, message, 4);
    if (journal.hits.length === 0) {
      return {
        kind: "answer",
        message: "I have no journal of past advice yet. Turn on the decision journal in Memory and every answer I give — the question, the advice and why — is kept on Walrus so I can tell you later.",
        warning: journal.error,
      };
    }
    const top = journal.hits[0];
    return {
      kind: "learning",
      message: `${top.createdAt ? `On ${new Date(top.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Previously"} you asked “${top.question}”. I said: ${top.advice}. Because: ${top.because}`,
      cards: journal.hits.slice(0, 3).map((h) => ({
        label: h.createdAt ? new Date(h.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Earlier",
        value: h.advice,
        detail: `${h.question}${h.blobId ? ` · Walrus blob ${h.blobId.slice(0, 10)}…` : " · local journal"}`,
      })),
      warning: journal.error,
      suggestions: ["What did you learn from my last transfer?", "Can I send $300 to my sister today?"],
    };
  }

  if (/\b(what did you learn|last transfer|remember about|learn from|memory|memories)\b/.test(m)) {
    const last = await prisma.financialDecision.findFirst({
      where: { userId, status: "evaluated" },
      orderBy: { createdAt: "desc" },
      include: { outcomes: true, memories: true },
    });
    if (!last) {
      return {
        kind: "learning",
        message: "I have not evaluated a completed money movement yet. Record an outcome for a decision and I can show the prediction error, the lesson, and its Walrus write status.",
        suggestions: ["Can I send $300 today?", "How much can I safely save this week?"],
        warning: null,
      };
    }
    const outcome = last.outcomes[0];
    const confirmed = last.memories.filter((mem) => mem.writeStatus === "confirmed");
    return {
      kind: "learning",
      message: `From “${last.objective}”: the outcome was ${outcome?.outcomeStatus ?? "not evaluated"}. ${outcome?.shortfallOccurred ? "A shortfall occurred, so I created a correction lesson rather than treating the original advice as correct." : "The outcome was within tolerance, so the lesson has lower confidence."}`,
      cards: [
        {
          label: "Learned lesson",
          value: last.memories[0]?.summary ?? "No lesson recorded",
          detail: last.memories[0]?.lesson,
          tone: "default",
        },
        {
          label: "Walrus status",
          value: confirmed.length > 0 ? "Confirmed on Mainnet" : "Local rehearsal / not confirmed",
          detail: confirmed[0]?.walrusBlobId ? `Blob ${confirmed[0].walrusBlobId.slice(0, 18)}…` : "No blob ID has been returned. LANDED does not count this as a Mainnet write.",
          tone: confirmed.length > 0 ? "success" : "warning",
        },
      ],
      memories: last.memories.map((mem) => ({ id: mem.id, summary: mem.summary, blobId: mem.walrusBlobId, confidence: mem.confidence })),
      warning: null,
    };
  }

  if (/\bwhy\b/.test(m) && /\b(smaller|less|reduce|change|recommend|advice)\b/.test(m)) {
    const last = await prisma.financialDecision.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (!last) {
      return { kind: "answer", message: "I have not made a recommendation yet. Ask me about a specific move and I will show the inputs and memories behind it.", warning: null };
    }
    const recommended = parseJson<DecisionAction | null>(last.recommendedAction, null);
    const baseline = parseJson<DecisionAction | null>(last.baselineAction, null);
    const refs = parseJson<{ memoryId: string; label: string; code: string }[]>(last.memoryReferences, []);
    const memories = refs.length > 0
      ? await prisma.memoryRecord.findMany({ where: { userId, id: { in: refs.map((r) => r.memoryId) } } })
      : [];
    return {
      kind: "answer",
      message: recommended && baseline
        ? `Without memory I would have recommended moving ${formatMinor(baseline.amountMinor, baseline.currency)}. I recommended ${formatMinor(recommended.amountMinor, recommended.currency)} because ${refs.length > 0 ? "previously confirmed lessons changed the constraint set" : "the baseline arithmetic already protected your obligations"}.`
        : "There is no baseline to compare for the latest decision.",
      cards: [
        { label: "Without memory", value: baseline ? formatMinor(baseline.amountMinor, baseline.currency) : "—", detail: baseline?.rationale },
        { label: "With memory", value: recommended ? formatMinor(recommended.amountMinor, recommended.currency) : "—", detail: recommended?.rationale, tone: "success" },
      ],
      memories: memories.map((mem) => ({ id: mem.id, summary: mem.summary, blobId: mem.walrusBlobId, confidence: mem.confidence })),
      warning: null,
    };
  }

  if (/\b(committed|bills|obligations|due)\b/.test(m) && !/\b(send|transfer)\b/.test(m)) {
    const context = await getFinancialContext(userId);
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const thisMonth = context.commitments.filter(
      (c) => c.status === "upcoming" && c.dueDate >= monthStart && c.dueDate <= monthEnd && c.currency === currency,
    );
    const total = thisMonth.reduce((sum, c) => sum + c.amountMinor, 0);
    const next = context.commitments
      .filter((c) => c.status === "upcoming" && c.dueDate >= now)
      .slice(0, 4);
    return {
      kind: "answer",
      message: `You have ${formatMinor(total, currency)} in upcoming recorded commitments this month. ${next.length > 0 ? `The next one is ${next[0].name} for ${formatMinor(next[0].amountMinor, next[0].currency)} on ${next[0].dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` : ""}`,
      cards: [
        { label: "This month", value: formatMinor(total, currency), detail: `${thisMonth.length} commitments` },
        ...next.slice(0, 3).map((c) => ({
          label: c.name,
          value: formatMinor(c.amountMinor, c.currency),
          detail: `Due ${c.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        })),
      ],
      warning: null,
    };
  }

  if (/\bsafe to move|how much can i (?:safely )?(?:move|spend|use)|safe amount\b/.test(m)) {
    const { snapshot } = await buildDecisionInput({
      userId, decisionType: "affordability", amountMinor: null, currency, includeExpectedIncome: false,
    });
    const retrieval = await recallApplicableMemories(userId, "safe to move obligations buffer", { limit: 4 });
    const cf = computeCashFlow(cashFlowInputFromSnapshot(snapshot, retrieval.memories));
    return {
      kind: "answer",
      message: `About ${formatMinor(cf.safeToMoveMinor, currency)} is safe to move right now. That is after protecting ${formatMinor(cf.essentialCommitmentsMinor, currency)} in essential commitments, ${formatMinor(cf.variableSpendReserveMinor, currency)} of near-term variable spending, and a ${formatMinor(cf.effectiveSafetyBufferMinor, currency)} buffer.`,
      cards: [
        { label: "Cleared funds", value: formatMinor(cf.clearedLiquidMinor, currency) },
        { label: "Protected", value: formatMinor(cf.essentialCommitmentsMinor + cf.variableSpendReserveMinor + cf.effectiveSafetyBufferMinor, currency) },
        { label: "Safe to move", value: formatMinor(cf.safeToMoveMinor, currency), tone: "success" },
        { label: "Confidence", value: `${Math.round(cf.confidence * 100)}%`, detail: cf.missingInputs[0] },
      ],
      memories: retrieval.memories.map((mem) => ({ id: mem.id, summary: mem.summary, blobId: mem.blobId, confidence: mem.confidence })),
      warning: retrieval.error,
      suggestions: ["Can I send $300 to my sister today?", "What did you learn from my last transfer?"],
    };
  }

  if (/\b(best|cheapest|fastest|route|way to send|compare)\b/.test(m) && /\b(send|transfer|remit|way)\b/.test(m)) {
    const amount = extractAmount(message) ?? 15000;
    const dest = recipient(message);
    const { snapshot } = await buildDecisionInput({
      userId, decisionType: "send", amountMinor: amount, currency,
      destinationLabel: dest, destinationCurrency: currency,
    });
    const retrieval = await recallApplicableMemories(userId, `route fee delivery reliability ${dest ?? ""} ${currency}`, { limit: 6 });
    const comparison = rankRoutes(snapshot.routeQuotes, retrieval.memories, { preference: "balanced" }, new Date(snapshot.asOf));
    if (comparison.quotes.length === 0) {
      return {
        kind: "routes",
        message: "I do not have eligible route quotes for that corridor and amount. Add a user-entered provider quote in Plan a Move; I will not invent live remittance prices.",
        warning: comparison.notes.join(" "),
      };
    }
    return {
      kind: "routes",
      message: `${comparison.best?.quote.routeName} ranks first for ${formatMinor(amount, currency)} ${comparison.corridor}. It is expected to deliver ${formatMinor(comparison.best?.expectedReceivedMinor ?? 0, currency)} after ${formatMinor(comparison.best?.totalCostMinor ?? 0, currency)} in quoted costs.`,
      cards: comparison.quotes.map((q) => ({
        label: `${q.rank}. ${q.quote.routeName}`,
        value: formatMinor(q.expectedReceivedMinor, q.quote.destinationCurrency),
        detail: `${formatMinor(q.totalCostMinor, q.quote.originCurrency)} cost · ${q.quote.estimatedDeliveryHours}h · ${q.confidence} confidence`,
        tone: q.rank === 1 ? "success" : "default",
      })),
      memories: retrieval.memories.map((mem) => ({ id: mem.id, summary: mem.summary, blobId: mem.blobId, confidence: mem.confidence })),
      warning: comparison.notes.join(" ") || retrieval.error,
    };
  }

  if (/\b(subscriptions?|recurring|spend watch|overspend|over budget|limits?)\b/.test(m) && extractAmount(message) === null) {
    const watch = await getSpendWatch(userId);
    return {
      kind: "answer",
      message: watch.alerts.length > 0
        ? `${watch.alerts.length} thing${watch.alerts.length === 1 ? " is" : "s are"} outside what you told me to hold: ${watch.alerts.map((a) => a.title).join("; ")}.`
        : `Everything is inside the limits and prices you approved. You have ${watch.recurring.length} recurring charges costing about ${formatMinor(watch.recurringMonthlyMinor, currency)} a month.`,
      cards: [
        ...watch.alerts.slice(0, 3).map((a) => ({ label: "Alert", value: a.title, detail: `Because: ${a.memory.summary}`, tone: "warning" as const })),
        { label: "Recurring per month", value: formatMinor(watch.recurringMonthlyMinor, currency), detail: `${watch.recurring.length} charges detected` },
      ],
      memories: watch.alerts.map((a) => ({ id: a.memory.memoryId, summary: a.memory.summary, blobId: a.memory.blobId, confidence: 0.85 })),
      suggestions: ["Can I spend $60 on dining tonight?", "How much is safe to move?"],
      warning: null,
    };
  }

  const type = detectType(message);
  const amount = extractAmount(message);
  const dest = recipient(message);
  if (type === "affordability" && amount === null && !/\b(save|spend|send|transfer)\b/.test(m)) {
    return {
      kind: "clarify",
      message: "I can answer questions about your cleared funds, safe-to-move amount, upcoming bills, route options, and what I learned from prior outcomes. For a specific move, tell me the amount and destination.",
      suggestions: [
        "Can I send $300 to my sister today?",
        "How much can I safely save this week?",
        "What is my best way to send $150?",
        "What did you learn from my last transfer?",
        "How much have I committed to bills this month?",
        "Any subscriptions or limits I should know about?",
        "What did you tell me last time I asked about sending money?",
      ],
      warning: null,
    };
  }

  const result = await generateDecision(userId, {
    decisionType: type === "affordability" ? "spend" : type,
    amountMinor: amount,
    currency,
    destinationLabel: dest,
    destinationCurrency: currency,
    objective: message.slice(0, 400),
    includeExpectedIncome: false,
  });

  // A learned category limit can change the answer even when cash flow says yes.
  let limitNote: string | null = null;
  let limitCard: NonNullable<AskResponse["cards"]>[number] | null = null;
  let limitMemory: NonNullable<AskResponse["memories"]>[number] | null = null;
  if (amount !== null && (type === "spend" || type === "affordability")) {
    const watch = await getSpendWatch(userId);
    const category = matchCategory(watch, message);
    const check = category ? checkPurchase(watch, category, amount) : null;
    if (check?.category.memory) {
      const limit = formatMinor(check.category.limitMinor ?? 0, currency);
      limitNote = check.fits
        ? `It also fits your ${check.category.category} limit: ${formatMinor(check.remainingAfterMinor, currency)} of ${limit} left afterwards.`
        : `But it would put ${check.category.category} ${formatMinor(-check.remainingAfterMinor, currency)} over the ${limit} monthly limit you asked me to hold. Cash-wise it is possible; by your own rule it is a no.`;
      limitCard = {
        label: `${check.category.category} limit (remembered)`,
        value: check.fits ? `${formatMinor(check.remainingAfterMinor, currency)} left after` : `${formatMinor(-check.remainingAfterMinor, currency)} over`,
        detail: `${formatMinor(check.category.monthToDateMinor, currency)} spent of ${limit} this month`,
        tone: check.fits ? "success" : "warning",
      };
      limitMemory = { id: check.category.memory.memoryId, summary: check.category.memory.summary, blobId: check.category.memory.blobId, confidence: 0.85 };
    }
  }

  return {
    kind: "decision",
    message: [`${result.result.action.headline}.`, limitNote, result.result.action.rationale].filter(Boolean).join(" "),
    decision: result,
    cards: [
      ...(limitCard ? [limitCard] : []),
      {
        label: "Recommended",
        value: formatMinor(result.result.action.amountMinor, currency),
        detail: result.result.action.timing === "wait_for_income" ? "Send the remainder after confirmed income" : "Today",
        tone: "success",
      },
      {
        label: "Safe to move",
        value: formatMinor(result.result.cashflow.safeToMoveMinor, currency),
        detail: `Confidence ${Math.round(result.result.confidence * 100)}%`,
      },
      {
        label: "After the move",
        value: formatMinor(result.result.predicted.projectedBufferAfterMinor, currency),
        detail: "Projected buffer above obligations",
        tone: result.result.predicted.projectedBufferAfterMinor < 0 ? "warning" : "default",
      },
    ],
    memories: [
      ...(limitMemory ? [limitMemory] : []),
      ...result.retrieval.memories.map((mem) => ({ id: mem.id, summary: mem.summary, blobId: mem.blobId, confidence: mem.confidence })),
    ],
    warning: result.retrieval.error,
    suggestions: ["Show me the route comparison", "Why did you recommend this amount?", "What did you learn from my last transfer?"],
  };
}
