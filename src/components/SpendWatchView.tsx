"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Brain, Check, Pencil, Repeat, Sparkles, X } from "lucide-react";
import { formatMinor, parseAmountToMinor } from "@/lib/money";
import { cn, errorMessage, minorToMajorString, post } from "@/lib/client";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, inputClass, Progress, SuccessNote } from "@/components/ui";
import type { MemoryRef } from "@/server/engine/spending";
import type { SpendWatch } from "@/server/services/spending";

type RememberResult = {
  memory: { id: string };
  write: { writeStatus: string; blobId: string | null; error: string | null };
  replaces: string | null;
};

const paceTone: Record<string, "lime" | "amber" | "red" | "sky" | "muted"> = {
  over_limit: "red", trending_over: "amber", near_limit: "amber", within_limit: "lime", above_usual: "amber", usual: "muted",
};
const paceLabel: Record<string, string> = {
  over_limit: "Over limit", trending_over: "Pacing over", near_limit: "Near limit", within_limit: "Within limit",
  above_usual: "Above usual", usual: "Usual",
};
const chargeTone: Record<string, "lime" | "amber" | "red" | "muted"> = {
  approved: "lime", above_approved: "red", price_change: "amber", untracked: "muted",
};
const chargeLabel: Record<string, string> = {
  approved: "Approved", above_approved: "Above approved", price_change: "Price changed", untracked: "Not watched",
};

function title(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function MemoryChip({ memory }: { memory: MemoryRef }) {
  const fromWalrus = memory.recalledFrom === "walrus";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[9.5px]",
        fromWalrus ? "border-lime/25 bg-lime/[0.06] text-lime/90" : "border-white/[0.08] bg-white/[0.03] text-muted",
      )}
      title={`${memory.summary}${fromWalrus ? " — recalled from Walrus on this request" : " — from the local ledger"}`}
    >
      <Brain className={cn("h-3 w-3", fromWalrus ? "text-lime" : "text-lime/70")} />
      {fromWalrus ? "recalled from Walrus" : "local ledger"}
      {memory.blobId ? <span className="text-muted/70">· blob {memory.blobId.slice(0, 8)}…</span> : null}
      <span className="text-muted/60">· {shortDate(memory.createdAt)}</span>
    </span>
  );
}

