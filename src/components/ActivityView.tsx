"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Brain, ChevronRight, CircleCheck, CircleDashed, Clock } from "lucide-react";
import { formatMinor } from "@/lib/money";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { TransactionTools } from "@/components/TransactionTools";

type DecisionRow = {
  id: string; objective: string; status: string; decisionType: string; currency: string;
  createdAt: string | Date; followedAt: string | Date | null; memoryMode: string;
  recommended: { amountMinor: number; headline: string } | null;
  baseline: { amountMinor: number; headline: string } | null;
  outcomes: { outcomeStatus: string; shortfallOccurred: boolean; evaluatedAt: string | Date }[];
  memories: { id: string; summary: string; writeStatus: string; walrusBlobId: string | null; category: string }[];
};

type TransactionRow = {
  id: string; amountMinor: number; currency: string; direction: string; category: string;
  merchant: string | null; description: string | null; timestamp: string | Date; status: string;
  source: string; isSynthetic: boolean; account?: { name: string } | null;
};

type MovementRow = {
  id: string; amountMinor: number; currency: string; status: string; recipientLabel: string | null;
  actualFeeMinor: number | null; actualReceivedMinor: number | null; createdAt: string | Date;
  evidenceType: string; isSynthetic: boolean; route?: { name: string } | null;
};

const statusTone: Record<string, "lime" | "amber" | "red" | "sky" | "muted"> = {
  advised: "lime", accepted: "lime", followed: "sky", completed: "sky", evaluated: "muted", declined: "muted",
  achieved: "lime", partial: "amber", missed: "red", inconclusive: "muted",
  settled: "lime", failed: "red", planned: "amber", pending: "amber", cancelled: "muted",
};

