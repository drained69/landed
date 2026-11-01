"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Brain, Check, ChevronDown, CircleAlert, GitCompareArrows,
  Route, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { del, post, errorMessage } from "@/lib/client";
import { formatMinor } from "@/lib/money";
import { Badge, Button, Card, CardHeader, ErrorNote, Field, inputClass, selectClass, Toggle } from "@/components/ui";
import type { RouteComparison } from "@/lib/types";

type DecisionType = "send" | "save" | "spend" | "affordability";

type Action = {
  kind: string; amountMinor: number; currency: string; timing: string; timingDate?: string | null;
  routeName?: string | null; split?: { firstMinor: number; remainderMinor: number; remainderAfter: string | null; reason: string } | null;
  headline: string; rationale: string; riskLevel: string;
  adjustments: { code: string; label: string; detail: string; memoryId?: string; memoryBlobId?: string | null; deltaMinor?: number }[];
};


type GenerateResponse = {
  decision: { id: string; objective: string; createdAt: string; status: string; confidence: number };
  result: {
    action: Action; baselineAction: Action; assumptions: { key: string; label: string; detail: string; source: string }[];
    predicted: {
      amountSentMinor: number; expectedFeeMinor: number | null; expectedReceivedMinor: number | null;
      expectedDeliveryHours: number | null; projectedBufferAfterMinor: number; projectedMinBalanceMinor: number;
      obligationsCovered: { name: string; amountMinor: number; dueDate: string; covered: boolean }[];
      shortfallRisk: number;
    };
    confidence: number;
    cashflow: { safeToMoveMinor: number; essentialCommitmentsMinor: number; effectiveSafetyBufferMinor: number; variableSpendReserveMinor: number; clearedLiquidMinor: number; appliedMemories: { id: string; summary: string }[]; effects: { code: string; label: string; memoryId: string }[]; missingInputs: string[] };
    // Same shape the route engine returns: each ranked entry wraps its quote.
    routeComparison: RouteComparison;
  };
  retrieval: { mode: string; error: string | null; memories: { id: string; summary: string; blobId: string | null; confidence: number; writeStatus: string; rule: unknown }[] };
  diffs: { field: string; from: unknown; to: unknown; label: string }[];
};

const types: { key: DecisionType; label: string; hint: string }[] = [
  { key: "send", label: "Send", hint: "Move money to someone" },
  { key: "save", label: "Save", hint: "Set money aside" },
  { key: "spend", label: "Spend", hint: "Check a purchase" },
  { key: "affordability", label: "Affordability", hint: "Find the safe amount" },
];

const timingLabel: Record<string, string> = {
  today: "Today",
  on_date: "On a later date",
  wait_for_income: "Wait for confirmed income",
  wait: "Wait",
};

const riskTone: Record<string, "lime" | "amber" | "red"> = {
  low: "lime", medium: "amber", high: "red", unknown: "amber",
};

