"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Brain, Check, ChevronDown, CircleAlert, Clock, Database,
  ExternalLink, GitCompareArrows, RefreshCw, ShieldCheck, TriangleAlert, X,
} from "lucide-react";
import { getDecision } from "@/server/services/decisions";
import { formatMinor } from "@/lib/money";
import { errorMessage, post } from "@/lib/client";
import { Badge, Button, Card, CardHeader, ErrorNote, Field, inputClass, Toggle } from "@/components/ui";

type Decision = NonNullable<Awaited<ReturnType<typeof getDecision>>>;

type ChainEvidence = {
  digest: string; status: string; error: string | null; timestamp: string; sender: string | null;
  gasFeeSui: string; explorerUrl: string; note: string;
  balanceChanges: { owner: string | null; symbol: string | null; coinType: string; amountMinor: number | null; direction: "in" | "out" }[];
};

const verdictTone: Record<string, "lime" | "red" | "muted"> = { held: "lime", contradicted: "red", inconclusive: "muted" };

type Replay = {
  decision: { id: string; objective: string; createdAt: string; originalRecommendation: { amountMinor: number; headline: string } | null; originalPredicted: unknown };
  baseline: { action: { amountMinor: number; headline: string }; cashflow: { safeToMoveMinor: number; confidence: number }; route: { name: string; score: number } | null; memories: [] };
  informed: { action: { amountMinor: number; headline: string }; cashflow: { safeToMoveMinor: number; confidence: number }; route: { name: string; score: number } | null; memories: { id: string; summary: string; blobId: string | null; writeStatus: string; source: string; rule: unknown; createdAt: string }[] };
  diffs: { field: string; from: unknown; to: unknown; label: string }[];
  routeDiffs: string[];
  cutoff: string;
  retrieval: { mode: string; error: string | null; recalledCount: number };
  timeConsistency: { inputsIdentical: boolean; newMemoriesExcluded: number; note: string };
  modeledRiskDelta: { bufferDeltaMinor: number; safeToMoveDeltaMinor: number; note: string };
};