export function ActivityView({ decisions, transactions, movements, currency, accounts }: {
  decisions: DecisionRow[]; transactions: TransactionRow[]; movements: MovementRow[];
  currency: string; accounts: { id: string; name: string; currency: string }[];
}) {
  // A new account has transactions to add before it has decisions to review.
  const [tab, setTab] = useState<"decisions" | "transactions" | "movements">(decisions.length === 0 ? "transactions" : "decisions");
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (filter === "all") return decisions;
    if (filter === "evaluated") return decisions.filter((d) => d.outcomes.length > 0);
    return decisions.filter((d) => d.status === filter);
  }, [decisions, filter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted/80">The audit trail</p>
          <h1 className="mt-1.5 font-display text-[32px] leading-tight text-cream sm:text-[38px]">What happened next.</h1>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted">
            Every recommendation keeps its original inputs, baseline, prediction, and confirmed outcome. Settled
            predictions are never overwritten.
          </p>
        </div>
        <Badge tone="muted">{decisions.length} decisions · {movements.length} movements</Badge>
      </div>

      <TransactionTools currency={currency} accounts={accounts} />

      <div className="flex flex-wrap items-center gap-2">
        {(["decisions", "transactions", "movements"] as const).map((item) => (
          <button key={item} onClick={() => setTab(item)} className={`rounded-full px-3.5 py-1.5 text-[11.5px] capitalize transition ${tab === item ? "bg-black/[0.06] text-cream" : "text-muted hover:text-cream"}`}>
            {item}
          </button>
        ))}
        {tab === "decisions" ? (
          <div className="ml-auto flex flex-wrap gap-1.5">
            {["all", "advised", "followed", "evaluated", "declined"].map((item) => (
              <button key={item} onClick={() => setFilter(item)} className={`rounded-full border px-2.5 py-1 text-[10px] capitalize transition ${filter === item ? "border-lime/30 bg-lime/[0.08] text-lime" : "border-black/[0.08] text-muted hover:text-cream"}`}>
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {tab === "decisions" ? (
        <Card>
          {filtered.length === 0 ? <EmptyState title="No decisions here" body="Plan a move to create an auditable recommendation with its counterfactual and memory references." /> : null}
          <div className="divide-y divide-black/[0.06]">
            {filtered.map((decision) => {
              const outcome = decision.outcomes[0];
              const changed = decision.recommended && decision.baseline && decision.recommended.amountMinor !== decision.baseline.amountMinor;
              return (
                <Link key={decision.id} href={`/app/decisions/${decision.id}`} className="group block px-5 py-4 transition hover:bg-black/[0.018] sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={statusTone[outcome?.outcomeStatus ?? decision.status] ?? "muted"}>{outcome?.outcomeStatus ?? decision.status}</Badge>
                        <span className="text-[9.5px] uppercase tracking-[0.1em] text-muted">{decision.decisionType}</span>
                        {changed ? <span className="flex items-center gap-1 text-[9.5px] text-lime"><Brain className="h-2.5 w-2.5" /> memory changed amount</span> : null}
                        {decision.memories.length > 0 ? <span className="text-[9.5px] text-muted/70">{decision.memories.length} lesson{decision.memories.length === 1 ? "" : "s"}</span> : null}
                      </div>
                      <p className="mt-2 text-[13px] text-cream">{decision.objective}</p>
                      <p className="mt-1 text-[10.5px] text-muted">
                        {new Date(decision.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {outcome?.shortfallOccurred ? <span className="ml-2 text-red">shortfall recorded</span> : null}
                        {outcome ? <span className="ml-2">evaluated {new Date(outcome.evaluatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-5 text-right">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.1em] text-muted">No memory</p>
                        <p className="mt-0.5 text-[12px] tabular-nums text-muted">{decision.baseline ? formatMinor(decision.baseline.amountMinor, decision.currency) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.1em] text-muted">LANDED</p>
                        <p className="mt-0.5 text-[13px] tabular-nums text-lime">{decision.recommended ? formatMinor(decision.recommended.amountMinor, decision.currency) : "—"}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted/40 transition group-hover:translate-x-0.5 group-hover:text-lime" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      ) : null}

      {tab === "transactions" ? (
        <Card>
          <CardHeader title="Posted transactions" subtitle="Synthetic demo records are labelled. A transaction never silently changes an account balance." right={<Badge tone="muted">{transactions.length}</Badge>} />
          <div className="divide-y divide-black/[0.06] border-t border-black/[0.06]">
            {transactions.length === 0 ? <EmptyState title="No transactions yet" body="Add a transaction or import your bank's CSV export above. Spend Watch and income forecasts learn from these." /> : null}
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tx.direction === "in" ? "bg-lime/[0.08] text-lime" : "bg-black/[0.05] text-muted"}`}>
                  {tx.direction === "in" ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-cream">{tx.merchant ?? tx.description ?? tx.category}</p>
                  <p className="text-[9.5px] text-muted">{new Date(tx.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {tx.category} · {tx.source}{tx.isSynthetic ? " · synthetic" : ""}</p>
                </div>
                <span className={`text-[12.5px] tabular-nums ${tx.direction === "in" ? "text-lime" : "text-cream/90"}`}>
                  {tx.direction === "in" ? "+" : "−"}{formatMinor(tx.amountMinor, tx.currency)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === "movements" ? (
        <Card>
          <CardHeader title="Money movements" subtitle="Only confirmed, evaluated movements become outcome evidence." right={<Badge tone="muted">{movements.length}</Badge>} />
          <div className="divide-y divide-black/[0.06] border-t border-black/[0.06]">
            {movements.length === 0 ? <EmptyState title="No settled movements" body="Mark a decision as followed, then record the real fee, delivery time, and buffer." /> : null}
            {movements.map((movement) => (
              <div key={movement.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${movement.status === "settled" ? "bg-lime/[0.08] text-lime" : "bg-black/[0.05] text-muted"}`}>
                  {movement.status === "settled" ? <CircleCheck className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-cream">{movement.recipientLabel ?? movement.route?.name ?? "Transfer"}</p>
                  <p className="text-[9.5px] text-muted">{new Date(movement.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {movement.evidenceType.replaceAll("_", " ")}{movement.isSynthetic ? " · synthetic" : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-[12.5px] tabular-nums text-cream">{formatMinor(movement.amountMinor, movement.currency)}</p>
                  <p className="text-[9px] text-muted">{movement.actualFeeMinor !== null ? `fee ${formatMinor(movement.actualFeeMinor, movement.currency)}` : "fee not recorded"}</p>
                </div>
                <Badge tone={statusTone[movement.status] ?? "muted"}>{movement.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <p className="px-1 text-[10px] leading-relaxed text-muted/60">
        <CircleDashed className="mr-1 inline h-3 w-3" /> A decision with no evaluated outcome is not counted as successful or unsuccessful.
      </p>
    </div>
  );
}