export function PlanMove({ currency, routeCount }: { currency: string; routeCount: number }) {
  const router = useRouter();
  const [type, setType] = useState<DecisionType>("send");
  const [amount, setAmount] = useState("300");
  const [destination, setDestination] = useState("my sister");
  const [destinationCurrency, setDestinationCurrency] = useState(currency);
  const [includeIncome, setIncludeIncome] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [resultCurrency, setResultCurrency] = useState(currency);
  const [acting, setActing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAllAssumptions, setShowAllAssumptions] = useState(false);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        decisionType: type,
        currency,
        destinationCurrency,
        includeExpectedIncome: includeIncome,
        objective: type === "send"
          ? `Send ${amount} ${currency} to ${destination || "recipient"} without risking obligations.`
          : type === "save"
            ? `Save ${amount} ${currency} without risking obligations.`
            : type === "spend"
              ? `Spend ${amount} ${currency} without creating a shortfall.`
              : "Find the amount that is safe to move today.",
      };
      if (type !== "affordability") body.amount = amount;
      if (type === "send" && destination.trim()) body.destinationLabel = destination.trim();
      const response = await post<GenerateResponse>("/api/decisions", body);
      setResultCurrency(destinationCurrency);
      setResult(response);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function act(action: "follow" | "decline") {
    if (!result) return;
    setActing(action);
    setError(null);
    try {
      if (action === "follow") {
        await post(`/api/decisions/${result.decision.id}/follow`);
        setNotice("Marked as followed. Record the outcome on the decision page so LANDED can compare it with this estimate.");
      } else {
        await del(`/api/decisions/${result.decision.id}/follow`);
        setNotice("Marked as not followed. The recommendation remains in your decision history.");
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setActing(null);
    }
  }

  const action = result?.result.action;
  const baseline = result?.result.baselineAction;
  const changed = Boolean(result?.diffs.length);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted/80">Plan with confidence</p>
        <h1 className="mt-1.5 font-display text-[32px] leading-tight text-cream sm:text-[38px]">Plan your next money decision</h1>
        <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted">
          Check an amount against your next 45 days of bills, spending, and savings. LANDED applies your confirmed
          lessons and compares available payment routes by the amount expected to arrive.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <Card>
          <CardHeader title="Your plan" subtitle="LANDED provides a recommendation. You choose whether to act on it." />
          <form onSubmit={generate} className="space-y-4 px-5 pb-5">
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-black/[0.08] bg-black/[0.02] p-1 sm:grid-cols-4">
              {types.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setType(item.key)}
                  aria-pressed={type === item.key}
                  className={`rounded-lg px-2 py-2 text-[11px] transition ${type === item.key ? "bg-black/[0.06] text-cream" : "text-muted hover:text-cream"}`}
                  title={item.hint}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {type !== "affordability" ? (
              <Field label={`Amount (${currency})`} hint={type === "save" ? "Amount you would like to set aside." : undefined}>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-2.5 text-[13px] text-muted">{currency}</span>
                  <input className={`${inputClass} pl-12 text-[15px]`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
                </div>
              </Field>
            ) : (
              <div className="rounded-xl border border-sky/20 bg-sky/[0.04] px-3.5 py-3 text-[11.5px] leading-relaxed text-sky/90">
                Estimate how much you can move while keeping your recorded commitments and safety buffer covered.
              </div>
            )}

            {type === "send" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Recipient">
                  <input className={inputClass} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="my sister" maxLength={120} />
                </Field>
                <Field label="Destination currency">
                  <select className={selectClass} value={destinationCurrency} onChange={(e) => setDestinationCurrency(e.target.value)}>
                    {["USD", "EUR", "GBP", "PHP", "MXN", "INR", "NGN", "KES"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
            ) : null}

            <div className="rounded-xl border border-black/[0.08] bg-black/[0.02] px-4">
              <Toggle
                checked={includeIncome}
                onChange={setIncludeIncome}
                label="Count expected income"
                description="Include forecast income in this estimate. LANDED adjusts it for reliability and reduces it by a further 20%. Confirmed lessons may exclude unreliable income."
              />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-black/[0.02] px-3 py-2 text-[10.5px] text-muted">
              <span className="flex items-center gap-1.5"><Route className="h-3 w-3" /> {routeCount} route{routeCount === 1 ? "" : "s"} with quotes</span>
              <Link href="/app/settings" className="text-lime/80 transition hover:text-lime">Manage routes</Link>
            </div>

            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              <Sparkles className="h-4 w-4" /> {type === "affordability" ? "Find safe amount" : "Evaluate this move"}
            </Button>
          </form>
        </Card>

        <div className="space-y-4">
          {!result && !loading ? (
            <Card className="flex min-h-[360px] flex-col items-center justify-center px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-lime/20 bg-lime/[0.06]">
                <GitCompareArrows className="h-5 w-5 text-lime" />
              </span>
              <p className="mt-5 font-display text-[24px] text-cream">See how your lessons affect the answer</p>
              <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-muted">
                Compare a recommendation based on your current records with one that also uses your confirmed lessons.
                Each adjustment includes an explanation.
              </p>
              <div className="mt-6 grid w-full max-w-sm grid-cols-3 gap-2 text-left">
                {["Same financial records", "Confirmed lessons", "Explained adjustments"].map((item) => (
                  <div key={item} className="rounded-lg border border-black/[0.07] bg-black/[0.02] p-2.5 text-[10px] leading-relaxed text-muted">{item}</div>
                ))}
              </div>
            </Card>
          ) : null}

          {loading ? (
            <Card className="p-6">
              <div className="shimmer h-6 w-1/2 rounded bg-black/[0.06]" />
              <div className="mt-4 shimmer h-24 w-full rounded-xl bg-black/[0.04]" />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="shimmer h-16 rounded-xl bg-black/[0.04]" />
                <div className="shimmer h-16 rounded-xl bg-black/[0.04]" />
              </div>
            </Card>
          ) : null}

          {result && action && baseline ? (
            <div className="space-y-4 animate-rise">
              <Card className="relative overflow-hidden">
                <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[#f6b897]/25 blur-3xl" />
                <div className="relative p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={riskTone[action.riskLevel] ?? "amber"}>{action.riskLevel} risk</Badge>
                    <Badge tone="muted">{timingLabel[action.timing] ?? action.timing}</Badge>
                    {changed ? <Badge tone="lime"><Brain className="h-2.5 w-2.5" /> Memory changed the answer</Badge> : <Badge tone="muted">Same as baseline</Badge>}
                    <span className="ml-auto text-[10px] text-muted">confidence {Math.round(result.result.confidence * 100)}%</span>
                  </div>

                  <p className="mt-5 font-display text-[38px] leading-none tracking-[-0.03em] text-lime sm:text-[46px]">
                    {formatMinor(action.amountMinor, action.currency)}
                  </p>
                  <p className="mt-2 text-[15px] text-cream">{action.headline}</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted">{action.rationale}</p>

                  {action.split ? (
                    <div className="mt-4 rounded-xl border border-lime/20 bg-lime/[0.05] p-3.5">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-lime">Split plan</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                        <span className="text-cream">{formatMinor(action.split.firstMinor, action.currency)} now</span>
                        <ArrowRight className="h-3.5 w-3.5 text-lime" />
                        <span className="text-cream">{formatMinor(action.split.remainderMinor, action.currency)} after income arrives</span>
                        {action.split.remainderAfter ? <span className="text-[10.5px] text-muted">({new Date(action.split.remainderAfter).toLocaleDateString("en-US", { month: "short", day: "numeric" })})</span> : null}
                      </div>
                      <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">{action.split.reason}</p>
                    </div>
                  ) : null}

                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-black/[0.07] pt-4">
                    <div>
                      <p className="text-[9.5px] uppercase tracking-[0.11em] text-muted">Projected buffer after</p>
                      <p className={`mt-1 text-[17px] tabular-nums ${result.result.predicted.projectedBufferAfterMinor < 0 ? "text-red" : "text-cream"}`}>{formatMinor(result.result.predicted.projectedBufferAfterMinor, action.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[9.5px] uppercase tracking-[0.11em] text-muted">Shortfall estimate</p>
                      <p className="mt-1 text-[17px] text-cream">{result.result.predicted.shortfallRisk >= 1 ? "Projected shortfall" : result.result.predicted.shortfallRisk >= 0.7 ? "Buffer at risk" : "No shortfall projected"}</p>
                    </div>
                    <div>
                      <p className="text-[9.5px] uppercase tracking-[0.11em] text-muted">Expected fee</p>
                      <p className="mt-1 text-[13px] tabular-nums text-cream">{result.result.predicted.expectedFeeMinor === null ? "—" : formatMinor(result.result.predicted.expectedFeeMinor, action.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[9.5px] uppercase tracking-[0.11em] text-muted">Expected received</p>
                      <p className="mt-1 text-[13px] tabular-nums text-cream">{result.result.predicted.expectedReceivedMinor === null ? "—" : formatMinor(result.result.predicted.expectedReceivedMinor, resultCurrency)}</p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => act("follow")} loading={acting === "follow"} disabled={acting !== null}>
                      <Check className="h-3.5 w-3.5" /> I followed this
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => act("decline")} loading={acting === "decline"} disabled={acting !== null}>
                      <X className="h-3.5 w-3.5" /> Not now
                    </Button>
                    <Link href={`/app/decisions/${result.decision.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11.5px] text-muted transition hover:text-lime">
                      View decision details <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  {notice ? <p className="mt-3 rounded-lg bg-lime/[0.06] px-3 py-2 text-[11px] leading-relaxed text-lime">{notice}</p> : null}
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="Compare with and without memory"
                  subtitle="Both recommendations use the same balances, bills, and quotes. One also includes your confirmed lessons."
                  right={<Badge tone={changed ? "amber" : "muted"}>{changed ? "changed" : "no change"}</Badge>}
                />
                <div className="grid gap-px border-t border-black/[0.06] bg-black/[0.06] sm:grid-cols-2">
                  <div className="bg-white p-4">
                    <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted">Without memory</p>
                    <p className={`mt-2 text-[25px] tabular-nums text-muted ${action.amountMinor !== baseline.amountMinor ? "line-through decoration-black/20" : ""}`}>{formatMinor(baseline.amountMinor, baseline.currency)}</p>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{baseline.headline}</p>
                  </div>
                  <div className="bg-lime/[0.035] p-4">
                    <p className="text-[9.5px] uppercase tracking-[0.12em] text-lime">With memory</p>
                    <p className="mt-2 text-[25px] tabular-nums text-lime">{formatMinor(action.amountMinor, action.currency)}</p>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-cream/70">{changed ? "Your confirmed lessons changed this recommendation." : "Your confirmed lessons leave this recommendation unchanged."}</p>
                  </div>
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      {result ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader
              title="Route ranking"
              subtitle={result.result.routeComparison.corridor ? `${result.result.routeComparison.corridor} · ranked by expected recipient amount, evidence, and speed` : "No eligible corridor"}
              right={<Badge tone="muted">{result.result.routeComparison.quotes.length} quoted</Badge>}
            />
            <div className="border-t border-black/[0.06]">
              {result.result.routeComparison.quotes.length === 0 ? (
                <p className="px-5 py-8 text-center text-[11.5px] text-muted">No route quote matches this corridor and amount. Add a user-entered quote in Settings.</p>
              ) : null}
              {result.result.routeComparison.quotes.map((ranked) => (
                <div key={ranked.quote.quoteId} className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${ranked.rank === 1 ? "bg-lime/[0.035]" : ""}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] ${ranked.rank === 1 ? "bg-ink text-white" : "bg-black/[0.05] text-muted"}`}>{ranked.rank}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-cream">{ranked.quote.routeName}</p>
                    <p className="text-[10px] text-muted">{ranked.quote.payoutMethod.replaceAll("_", " ")} · {ranked.quote.estimatedDeliveryHours}h · score {(ranked.score * 100).toFixed(0)}</p>
                    {ranked.adjustments.length > 0 ? <p className="mt-0.5 text-[9.5px] text-amber/80">{ranked.adjustments.map((a) => a.label).join(" · ")}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="text-[12.5px] tabular-nums text-cream">{formatMinor(ranked.expectedReceivedMinor, destinationCurrency)}</p>
                    <p className="text-[9.5px] text-muted">cost {formatMinor(ranked.totalCostMinor, currency)}</p>
                  </div>
                </div>
              ))}
            </div>
            {result.result.routeComparison.notes.length > 0 ? (
              <div className="border-t border-black/[0.06] px-5 py-3 text-[10px] leading-relaxed text-amber/80">{result.result.routeComparison.notes.join(" ")}</div>
            ) : null}
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Recalled memory"
                subtitle={result.retrieval.mode === "local_rehearsal" ? "Local rehearsal ledger — Walrus is not configured on this deployment." : result.retrieval.mode === "mixed" ? "Walrus recall with local fallback." : "Semantic recall from Walrus Memory."}
                right={result.retrieval.mode === "walrus" ? <Badge tone="lime">Walrus</Badge> : <Badge tone="amber">Rehearsal</Badge>}
              />
              <div className="space-y-2.5 border-t border-black/[0.06] px-5 py-4">
                {result.retrieval.memories.length === 0 ? <p className="text-[11px] text-muted">No applicable memory. The baseline and informed arms match.</p> : null}
                {result.retrieval.memories.slice(0, 5).map((memory) => (
                  <div key={memory.id} className="rounded-xl border border-black/[0.07] bg-black/[0.015] p-3">
                    <div className="flex items-center gap-2">
                      <Brain className="h-3 w-3 text-lime" />
                      <span className="text-[9.5px] uppercase tracking-[0.1em] text-muted">{memory.writeStatus === "confirmed" ? "Walrus confirmed" : "local"}</span>
                      <span className="ml-auto text-[9.5px] text-muted/60">{Math.round(memory.confidence * 100)}%</span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-cream/80">{memory.summary}</p>
                    {memory.blobId ? <p className="mt-1 truncate font-mono text-[8.5px] text-lime/50">blob {memory.blobId}</p> : null}
                  </div>
                ))}
                {result.retrieval.error ? <p className="rounded-lg bg-amber/[0.05] px-3 py-2 text-[10px] leading-relaxed text-amber/85">{result.retrieval.error}</p> : null}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Assumptions"
                subtitle="The information included in this estimate, and any limitations."
                right={<button type="button" onClick={() => setShowAllAssumptions((v) => !v)} className="text-muted transition hover:text-cream" aria-label="Show all assumptions" aria-expanded={showAllAssumptions}><ChevronDown className={`h-4 w-4 transition-transform ${showAllAssumptions ? "rotate-180" : ""}`} /></button>}
              />
              <div className="space-y-2 border-t border-black/[0.06] px-5 py-4">
                {result.result.assumptions.slice(0, showAllAssumptions ? undefined : 3).map((assumption) => (
                  <div key={assumption.key} className="flex gap-2.5">
                    {assumption.source === "memory" ? <Brain className="mt-0.5 h-3 w-3 shrink-0 text-lime" /> : assumption.source === "user" ? <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-sky" /> : <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-muted" />}
                    <div>
                      <p className="text-[10.5px] text-cream/80">{assumption.label}</p>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{assumption.detail}</p>
                    </div>
                  </div>
                ))}
                {result.result.cashflow.missingInputs.length > 0 ? (
                  <div className="mt-2 rounded-lg border border-amber/20 bg-amber/[0.04] px-3 py-2 text-[10px] leading-relaxed text-amber/85">
                    {result.result.cashflow.missingInputs.join(" ")}
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