/** Inline "remember this" control with an editable amount. */
function RememberControl({
  itemKey, suggestedMinor, currency, label, onDone, compact, editFirst,
}: {
  itemKey: string; suggestedMinor: number; currency: string; label: string;
  onDone: (result: RememberResult) => void; compact?: boolean;
  /** Changing an existing rule needs a new amount; open the editor instead of resubmitting the same one. */
  editFirst?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(minorToMajorString(suggestedMinor));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const amountMinor = parseAmountToMinor(value, currency);
      const result = await post<RememberResult>("/api/spending/remember", { key: itemKey, amountMinor });
      setEditing(false);
      onDone(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col items-end gap-1.5", compact && "items-start sm:items-end")}>
      <div className="flex items-center gap-1.5">
        {editing ? (
          <>
            <span className="text-[12px] text-muted">$</span>
            <input
              aria-label="Amount"
              className={cn(inputClass, "h-8 w-24 text-right tabular-nums")}
              value={value}
              inputMode="decimal"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
              autoFocus
            />
            <Button size="sm" onClick={submit} loading={busy}><Check className="h-3.5 w-3.5" /> Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel"><X className="h-3.5 w-3.5" /></Button>
          </>
        ) : (
          <>
            {editFirst ? null : <Button size="sm" variant="outline" onClick={() => setEditing(true)} aria-label="Edit amount"><Pencil className="h-3 w-3" /></Button>}
            <Button size="sm" onClick={editFirst ? () => setEditing(true) : submit} loading={busy}>
              {editFirst ? <Pencil className="h-3.5 w-3.5" /> : <Brain className="h-3.5 w-3.5" />} {label}
            </Button>
          </>
        )}
      </div>
      {error ? <p className="text-[11px] text-red">{error}</p> : null}
    </div>
  );
}

export function SpendWatchView({ watch, baselineAlerts, isDemo }: { watch: SpendWatch; baselineAlerts: number; isDemo: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const c = watch.currency;

  function done(result: RememberResult) {
    const w = result.write;
    setNotice(
      w.writeStatus === "confirmed" && w.blobId
        ? { ok: true, text: `Remembered and written to Walrus Mainnet · blob ${w.blobId}. It now shapes every Spend Watch check.` }
        : { ok: w.writeStatus !== "failed", text: `Remembered as a confirmed typed rule. Walrus write ${w.writeStatus}${w.error ? ` — ${w.error}` : ""}` },
    );
    router.refresh();
  }

  const limited = watch.categories.filter((cat) => cat.limitMinor !== null);
  const watched = watch.recurring.filter((r) => r.memory);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-[28px] leading-tight text-cream sm:text-[34px]">Spend Watch</h1>
          <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">
            LANDED spots recurring charges and category drift on its own. It only <em>alerts</em> on limits and prices you
            told it to remember — so every alert names the memory behind it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDemo ? <Badge tone="amber">Synthetic demo</Badge> : null}
          <Badge tone="sky">Day {watch.dayOfMonth} of {watch.daysInMonth}</Badge>
        </div>
      </div>

      {notice ? (notice.ok ? <SuccessNote>{notice.text}</SuccessNote> : <ErrorNote>{notice.text}</ErrorNote>) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card className="p-4 sm:p-5">
          <p className="text-[10.5px] uppercase tracking-[0.13em] text-muted">Discretionary this month</p>
          <p className="mt-3 text-[22px] leading-none tabular-nums sm:text-[26px] text-cream">{formatMinor(watch.monthToDateMinor, c)}</p>
          <p className="mt-2 text-[11px] text-muted">Rent and bills are protected elsewhere.</p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-[10.5px] uppercase tracking-[0.13em] text-muted">Recurring per month</p>
          <p className="mt-3 text-[22px] leading-none tabular-nums sm:text-[26px] text-cream">{formatMinor(watch.recurringMonthlyMinor, c)}</p>
          <p className="mt-2 text-[11px] text-muted">{watch.recurring.length} recurring charge{watch.recurring.length === 1 ? "" : "s"} detected</p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-[10.5px] uppercase tracking-[0.13em] text-muted">Alerts with memory</p>
          <p className={cn("mt-3 text-[22px] leading-none tabular-nums sm:text-[26px]", watch.alerts.length > 0 ? "text-amber" : "text-lime")}>{watch.alerts.length}</p>
          <p className="mt-2 text-[11px] text-muted">Without memory: <span className="tabular-nums text-cream">{baselineAlerts}</span>. Averages alone never alert.</p>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-[10.5px] uppercase tracking-[0.13em] text-muted">Rules in force</p>
          <p className="mt-3 text-[22px] leading-none tabular-nums sm:text-[26px] text-cream">{watch.memoriesApplied}</p>
          <p className="mt-2 text-[11px] text-muted">{limited.length} limit{limited.length === 1 ? "" : "s"} · {watched.length} approved price{watched.length === 1 ? "" : "s"}</p>
          <p className={cn("mt-1 text-[10.5px]", watch.recall.mode === "walrus" ? "text-lime" : "text-muted/80")}>
            {watch.recall.mode === "local_rehearsal" && watch.recall.recalled === 0
              ? "From the local ledger · Walrus recall not available"
              : `${watch.recall.recalled} of ${watch.recall.total} recalled from Walrus`}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><BellRing className="h-4 w-4 text-amber" /> Alerts from what you told LANDED</span>}
          subtitle="Each alert exists only because a confirmed memory set the limit or approved the price."
        />
        {watch.alerts.length === 0 ? (
          <EmptyState
            icon={<Check className="h-5 w-5" />}
            title="Nothing outside what you agreed to"
            body="Remember a limit or approve a subscription price below and LANDED will watch it from now on — across sessions and devices."
          />
        ) : (
          <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
            {watch.alerts.map((alert) => (
              <li key={alert.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="text-[13.5px] text-cream">{alert.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">{alert.detail}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-muted">
                    Because: <span className="text-cream/80">“{alert.memory.summary}”</span> <MemoryChip memory={alert.memory} />
                  </div>
                </div>
                {alert.kind === "subscription_above_approved" ? (
                  <RememberControl itemKey={alert.key} suggestedMinor={watch.recurring.find((r) => `sub:${r.key}` === alert.key)?.latestAmountMinor ?? alert.amountMinor} currency={c} label="Approve new price" onDone={done} compact />
                ) : (
                  <RememberControl itemKey={alert.key} suggestedMinor={watch.categories.find((cat) => `limit:${cat.category}` === alert.key)?.limitMinor ?? 0} currency={c} label="Update limit" onDone={done} compact editFirst />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {watch.proposals.length > 0 ? (
        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-lime" /> LANDED noticed</span>}
            subtitle="Observations from your transactions. Nothing here changes advice until you choose to remember it."
          />
          <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
            {watch.proposals.map((p) => (
              <li key={p.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] text-cream">{p.title}</p>
                    <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-lime/70">{p.kind}</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">{p.detail}</p>
                </div>
                <RememberControl
                  itemKey={p.key}
                  suggestedMinor={p.suggestedAmountMinor}
                  currency={c}
                  label={p.kind === "SPEND_LIMIT" ? `Remember ${formatMinor(p.suggestedAmountMinor, c)} limit` : `Approve ${formatMinor(p.suggestedAmountMinor, c)}`}
                  onDone={done}
                  compact
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Category pace" subtitle="Month to date against your remembered limit, or your usual month when no limit is set." />
          <div className="space-y-4 border-t border-white/[0.06] px-5 py-5 sm:px-6">
            {watch.categories.length === 0 ? <p className="text-[12px] text-muted">No discretionary spending recorded yet.</p> : null}
            {watch.categories.map((cat) => {
              const reference = cat.limitMinor ?? cat.usualMonthlyMinor;
              const pct = reference > 0 ? (cat.monthToDateMinor / reference) * 100 : 0;
              const projectedPct = reference > 0 ? Math.min(100, (cat.projectedMinor / reference) * 100) : 0;
              const tone = cat.status === "over_limit" ? "red" : cat.status === "within_limit" || cat.status === "usual" ? "lime" : "amber";
              return (
                <div key={cat.category}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[13px] text-cream">{title(cat.category)}</p>
                    <p className="text-[12px] tabular-nums text-muted">
                      <span className="text-cream">{formatMinor(cat.monthToDateMinor, c)}</span>
                      {" / "}
                      {cat.limitMinor !== null ? <span className="text-lime">{formatMinor(cat.limitMinor, c)} limit</span> : `${formatMinor(cat.usualMonthlyMinor, c)} usual`}
                    </p>
                  </div>
                  <div className="relative mt-2">
                    <Progress value={pct} tone={tone} />
                    {projectedPct > pct ? (
                      <div className="pointer-events-none absolute inset-y-0 left-0 rounded-full border-r border-dashed border-cream/40" style={{ width: `${projectedPct}%` }} title={`Projected ${formatMinor(cat.projectedMinor, c)}`} />
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-muted">
                    <span>Projected {formatMinor(cat.projectedMinor, c)} · {cat.monthsObserved} month{cat.monthsObserved === 1 ? "" : "s"} of history</span>
                    <span className="flex items-center gap-2">
                      {cat.memory ? <MemoryChip memory={cat.memory} /> : null}
                      <Badge tone={paceTone[cat.status]}>{paceLabel[cat.status]}</Badge>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><Repeat className="h-4 w-4 text-sky" /> Recurring charges</span>}
            subtitle="Detected from a fixed price on a regular schedule. Rent and utilities stay with your obligations."
          />
          <div className="border-t border-white/[0.06]">
            {watch.recurring.length === 0 ? <p className="px-6 py-5 text-[12px] text-muted">No recurring charges detected yet. Two or more charges on a schedule are needed.</p> : null}
            <ul className="divide-y divide-white/[0.06]">
              {watch.recurring.map((r) => (
                <li key={r.key} className="px-5 py-3.5 sm:px-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-cream">{r.merchant}</p>
                      <p className="mt-0.5 text-[10.5px] text-muted">
                        {r.cadence} · {r.charges} charges · next ~{shortDate(r.nextExpectedAt)} · {formatMinor(r.annualCostMinor, c)}/yr
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] tabular-nums text-cream">{formatMinor(r.latestAmountMinor, c)}</p>
                      {r.changeMinor !== 0 ? (
                        <p className={cn("text-[10.5px] tabular-nums", r.changeMinor > 0 ? "text-amber" : "text-lime")}>
                          {formatMinor(r.changeMinor, c, { sign: true })} vs usual
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={chargeTone[r.status]}>{chargeLabel[r.status]}</Badge>
                    {r.approvedAmountMinor !== null ? <span className="text-[10.5px] text-muted">approved at {formatMinor(r.approvedAmountMinor, c)}</span> : null}
                    {r.memory ? <MemoryChip memory={r.memory} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <p className="text-[11px] leading-relaxed text-muted/80">
        Limits and approved prices are typed memories (<span className="font-mono">SPEND_LIMIT</span>, <span className="font-mono">SUBSCRIPTION_WATCH</span>).
        The database row is authoritative; the same rule is written to Walrus Memory as portable text when credentials are configured.
        Updating a rule supersedes the old one instead of rewriting history. Ask LANDED “can I spend $60 on dining?” and the answer uses them too.
      </p>
    </div>
  );
}
