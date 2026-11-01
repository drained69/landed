"use client";

import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, Brain, CalendarClock, ChevronRight, CircleAlert,
  Landmark, PiggyBank, Sparkles, Wallet,
} from "lucide-react";
import type { getDashboard } from "@/server/services/financial";
import { formatMinor } from "@/lib/money";
import { Badge, Card, CardHeader } from "@/components/ui";
import { CashflowChart } from "@/components/CashflowChart";
import { LearningCurveChart, type LearningWeekPoint } from "@/components/LearningCurveChart";

type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
type Curve = {
  weeks: LearningWeekPoint[];
  summary: {
    outcomes: number; achieved: number; rulesInForce: number; rulesAtStart: number; lessonsLearned: number;
    sinceMiss: { weekLabel: string; lessonsLearned: number; outcomes: number; achieved: number } | null;
  };
};
type SpendSummary = { alerts: { key: string; title: string; memorySummary: string }[]; recurringMonthlyMinor: number };

function daysLabel(days: number) {
  if (days <= 0) return "Due now";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function firstSentence(value: string) {
  const match = value.match(/^.*?[.!?](?:\s|$)/);
  return match ? match[0].trim() : value;
}

const modeLabel: Record<string, { label: string; tone: "lime" | "amber" | "sky" }> = {
  walrus: { label: "Live Walrus recall", tone: "lime" },
  local_rehearsal: { label: "Saved account lessons", tone: "amber" },
  mixed: { label: "Walrus and account lessons", tone: "sky" },
};

export function DashboardView({ data, curve, spend }: { data: Dashboard; curve: Curve; spend: SpendSummary }) {
  const cf = data.cashflow;
  const mode = modeLabel[data.memoryRetrieval.mode] ?? modeLabel.local_rehearsal;
  const cleared = Math.max(1, cf.clearedLiquidMinor);
  const segments = [
    { label: "Bills", value: cf.essentialCommitmentsMinor, color: "bg-sky/70" },
    { label: "Spending", value: cf.variableSpendReserveMinor, color: "bg-[#8b9c7b]" },
    { label: "Buffer", value: cf.effectiveSafetyBufferMinor, color: "bg-amber/70" },
    { label: "Safe", value: cf.safeToMoveMinor, color: "bg-lime" },
  ];
  const dateLabel = new Date(data.asOf).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  type RecommendedAction = { amountMinor: number; headline: string; currency: string };
  const pending = data.pendingDecisions.map((decision) => {
    let recommended: RecommendedAction | null = null;
    try {
      recommended = JSON.parse(decision.recommendedAction) as RecommendedAction;
    } catch {
      recommended = null;
    }
    return { ...decision, recommended };
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted/80">{dateLabel}</p>
          <h1 className="mt-1.5 font-display text-[30px] leading-tight text-cream sm:text-[36px]">
            Welcome, {data.user.name.trim().split(/\s+/)[0] || "there"}.
          </h1>
          <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-muted">{data.user.mainObjective ?? "Plan your spending while keeping bills and your safety buffer covered."}</p>
        </div>
        <div className="flex items-center gap-2">
          {data.user.isDemo ? <Badge tone="amber">Demo data</Badge> : null}
          <Badge tone={mode.tone}>{mode.label}</Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Card className="relative overflow-hidden">
          <div className="absolute -right-24 -top-28 h-64 w-64 rounded-full bg-[#f6b897]/25 blur-3xl" />
          <div className="relative p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-lime pulse-dot" /> Safe to move now
                </p>
                <p className="mt-4 font-display text-[52px] leading-none tracking-[-0.04em] text-lime sm:text-[64px]">
                  {formatMinor(cf.safeToMoveMinor, data.baseCurrency)}
                </p>
                <p className="mt-3 max-w-md text-[12px] leading-relaxed text-muted">
                  {cf.safeToMoveMinor > 0
                    ? `After ${formatMinor(cf.essentialCommitmentsMinor, data.baseCurrency)} in protected commitments, ${formatMinor(cf.variableSpendReserveMinor, data.baseCurrency)} of near-term spending, and a ${formatMinor(cf.effectiveSafetyBufferMinor, data.baseCurrency)} buffer.`
                    : "Everything currently cleared is needed for near-term obligations. LANDED will not recommend moving money today."}
                </p>
                {cf.safeToMoveMinor <= 0 && cf.projectedMinBalanceMinor < cf.effectiveSafetyBufferMinor ? (
                  <p className="mt-2 max-w-md text-[11.5px] leading-relaxed text-amber/90">
                    Bills in the next 45 days take your balance to {formatMinor(cf.projectedMinBalanceMinor, data.baseCurrency)}
                    {cf.projectedMinDate ? ` by ${new Date(cf.projectedMinDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                    {cf.expectedIncomeExcludedMinor > 0
                      ? <>, before the {formatMinor(cf.expectedIncomeExcludedMinor, data.baseCurrency)} of expected income LANDED waits to see land. <Link href="/app/plan" className="underline decoration-amber/40 underline-offset-2 hover:text-amber">Plan a move</Link> with “count expected income” to compare.</>
                      : <>, and no income is recorded yet. <Link href="/app/activity" className="underline decoration-amber/40 underline-offset-2 hover:text-amber">Add your paycheck</Link> so LANDED can forecast it.</>}
                  </p>
                ) : null}
              </div>
              <Link href="/app/plan" className="group hidden shrink-0 items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12px] font-medium text-white transition hover:bg-black/80 sm:flex">
                Plan a move <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <div className="mt-7">
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-black/[0.05]">
                {segments.map((segment) => (
                  <div key={segment.label} className={`${segment.color} shrink-0`} style={{ width: `${Math.max(0, Math.min(100, (segment.value / cleared) * 100))}%` }} title={`${segment.label}: ${formatMinor(segment.value, data.baseCurrency)}`} />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                {segments.map((segment) => (
                  <span key={segment.label} className="flex items-center gap-1.5 text-[10px] text-muted">
                    <span className={`h-1.5 w-1.5 rounded-full ${segment.color}`} /> {segment.label} <span className="tabular-nums text-cream/70">{formatMinor(segment.value, data.baseCurrency)}</span>
                  </span>
                ))}
                <span className="flex items-center gap-1.5 text-[10px] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-black/20" /> Cleared <span className="tabular-nums text-cream/70">{formatMinor(cf.clearedLiquidMinor, data.baseCurrency)}</span>
                </span>
              </div>
            </div>

            <div className="mt-6 grid gap-3 border-t border-black/[0.07] pt-4 sm:grid-cols-3">
              <div>
                <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted">Projected low point</p>
                <p className="mt-1 text-[15px] tabular-nums text-cream">{formatMinor(cf.projectedMinBalanceMinor, data.baseCurrency)}</p>
                <p className="text-[10px] text-muted">{cf.projectedMinDate ? new Date(cf.projectedMinDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "45-day horizon"}</p>
              </div>
              <div>
                <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted">Estimate confidence</p>
                <p className="mt-1 text-[15px] tabular-nums text-cream">{Math.round(cf.confidence * 100)}%</p>
                <p className="text-[10px] text-muted">{cf.missingInputs.length > 0 ? firstSentence(cf.missingInputs[0]) : "All required inputs present"}</p>
              </div>
              <div>
                <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted">Memory applied</p>
                <p className="mt-1 text-[15px] tabular-nums text-cream">{cf.appliedMemories.length}</p>
                <p className="text-[10px] text-muted">{cf.effects.length > 0 ? cf.effects[0].label : "No lesson adjusted this estimate"}</p>
              </div>
            </div>

            <Link href="/app/plan" className="mt-5 flex h-10 items-center justify-center gap-2 rounded-full bg-ink text-[12.5px] font-medium text-white sm:hidden">
              Plan a move <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-[10.5px] uppercase tracking-[0.13em] text-muted">Learning</p>
              <Link href="/app/learning" aria-label="View your lessons" className="text-muted transition hover:text-lime"><ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-display text-[34px] leading-none text-cream">{curve.summary.rulesInForce}</span>
              <span className="text-[11px] text-muted">rules learned from you</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              {curve.summary.sinceMiss
                ? <>After the shortfall in the week of {curve.summary.sinceMiss.weekLabel}, it learned <span className="text-cream">{curve.summary.sinceMiss.lessonsLearned} lessons</span>; <span className="text-lime">{curve.summary.sinceMiss.achieved} of {curve.summary.sinceMiss.outcomes}</span> recorded outcomes since met the plan.</>
                : <>{curve.summary.achieved} of {curve.summary.outcomes} recorded outcomes met the plan.</>}
            </p>
            <div className="mt-2">
              <LearningCurveChart weeks={curve.weeks} height={72} compact />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              {data.learning.confirmedMemoryCount > 0
                ? `${data.learning.confirmedMemoryCount} confirmed with a Walrus blob ID.`
                : "Lessons are saved in your account. No Walrus write has been confirmed yet."}
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-black/[0.07] pt-3 text-[10.5px]">
              <span className="text-muted">Evaluated outcomes</span>
              <span className="tabular-nums text-cream">{data.learning.evaluatedCount}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10.5px]">
              <span className="text-muted">Shortfalls recorded</span>
              <span className={`tabular-nums ${data.learning.shortfalls > 0 ? "text-red" : "text-cream"}`}>{data.learning.shortfalls}</span>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-[10.5px] uppercase tracking-[0.13em] text-muted">Balances by currency</p>
              <Wallet className="h-3.5 w-3.5 text-muted" />
            </div>
            <div className="mt-4 space-y-2.5">
              {data.currencies.length === 0 ? <p className="text-[11px] text-muted">No accounts entered.</p> : null}
              {data.currencies.map((currency) => {
                const valuation = data.valuations.find((v) => v.currency === currency.currency);
                return (
                <div key={currency.currency} className="flex items-baseline justify-between gap-3">
                  <span className="text-[11px] text-muted">{currency.currency} <span className="text-muted/50">· {currency.accounts} acct</span></span>
                  <span className="text-right">
                    <span className="block text-[13px] tabular-nums text-cream">{formatMinor(currency.liquidMinor + currency.nonLiquidMinor, currency.currency)}</span>
                    {valuation ? (
                      <span className="block text-[9.5px] tabular-nums text-muted" title={`Tatum Data API · ${valuation.rate.source} · ${valuation.rate.timestamp}`}>
                        ≈ {formatMinor(valuation.valueMinor, data.baseCurrency)} at Tatum rate
                      </span>
                    ) : null}
                  </span>
                </div>
                );
              })}
            </div>
            <p className="mt-4 border-t border-black/[0.07] pt-3 text-[9.5px] leading-relaxed text-muted/70">Other currencies are valued only with a sourced Tatum Data API rate, for reference — never added to safe-to-move.</p>
          </Card>
        </div>
      </div>

      {spend.alerts.length > 0 ? (
        <Card className="border-amber/20">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.13em] text-amber">
                <CircleAlert className="h-3.5 w-3.5" /> Spending alerts
              </p>
              <ul className="mt-2 space-y-1">
                {spend.alerts.slice(0, 3).map((alert) => (
                  <li key={alert.key} className="text-[12.5px] text-cream">
                    {alert.title} <span className="text-[10.5px] text-muted">— remembered: “{alert.memorySummary}”</span>
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/app/spending" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-amber/30 px-4 text-[12px] text-amber transition hover:bg-amber/[0.08]">
              Open Spend Watch <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader
            title="Income and spending"
            subtitle="Recent income and expenses from your recorded transactions."
            right={<Link href="/app/activity" className="text-[11px] text-muted transition hover:text-lime">Ledger →</Link>}
          />
          <div className="px-3 pb-4 sm:px-5">
            <CashflowChart data={data.cashFlowSeries} currency={data.baseCurrency} />
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-black/[0.07] px-5 py-4">
            <div><p className="text-[9.5px] uppercase tracking-[0.11em] text-muted">Monthly income</p><p className="mt-1 text-[13.5px] tabular-nums text-cream">{formatMinor(data.monthlyIncomeMinor, data.baseCurrency)}</p></div>
            <div><p className="text-[9.5px] uppercase tracking-[0.11em] text-muted">Monthly expenses</p><p className="mt-1 text-[13.5px] tabular-nums text-cream">{formatMinor(data.monthlyExpenseMinor, data.baseCurrency)}</p></div>
            <div><p className="text-[9.5px] uppercase tracking-[0.11em] text-muted">Variable reserve / day</p><p className="mt-1 text-[13.5px] tabular-nums text-cream">{formatMinor(Math.round(cf.variableSpendReserveMinor / 14), data.baseCurrency)}</p></div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Upcoming obligations"
            subtitle="Essential and important bills reduce safe-to-move."
            right={<CalendarClock className="h-4 w-4 text-muted" />}
          />
          <div className="divide-y divide-black/[0.06] border-t border-black/[0.06]">
            {data.upcoming.length === 0 ? <p className="px-5 py-8 text-center text-[11.5px] text-muted">No upcoming commitments entered.</p> : null}
            {data.upcoming.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[12px] text-cream">{item.name}</p>
                  <p className="mt-0.5 text-[10px] text-muted">{daysLabel(item.daysUntil)} · {item.priority}</p>
                </div>
                <p className="shrink-0 text-[12.5px] tabular-nums text-cream/90">{formatMinor(item.amountMinor, item.currency)}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-black/[0.06] px-5 py-3">
            <Link href="/app/settings" className="flex items-center justify-between text-[10.5px] text-muted transition hover:text-lime">
              Manage bills and accounts <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader
            title="What memory changed"
            subtitle={data.memoryRetrieval.mode === "local_rehearsal" ? "Walrus is not configured here. These are local rehearsal lessons, not Mainnet writes." : "Recalled through the Walrus-backed memory layer."}
            right={<Brain className="h-4 w-4 text-lime" />}
          />
          <div className="space-y-3 border-t border-black/[0.06] px-5 py-4">
            {data.insights.map((insight, index) => (
              <div key={`${insight.title}-${index}`} className="rounded-xl border border-black/[0.07] bg-black/[0.015] p-3.5">
                <div className="flex items-center gap-2">
                  {insight.tone === "memory" ? <Brain className="h-3 w-3 text-lime" /> : insight.tone === "warning" ? <CircleAlert className="h-3 w-3 text-amber" /> : <Sparkles className="h-3 w-3 text-sky" />}
                  <p className="text-[10px] uppercase tracking-[0.11em] text-muted">{insight.title}</p>
                  {insight.memoryId ? <Link href="/app/learning" className="ml-auto text-muted/60 transition hover:text-lime"><ArrowUpRight className="h-3 w-3" /></Link> : null}
                </div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-cream/80">{insight.body}</p>
                {insight.blobId ? <p className="mt-1.5 truncate font-mono text-[9px] text-lime/60">blob {insight.blobId}</p> : null}
              </div>
            ))}
            {data.insights.length === 0 ? <p className="py-4 text-center text-[11.5px] text-muted">No lessons to show yet. Record an outcome to review what happened.</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Recent decisions"
            subtitle="Review each recommendation, its assumptions, and any recorded outcome."
            right={<Link href="/app/activity" className="text-[11px] text-muted transition hover:text-lime">All →</Link>}
          />
          <div className="divide-y divide-black/[0.06] border-t border-black/[0.06]">
            {pending.length === 0 ? <p className="px-5 py-8 text-center text-[11.5px] text-muted">No open decisions. Plan a move to create one.</p> : null}
            {pending.map((decision) => (
              <Link key={decision.id} href={`/app/decisions/${decision.id}`} className="group flex items-start justify-between gap-3 px-5 py-3.5 transition hover:bg-black/[0.02]">
                <div className="min-w-0">
                  <p className="truncate text-[12px] text-cream">{decision.objective}</p>
                  <p className="mt-0.5 text-[10px] text-muted">{new Date(decision.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {decision.status.replaceAll("_", " ")}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[12.5px] tabular-nums text-lime">{decision.recommended ? formatMinor(decision.recommended.amountMinor, decision.recommended.currency) : "—"}</p>
                  <ChevronRight className="ml-auto mt-0.5 h-3 w-3 text-muted/50 transition group-hover:translate-x-0.5 group-hover:text-lime" />
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Accounts" subtitle="Keep these balances up to date. Adding transactions does not automatically update account balances." right={<Link href="/app/settings" className="text-[11px] text-muted transition hover:text-lime">Manage →</Link>} />
        <div className="grid gap-px overflow-hidden border-t border-black/[0.06] bg-black/[0.05] sm:grid-cols-2 lg:grid-cols-3">
          {data.accounts.map((account) => (
            <div key={account.id} className="bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[11px] text-muted">
                  {account.accountType === "savings" ? <PiggyBank className="h-3.5 w-3.5" /> : account.accountType === "stablecoin" || account.accountType === "wallet" ? <Wallet className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />}
                  {account.accountType.replaceAll("_", " ")}
                </span>
                {account.isSynthetic ? <Badge tone="muted" className="text-[8.5px]">Synthetic</Badge> : null}
              </div>
              <p className="mt-3 truncate text-[12px] text-cream">{account.name}</p>
              <p className="mt-1 text-[18px] tabular-nums text-cream/95">{formatMinor(account.balanceMinor, account.currency)}</p>
              <div className="mt-2 flex items-center justify-between text-[9.5px] text-muted">
                <span>{account.isLiquid ? "Liquid" : "Reserved"}</span>
                <span className={account.verificationStatus === "verified_onchain" ? "text-lime" : ""}>{account.verificationStatus.replaceAll("_", " ")}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-black/[0.07] bg-black/[0.015] px-4 py-3">
        <p className="text-[10.5px] leading-relaxed text-muted">
          LANDED is a planning tool, not a bank or a money transmitter. Demo balances and outcomes are synthetic.
        </p>
        <Link href="/app/learning" className="shrink-0 text-[10.5px] text-lime transition hover:text-lime">Verify memory →</Link>
      </div>
    </div>
  );
}