const statusTone: Record<string, "lime" | "amber" | "red" | "sky" | "muted"> = {
  advised: "lime", accepted: "lime", followed: "sky", completed: "sky", evaluated: "muted", declined: "muted",
  achieved: "lime", partial: "amber", missed: "red", inconclusive: "muted",
  confirmed: "lime", pending: "amber", writing: "amber", blocked: "amber", failed: "red", superseded: "muted",
  user_confirmed: "sky", hypothesis: "amber", rejected: "red", verified: "lime",
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function DecisionDetail({ decision }: { decision: Decision }) {
  const router = useRouter();
  const [tab, setTab] = useState<"autopsy" | "replay" | "memories">("autopsy");
  const [showOutcome, setShowOutcome] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const recommended = decision.recommended;
  const baseline = decision.baseline;
  const predicted = decision.predicted;
  const outcome = decision.outcomes[0];
  const observed = outcome ? parseJson<Record<string, unknown>>(outcome.observedResult, {}) : null;
  const errors = outcome ? parseJson<Record<string, number | null>>(outcome.predictionError, {}) : null;
  const refs = decision.memoryReferences as { memoryId: string; blobId: string | null; code: string; label: string }[];

  const [amountSent, setAmountSent] = useState(recommended ? (recommended.amountMinor / 100).toFixed(2) : "");
  const [fee, setFee] = useState("");
  const [received, setReceived] = useState("");
  const [deliveryHours, setDeliveryHours] = useState("");
  const [bufferAfter, setBufferAfter] = useState("");
  const [billsCovered, setBillsCovered] = useState(true);
  const [shortfall, setShortfall] = useState(false);
  const [notes, setNotes] = useState("");
  const [digest, setDigest] = useState("");
  const [chain, setChain] = useState<ChainEvidence | null>(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);

  const [replay, setReplay] = useState<Replay | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [cutoff, setCutoff] = useState(new Date(decision.createdAt).toISOString().slice(0, 10));

  async function recordOutcome() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        amountSent,
        billsCovered,
        shortfallOccurred: shortfall,
        notes: notes || undefined,
      };
      if (fee) body.actualFee = fee;
      if (received) body.actualReceived = received;
      if (deliveryHours) body.deliveryHours = Number(deliveryHours);
      if (bufferAfter) body.bufferAfter = bufferAfter;
      if (chain && digest.trim() === chain.digest) body.transactionDigest = chain.digest;
      const result = await post<{ lessons: { id: string }[] }>(`/api/decisions/${decision.id}/outcome`, body);
      setNotice(`Outcome recorded. ${result.lessons.length} draft lesson${result.lessons.length === 1 ? "" : "s"} created and held until you confirm them.`);
      setShowOutcome(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function readChain() {
    setChainLoading(true);
    setChainError(null);
    setChain(null);
    try {
      const result = await post<{ evidence: ChainEvidence }>("/api/tatum/transaction", { digest: digest.trim() });
      setChain(result.evidence);
    } catch (err) {
      setChainError(errorMessage(err));
    } finally {
      setChainLoading(false);
    }
  }

  /** Only values in the decision's own currency are filled; SUI gas is never converted. */
  function applyChain(evidence: ChainEvidence) {
    const sameCurrency = evidence.balanceChanges.filter((c) => c.symbol === decision.currency && c.amountMinor !== null);
    const sent = sameCurrency.find((c) => c.direction === "out");
    const got = sameCurrency.find((c) => c.direction === "in");
    if (sent) setAmountSent((sent.amountMinor! / 100).toFixed(2));
    if (got) setReceived((got.amountMinor! / 100).toFixed(2));
    if (sent && got) setFee(((sent.amountMinor! - got.amountMinor!) / 100).toFixed(2));
    const start = decision.followedAt ?? decision.createdAt;
    const hours = (new Date(evidence.timestamp).getTime() - new Date(start).getTime()) / 3_600_000;
    if (hours >= 0) setDeliveryHours(String(Math.round(hours * 10) / 10));
    setNotes((prev) => prev || `Settled onchain via Tatum (${evidence.digest.slice(0, 10)}…). Gas ${evidence.gasFeeSui} SUI.`);
  }

  async function loadReplay() {
    setReplayLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/decisions/${decision.id}/replay?cutoff=${encodeURIComponent(`${cutoff}T23:59:59.999Z`)}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Replay failed");
      setReplay(json.replay as Replay);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setReplayLoading(false);
    }
  }

  async function memoryAction(memoryId: string, action: "confirm" | "reject", correction?: string) {
    setSaving(true);
    setError(null);
    try {
      const result = await post<{ write: { writeStatus: string; error: string | null; blobId: string | null } | null }>(`/api/memories/${memoryId}/feedback`, { action, correction });
      if (result.write) {
        setNotice(result.write.writeStatus === "confirmed"
          ? `Lesson confirmed and written to Walrus. Blob ${result.write.blobId}`
          : `Lesson confirmed locally. ${result.write.error ?? "Walrus write was not confirmed."}`);
      } else {
        setNotice("Lesson rejected. It will not influence future decisions.");
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function writeMemory(memoryId: string) {
    setSaving(true);
    setError(null);
    try {
      const result = await post<{ result: { writeStatus: string; blobId: string | null; error: string | null } }>(`/api/memories/${memoryId}/write`);
      setNotice(result.result.writeStatus === "confirmed" ? `Confirmed Walrus write. Blob ${result.result.blobId}` : result.result.error ?? "Write not confirmed.");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function markFollowed() {
    setSaving(true);
    setError(null);
    post(`/api/decisions/${decision.id}/follow`)
      .then(() => { setNotice("Marked as followed. Record the outcome when the money actually lands."); router.refresh(); })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setSaving(false));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/app/activity" className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] text-muted transition hover:text-cream" aria-label="Back to activity">
          <ArrowLeft className="h-3.5 w-3.5" />
        </Link>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted/70">{new Date(decision.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · {decision.decisionType}</p>
          <h1 className="truncate text-[16px] text-cream">{decision.objective}</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge tone={statusTone[outcome?.outcomeStatus ?? decision.status] ?? "muted"}>{outcome?.outcomeStatus ?? decision.status}</Badge>
          {outcome?.shortfallOccurred ? <Badge tone="red"><TriangleAlert className="h-2.5 w-2.5" /> shortfall</Badge> : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="relative overflow-hidden">
          <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-lime/[0.07] blur-3xl" />
          <div className="relative p-5 sm:p-6">
            <p className="text-[10px] uppercase tracking-[0.13em] text-muted">LANDED recommended</p>
            <p className="mt-3 font-display text-[46px] leading-none tracking-[-0.035em] text-lime">{recommended ? formatMinor(recommended.amountMinor, recommended.currency) : "—"}</p>
            <p className="mt-2 text-[13px] text-cream">{recommended?.headline}</p>
            <p className="mt-2 max-w-lg text-[11.5px] leading-relaxed text-muted">{recommended?.rationale}</p>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-4 sm:grid-cols-4">
              <div><p className="text-[9px] uppercase tracking-[0.1em] text-muted">No-memory baseline</p><p className="mt-1 text-[13.5px] tabular-nums text-muted">{baseline ? formatMinor(baseline.amountMinor, baseline.currency) : "—"}</p></div>
              <div><p className="text-[9px] uppercase tracking-[0.1em] text-muted">Predicted buffer</p><p className="mt-1 text-[13.5px] tabular-nums text-cream">{predicted ? formatMinor(predicted.projectedBufferAfterMinor, decision.currency) : "—"}</p></div>
              <div><p className="text-[9px] uppercase tracking-[0.1em] text-muted">Shortfall risk</p><p className="mt-1 text-[13.5px] tabular-nums text-cream">{predicted ? `${Math.round(predicted.shortfallRisk * 100)}%` : "—"}</p></div>
              <div><p className="text-[9px] uppercase tracking-[0.1em] text-muted">Confidence</p><p className="mt-1 text-[13.5px] tabular-nums text-cream">{Math.round(decision.confidence * 100)}%</p></div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {!outcome ? (
                <>
                  <Button size="sm" onClick={markFollowed} loading={saving} disabled={decision.status === "followed"}>
                    <Check className="h-3.5 w-3.5" /> {decision.status === "followed" ? "Marked followed" : "I followed this"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowOutcome((v) => !v)}><Clock className="h-3.5 w-3.5" /> Record real outcome</Button>
                </>
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-lime"><Check className="h-3.5 w-3.5" /> Outcome settled and audited</div>
              )}
            </div>
            {notice ? <p className="mt-3 rounded-lg bg-lime/[0.06] px-3 py-2 text-[10.5px] leading-relaxed text-lime">{notice}</p> : null}
            {error ? <ErrorNote className="mt-3">{error}</ErrorNote> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Memory applied" subtitle={`${refs.length} lesson reference${refs.length === 1 ? "" : "s"} recorded on this decision.`} right={<Brain className="h-4 w-4 text-lime" />} />
          <div className="space-y-2.5 border-t border-white/[0.06] px-5 py-4">
            {refs.length === 0 ? <p className="text-[11px] leading-relaxed text-muted">No recalled lesson changed this recommendation. The baseline and informed answer match.</p> : null}
            {refs.map((ref) => (
              <div key={ref.memoryId} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] text-lime/70">{ref.code}</span>
                  <span className="ml-auto text-[9px] text-muted/60">{ref.blobId ? "Walrus blob" : "local record"}</span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-cream/80">{ref.label}</p>
                {ref.blobId ? <p className="mt-1 truncate font-mono text-[8.5px] text-lime/55">{ref.blobId}</p> : <p className="mt-1 text-[8.5px] text-amber/60">No blob ID returned. Not counted as a Mainnet write.</p>}
              </div>
            ))}
            <Link href={`/app/learning`} className="flex items-center justify-between pt-1 text-[10.5px] text-muted transition hover:text-lime">
              Open memory ledger <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </Card>
      </div>

      {showOutcome ? (
        <Card className="animate-rise">
          <CardHeader title="Record what actually happened" subtitle="Only confirmed facts become prediction error. LANDED will not infer a fee, delivery time, or buffer." />
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Amount sent"><input className={inputClass} inputMode="decimal" value={amountSent} onChange={(e) => setAmountSent(e.target.value)} /></Field>
            <Field label="Actual fee"><input className={inputClass} inputMode="decimal" placeholder="0.00" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
            <Field label="Actual received"><input className={inputClass} inputMode="decimal" placeholder="0.00" value={received} onChange={(e) => setReceived(e.target.value)} /></Field>
            <Field label="Delivery hours"><input className={inputClass} inputMode="numeric" placeholder="4" value={deliveryHours} onChange={(e) => setDeliveryHours(e.target.value)} /></Field>
            <Field label="Buffer after"><input className={inputClass} inputMode="decimal" placeholder="0.00" value={bufferAfter} onChange={(e) => setBufferAfter(e.target.value)} /></Field>
            <div className="sm:col-span-2 lg:col-span-2">
              <Field label="Notes"><input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Salary arrived late; rent still covered." maxLength={1000} /></Field>
            </div>
            <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Field label="Sui transaction digest (optional)" hint="LANDED reads it through Tatum and re-verifies it on save. Only a successful transaction can mark this outcome onchain-verified." className="flex-1">
                  <input className={`${inputClass} font-mono text-[11.5px]`} value={digest} onChange={(e) => { setDigest(e.target.value); setChain(null); }} placeholder="e.g. 8Jc7…" spellCheck={false} />
                </Field>
                <Button variant="outline" onClick={readChain} loading={chainLoading} disabled={digest.trim().length < 32} className="sm:mb-[22px]"><Database className="h-3.5 w-3.5" /> Read via Tatum</Button>
              </div>
              {chainError ? <ErrorNote className="mt-2">{chainError}</ErrorNote> : null}
              {chain ? (
                <div className="mt-3 space-y-2 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={chain.status === "success" ? "lime" : "red"}>{chain.status}</Badge>
                    <span className="text-muted">{new Date(chain.timestamp).toLocaleString("en-US")}</span>
                    <span className="text-muted">· gas {chain.gasFeeSui} SUI</span>
                    <a href={chain.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-lime hover:underline">explorer <ExternalLink className="h-2.5 w-2.5" /></a>
                  </div>
                  <ul className="space-y-1 font-mono text-[10px] text-cream/75">
                    {chain.balanceChanges.map((c, i) => (
                      <li key={i}>
                        {c.direction === "out" ? "−" : "+"}{c.amountMinor !== null ? (c.amountMinor / 100).toFixed(2) : "?"} {c.symbol ?? c.coinType.split("::").pop()} · {c.owner ? `${c.owner.slice(0, 8)}…${c.owner.slice(-4)}` : "object"}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-2">
                    {chain.status === "success" ? <Button size="sm" onClick={() => applyChain(chain)}><Check className="h-3 w-3" /> Use these facts</Button> : null}
                    <span className="text-[10px] text-muted/80">{chain.note} Only {decision.currency}-denominated changes are filled.</span>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3">
              <Toggle checked={billsCovered} onChange={setBillsCovered} label="Bills covered" />
              <Toggle checked={shortfall} onChange={setShortfall} label="Shortfall occurred" />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button onClick={recordOutcome} loading={saving}>Save confirmed outcome</Button>
              <Button variant="ghost" onClick={() => setShowOutcome(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      ) : null}

      {outcome ? (
        <Card>
          <CardHeader
            title="Advice Autopsy"
            subtitle="Predicted versus observed. Absolute errors are shown only where both values exist."
            right={<Badge tone={outcome.objectiveAchieved ? "lime" : "amber"}>{outcome.objectiveAchieved ? "objective achieved" : "objective missed"}</Badge>}
          />
          <div className="grid gap-px border-t border-white/[0.06] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Fee error", value: errors?.feeErrorMinor, format: (v: number) => formatMinor(Math.abs(v), decision.currency) },
              { label: "Received error", value: errors?.receivedErrorMinor, format: (v: number) => formatMinor(Math.abs(v), decision.currency) },
              { label: "Delivery error", value: errors?.deliveryErrorHours, format: (v: number) => `${Math.abs(v).toFixed(1)}h` },
              { label: "Buffer error", value: errors?.bufferErrorMinor, format: (v: number) => formatMinor(Math.abs(v), decision.currency) },
            ].map((item) => (
              <div key={item.label} className="bg-[#11150f] p-4">
                <p className="text-[9px] uppercase tracking-[0.1em] text-muted">{item.label}</p>
                <p className={`mt-1.5 text-[17px] tabular-nums ${item.value === null || item.value === undefined ? "text-muted" : Math.abs(item.value) > 0 ? "text-amber" : "text-lime"}`}>
                  {item.value === null || item.value === undefined ? "not recorded" : item.format(item.value)}
                </p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 border-t border-white/[0.06] px-5 py-4 sm:grid-cols-2">
            <div>
              <p className="text-[9.5px] uppercase tracking-[0.11em] text-muted">Confirmed observation</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-cream/80">{String(observed?.notes ?? "No notes recorded.")}</p>
            </div>
            <div>
              <p className="text-[9.5px] uppercase tracking-[0.11em] text-muted">Evaluation</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-cream/80">
                Status: {outcome.outcomeStatus}. {outcome.shortfallOccurred ? "A shortfall was confirmed, so the lesson is a correction rather than a success claim." : "No shortfall was confirmed."}
              </p>
            </div>
          </div>
          {decision.evidence.length > 0 ? (
            <div className="border-t border-white/[0.06] px-5 py-4">
              <p className="text-[9.5px] uppercase tracking-[0.11em] text-muted">How the lessons behind this advice held up</p>
              <ul className="mt-2 space-y-2">
                {decision.evidence.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-2 text-[11px]">
                    <Badge tone={verdictTone[e.verdict] ?? "muted"}>{e.verdict}</Badge>
                    <span className="text-cream/85">{e.memory.summary}</span>
                    <span className="tabular-nums text-muted">confidence {Math.round(e.confidenceBefore * 100)}% → <span className={e.confidenceAfter >= e.confidenceBefore ? "text-lime" : "text-red"}>{Math.round(e.confidenceAfter * 100)}%</span></span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] leading-relaxed text-muted/80">Confidence weights how strongly each rule acts in future cash-flow and route decisions.</p>
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] pb-px">
        {([
          ["autopsy", "Autopsy"],
          ["replay", "Learning replay"],
          ["memories", `Draft lessons (${decision.memories.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`border-b-2 px-3 py-2.5 text-[11.5px] transition ${tab === key ? "border-lime text-cream" : "border-transparent text-muted hover:text-cream"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "autopsy" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Counterfactual" subtitle="The baseline uses the identical input snapshot with memory removed." right={<GitCompareArrows className="h-4 w-4 text-muted" />} />
            <div className="grid gap-px border-t border-white/[0.06] bg-white/[0.06] sm:grid-cols-2">
              <div className="bg-[#11150f] p-4">
                <p className="text-[9px] uppercase tracking-[0.1em] text-muted">Without memory</p>
                <p className="mt-2 text-[22px] tabular-nums text-muted">{baseline ? formatMinor(baseline.amountMinor, baseline.currency) : "—"}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted">{baseline?.headline}</p>
              </div>
              <div className="bg-lime/[0.03] p-4">
                <p className="text-[9px] uppercase tracking-[0.1em] text-muted">With recalled memory</p>
                <p className="mt-2 text-[22px] tabular-nums text-lime">{recommended ? formatMinor(recommended.amountMinor, recommended.currency) : "—"}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-cream/70">{recommended?.headline}</p>
              </div>
            </div>
            {recommended?.adjustments?.length ? (
              <div className="border-t border-white/[0.06] px-5 py-4">
                <p className="text-[9.5px] uppercase tracking-[0.11em] text-muted">Constraints that changed the answer</p>
                <div className="mt-2 space-y-2">
                  {recommended.adjustments.map((adjustment, index) => (
                    <div key={`${adjustment.code}-${index}`} className="flex gap-2.5">
                      <Brain className="mt-0.5 h-3 w-3 shrink-0 text-lime" />
                      <div>
                        <p className="text-[10.5px] text-cream/80">{adjustment.label}</p>
                        <p className="text-[10px] leading-relaxed text-muted">{adjustment.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Assumptions at decision time" subtitle="Preserved verbatim in the audit record." right={<ChevronDown className="h-4 w-4 text-muted" />} />
            <div className="space-y-3 border-t border-white/[0.06] px-5 py-4">
              {decision.assumptions.map((assumption) => (
                <div key={assumption.key} className="flex gap-2.5">
                  {assumption.source === "memory" ? <Brain className="mt-0.5 h-3 w-3 shrink-0 text-lime" /> : <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-muted" />}
                  <div>
                    <p className="text-[10.5px] text-cream/80">{assumption.label} <span className="ml-1 text-[8.5px] uppercase tracking-[0.08em] text-muted/50">{assumption.source}</span></p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{assumption.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "replay" ? (
        <Card>
          <CardHeader
            title="Learning Replay"
            subtitle="Re-run the identical input snapshot with only memories available at the cutoff. The original answer is never rewritten."
            right={<Database className="h-4 w-4 text-muted" />}
          />
          <div className="flex flex-wrap items-end gap-3 border-t border-white/[0.06] px-5 py-4">
            <Field label="Memory cutoff" hint="Memories created after this date are excluded." className="w-48">
              <input className={inputClass} type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
            </Field>
            <Button onClick={loadReplay} loading={replayLoading}><RefreshCw className="h-3.5 w-3.5" /> Replay</Button>
            <p className="pb-1 text-[10px] text-muted">Original cutoff: {new Date(decision.createdAt).toISOString().slice(0, 10)}</p>
          </div>
          {replay ? (
            <div className="animate-rise border-t border-white/[0.06]">
              <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2">
                <div className="bg-[#11150f] p-5">
                  <p className="text-[9px] uppercase tracking-[0.11em] text-muted">Baseline arm · no memory</p>
                  <p className="mt-2 text-[26px] tabular-nums text-muted">{formatMinor(replay.baseline.action.amountMinor, decision.currency)}</p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{replay.baseline.action.headline}</p>
                  <p className="mt-2 text-[9.5px] text-muted/60">Safe to move {formatMinor(replay.baseline.cashflow.safeToMoveMinor, decision.currency)} · confidence {Math.round(replay.baseline.cashflow.confidence * 100)}%</p>
                </div>
                <div className="bg-lime/[0.03] p-5">
                  <p className="text-[9px] uppercase tracking-[0.11em] text-lime">Informed arm · cutoff memory</p>
                  <p className="mt-2 text-[26px] tabular-nums text-lime">{formatMinor(replay.informed.action.amountMinor, decision.currency)}</p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-cream/75">{replay.informed.action.headline}</p>
                  <p className="mt-2 text-[9.5px] text-muted/70">Safe to move {formatMinor(replay.informed.cashflow.safeToMoveMinor, decision.currency)} · confidence {Math.round(replay.informed.cashflow.confidence * 100)}%</p>
                </div>
              </div>
              <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
                <div>
                  <p className="text-[9.5px] uppercase tracking-[0.11em] text-muted">Memories eligible at cutoff</p>
                  <div className="mt-2 space-y-1.5">
                    {replay.informed.memories.length === 0 ? <p className="text-[10.5px] text-muted">None. Both arms match.</p> : null}
                    {replay.informed.memories.map((memory) => (
                      <p key={memory.id} className="text-[10px] leading-relaxed text-cream/75">· {memory.summary} <span className="text-muted/50">({memory.writeStatus})</span></p>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[9.5px] uppercase tracking-[0.11em] text-muted">Time consistency</p>
                  <p className="mt-2 text-[10px] leading-relaxed text-muted">{replay.timeConsistency.note}</p>
                  <p className="mt-2 text-[10px] text-amber/80">{replay.timeConsistency.newMemoriesExcluded} newer memor{replay.timeConsistency.newMemoriesExcluded === 1 ? "y" : "ies"} excluded.</p>
                  {replay.retrieval.error ? <p className="mt-2 text-[9.5px] leading-relaxed text-amber/70">{replay.retrieval.error}</p> : null}
                </div>
              </div>
              {replay.diffs.length > 0 ? (
                <div className="border-t border-white/[0.06] px-5 py-3">
                  {replay.diffs.map((diff, index) => (
                    <p key={index} className="text-[10px] text-muted">Changed <span className="text-cream/75">{diff.field}</span>: {String(diff.from)} → {String(diff.to)}</p>
                  ))}
                </div>
              ) : null}
              <p className="border-t border-white/[0.06] px-5 py-3 text-[9.5px] leading-relaxed text-muted/60">{replay.modeledRiskDelta.note}</p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {tab === "memories" ? (
        <Card>
          <CardHeader title="Draft and confirmed lessons" subtitle="Confirming is your decision. Unconfirmed hypotheses never change a recommendation." right={<Badge tone="muted">{decision.memories.length}</Badge>} />
          <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
            {decision.memories.length === 0 ? <p className="px-5 py-8 text-center text-[11.5px] text-muted">No lesson has been generated from this decision yet. Record an outcome first.</p> : null}
            {decision.memories.map((memory) => {
              const rule = parseJson<{ kind?: string } | null>(memory.structuredRule, null);
              return (
                <div key={memory.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone[memory.writeStatus] ?? "muted"}>{memory.writeStatus}</Badge>
                    <Badge tone={statusTone[memory.verificationStatus] ?? "muted"}>{memory.verificationStatus.replaceAll("_", " ")}</Badge>
                    <span className="text-[9px] uppercase tracking-[0.1em] text-muted/60">{memory.category.replaceAll("_", " ")}</span>
                    <span className="ml-auto text-[9px] text-muted/50">confidence {Math.round(memory.confidence * 100)}%</span>
                  </div>
                  <p className="mt-2 text-[12px] text-cream">{memory.summary}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{memory.lesson}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {rule?.kind ? <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[8.5px] text-lime/70">{rule.kind}</span> : null}
                    {memory.walrusBlobId ? (
                      <span className="truncate font-mono text-[8.5px] text-lime/60">blob {memory.walrusBlobId}</span>
                    ) : (
                      <span className="text-[8.5px] text-amber/60">No Walrus blob ID — local rehearsal</span>
                    )}
                  </div>
                  {memory.writeError ? <p className="mt-1.5 text-[9.5px] leading-relaxed text-amber/70">{memory.writeError}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {memory.verificationStatus === "hypothesis" ? (
                      <>
                        <Button size="sm" onClick={() => memoryAction(memory.id, "confirm")} disabled={saving}><Check className="h-3 w-3" /> Confirm lesson</Button>
                        <Button size="sm" variant="secondary" onClick={() => memoryAction(memory.id, "reject")} disabled={saving}><X className="h-3 w-3" /> Reject</Button>
                      </>
                    ) : null}
                    {memory.writeStatus !== "confirmed" && memory.verificationStatus !== "hypothesis" && memory.verificationStatus !== "rejected" ? (
                      <Button size="sm" variant="outline" onClick={() => writeMemory(memory.id)} disabled={saving}><Database className="h-3 w-3" /> Attempt Walrus write</Button>
                    ) : null}
                    {memory.writeStatus === "confirmed" && memory.walrusBlobId ? (
                      <a href={`https://walruscan.com/blob/${memory.walrusBlobId}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-lime/25 px-3 text-[11px] text-lime transition hover:bg-lime/[0.08]">
                        View blob <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <div className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.015] px-4 py-3">
        <p className="flex items-center gap-2 text-[10px] text-muted"><ShieldCheck className="h-3 w-3" /> Inputs are stored verbatim. Outcomes cannot be overwritten once evaluated.</p>
        <Link href="/app/plan" className="text-[10.5px] text-lime">Plan another move →</Link>
      </div>
    </div>
  );
}
