"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Check, ChevronDown, Database, ExternalLink, Filter,
  Globe2, RefreshCw, Search, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { formatMinor } from "@/lib/money";
import { errorMessage, patch, post } from "@/lib/client";
import { Badge, Button, Card, CardHeader, ErrorNote, inputClass, Progress, Toggle } from "@/components/ui";

type Memory = {
  id: string; category: string; summary: string; lesson: string; confidence: number;
  verificationStatus: string; writeStatus: string; walrusBlobId: string | null; jobId: string | null;
  source: string; isSynthetic: boolean; createdAt: string | Date; confirmedAt: string | Date | null;
  writeError: string | null; structuredRule: string | null; supersededBy: string | null;
  decision: { id: string; objective: string; decisionType: string; status: string } | null;
  evidence: Evidence[];
};

type Evidence = {
  id: string; verdict: string; reason: string; confidenceBefore: number; confidenceAfter: number;
  decisionId: string; createdAt: string | Date;
};

const verdictTone: Record<string, "lime" | "red" | "muted"> = { held: "lime", contradicted: "red", inconclusive: "muted" };

type Metrics = {
  counts: { decisions: number; evaluated: number; achieved: number; partial: number; missed: number; shortfalls: number; memories: number; confirmedMemories: number; localRehearsalMemories: number; hypotheses: number; memoryInfluenced: number; followed: number };
  errors: { feeMaeMinor: number; receivedMaeMinor: number; deliveryMaeHours: number; bufferMaeMinor: number; samples: { fee: number; received: number; delivery: number; buffer: number } };
  rates: { shortfallRate: number; objectiveRate: number; acceptanceRate: number; memoryInfluenceRate: number };
  modeled: { amountReducedAcrossDecisionsMinor: number; samples: number; note: string };
  observations: { total: number; consented: number; routesWithHistory: number };
  community: { eligibleGroups: number; note: string };
  evidenceNote: string;
};

type DecisionRow = {
  id: string; objective: string; status: string; createdAt: string | Date; currency: string;
  recommended: { amountMinor: number } | null; baseline: { amountMinor: number } | null;
  outcomes: { outcomeStatus: string; shortfallOccurred: boolean; predictionError: string; evaluatedAt: string | Date; objectiveAchieved: boolean }[];
  memories: { id: string; summary: string; writeStatus: string; walrusBlobId: string | null }[];
};

type Verification = {
  health: { configured: boolean; reachable: boolean; status: string; serverUrl: string; error: string | null; version: string | null; writeReady: boolean | null };
  namespace: string;
  counts: { total: number; confirmed: number; blocked: number; failed: number; pending: number; localRehearsal: number };
  note: string;
  records: { id: string; category: string; summary: string; writeStatus: string; blobId: string | null; jobId: string | null; decisionId: string | null; createdAt: string | Date; confirmedAt: string | Date | null; error: string | null; source: string; isSynthetic: boolean; confidence: number; verificationStatus: string }[];
};

type Community = {
  optedIn: boolean;
  stats: { routeGroupKey: string; observationCount: number; contributorCount: number; confidence: number; cost: unknown; delivery: unknown; lastCalculatedAt: string | Date }[];
  note: string;
};

type Consent = { consentType: string; granted: boolean; updatedAt: string | Date | null };

const writeTone: Record<string, "lime" | "amber" | "red" | "sky" | "muted"> = {
  confirmed: "lime", pending: "amber", writing: "amber", blocked: "amber", failed: "red", superseded: "muted",
  user_confirmed: "sky", hypothesis: "amber", rejected: "red", verified: "lime",
};

const categories = ["all", "financial_pattern", "preference", "outcome", "correction", "route_intelligence"];

function shortDate(value: string | Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function LearningView({ metrics, memories, decisions, verification, community, consents }: {
  metrics: Metrics; memories: Memory[]; decisions: DecisionRow[]; verification: Verification; community: Community; consents: Consent[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"ledger" | "track" | "autopsies" | "verification" | "community">("ledger");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openMemory, setOpenMemory] = useState<string | null>(null);
  const [consentState, setConsentState] = useState<Record<string, boolean>>(Object.fromEntries(consents.map((c) => [c.consentType, c.granted])));

  const filtered = useMemo(() => memories.filter((memory) => {
    if (category !== "all" && memory.category !== category) return false;
    if (status === "confirmed" && memory.writeStatus !== "confirmed") return false;
    if (status === "local" && memory.writeStatus === "confirmed") return false;
    if (status === "hypothesis" && memory.verificationStatus !== "hypothesis") return false;
    if (status === "superseded" && !memory.supersededBy) return false;
    if (search.trim()) {
      const haystack = `${memory.summary} ${memory.lesson} ${memory.category}`.toLowerCase();
      if (!haystack.includes(search.trim().toLowerCase())) return false;
    }
    return true;
  }), [memories, category, status, search]);

  const evaluated = decisions.filter((d) => d.outcomes.length > 0);
  const tested = memories
    .filter((m) => m.evidence.length > 0)
    .sort((a, b) => b.evidence.length - a.evidence.length || b.confidence - a.confidence);
  const allEvidence = tested.flatMap((m) => m.evidence);
  const heldCount = allEvidence.filter((e) => e.verdict === "held").length;
  const contradictedCount = allEvidence.filter((e) => e.verdict === "contradicted").length;

  async function memoryFeedback(id: string, action: "confirm" | "reject") {
    setBusy(id); setError(null); setNotice(null);
    try {
      const result = await post<{ write: { writeStatus: string; error: string | null; blobId: string | null } | null }>(`/api/memories/${id}/feedback`, { action });
      if (result.write) {
        setNotice(result.write.writeStatus === "confirmed" ? `Written and confirmed on Walrus. Blob ${result.write.blobId}` : `Confirmed locally. ${result.write.error ?? "Walrus write not confirmed."}`);
      } else {
        setNotice("Rejected. This lesson will not be recalled for future decisions.");
      }
      router.refresh();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(null); }
  }

  async function writeMemory(id: string) {
    setBusy(id); setError(null); setNotice(null);
    try {
      const result = await post<{ result: { writeStatus: string; blobId: string | null; error: string | null } }>(`/api/memories/${id}/write`);
      setNotice(result.result.writeStatus === "confirmed" ? `Confirmed Walrus blob ${result.result.blobId}` : result.result.error ?? "Write not confirmed.");
      router.refresh();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(null); }
  }

  async function exclude(id: string, excluded: boolean) {
    setBusy(id); setError(null); setNotice(null);
    try {
      const result = await patch<{ note: string }>(`/api/memories/${id}`, { excluded, reason: excluded ? "Excluded from future decisions in the memory ledger" : undefined });
      setNotice(result.note);
      router.refresh();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(null); }
  }

  async function toggleConsent(type: string, granted: boolean) {
    setBusy(type); setError(null); setNotice(null);
    try {
      const result = await post<{ note: string }>("/api/consents", { consentType: type, granted });
      setConsentState((prev) => ({ ...prev, [type]: granted }));
      setNotice(result.note);
      router.refresh();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(null); }
  }

  async function aggregate() {
    setBusy("aggregate"); setError(null); setNotice(null);
    try {
      const result = await post<{ groupsEvaluated: number; groupsPublished: number; note: string }>("/api/community");
      setNotice(`${result.note} Evaluated ${result.groupsEvaluated} groups; published ${result.groupsPublished}.`);
      router.refresh();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted/80">Persistent memory</p>
          <h1 className="mt-1.5 font-display text-[32px] leading-tight text-cream sm:text-[38px]">What LANDED remembers.</h1>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted">
            A lesson only influences advice after you confirm it. Every record shows its category, evidence, typed rule,
            decision, and exact Walrus write status.
          </p>
        </div>
        <div className="flex gap-2">
          {verification.health.configured ? <Badge tone="lime"><ShieldCheck className="h-2.5 w-2.5" /> Walrus configured</Badge> : <Badge tone="amber">Walrus not configured</Badge>}
          <Badge tone="muted">{metrics.counts.memories} records</Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted">Confirmed Mainnet writes</p>
          <p className="mt-2 font-display text-[30px] leading-none text-lime">{metrics.counts.confirmedMemories}</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted">Only records with a returned blob ID.</p>
        </Card>
        <Card className="p-4">
          <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted">Local rehearsal</p>
          <p className="mt-2 font-display text-[30px] leading-none text-amber">{metrics.counts.localRehearsalMemories}</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted">Never presented as a Walrus write.</p>
        </Card>
        <Card className="p-4">
          <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted">Objectives achieved</p>
          <p className="mt-2 font-display text-[30px] leading-none text-cream">{Math.round(metrics.rates.objectiveRate * 100)}%</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted">{metrics.counts.evaluated} evaluated outcomes.</p>
        </Card>
        <Card className="p-4">
          <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted">Memory influence</p>
          <p className="mt-2 font-display text-[30px] leading-none text-cream">{Math.round(metrics.rates.memoryInfluenceRate * 100)}%</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted">Decisions with at least one recalled lesson.</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Prediction error" subtitle="Absolute mean error from confirmed outcomes only. Missing values are excluded, never imputed." right={<Badge tone="muted">{metrics.counts.evaluated} samples</Badge>} />
          <div className="grid gap-px border-t border-white/[0.06] bg-white/[0.06] sm:grid-cols-4">
            {[
              { label: "Fee MAE", value: formatMinor(metrics.errors.feeMaeMinor, "USD"), n: metrics.errors.samples.fee },
              { label: "Received MAE", value: formatMinor(metrics.errors.receivedMaeMinor, "USD"), n: metrics.errors.samples.received },
              { label: "Delivery MAE", value: `${metrics.errors.deliveryMaeHours}h`, n: metrics.errors.samples.delivery },
              { label: "Buffer MAE", value: formatMinor(metrics.errors.bufferMaeMinor, "USD"), n: metrics.errors.samples.buffer },
            ].map((item) => (
              <div key={item.label} className="bg-[#11150f] p-4">
                <p className="text-[9px] uppercase tracking-[0.1em] text-muted">{item.label}</p>
                <p className="mt-2 text-[17px] tabular-nums text-cream">{item.value}</p>
                <p className="mt-1 text-[9px] text-muted/60">{item.n} recorded</p>
              </div>
            ))}
          </div>
          <p className="border-t border-white/[0.06] px-5 py-3 text-[9.5px] leading-relaxed text-muted/70">{metrics.evidenceNote}</p>
        </Card>

        <Card className="p-5">
          <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted">Shortfall rate</p>
          <p className="mt-2 font-display text-[34px] leading-none text-cream">{Math.round(metrics.rates.shortfallRate * 100)}%</p>
          <Progress value={metrics.rates.shortfallRate * 100} tone={metrics.rates.shortfallRate > 0.3 ? "red" : "amber"} className="mt-3" />
          <div className="mt-5 space-y-2 text-[10.5px]">
            <div className="flex justify-between"><span className="text-muted">Achieved</span><span className="text-lime">{metrics.counts.achieved}</span></div>
            <div className="flex justify-between"><span className="text-muted">Partial</span><span className="text-amber">{metrics.counts.partial}</span></div>
            <div className="flex justify-between"><span className="text-muted">Missed</span><span className="text-red">{metrics.counts.missed}</span></div>
            <div className="flex justify-between"><span className="text-muted">Shortfalls</span><span className="text-cream">{metrics.counts.shortfalls}</span></div>
          </div>
          <p className="mt-4 border-t border-white/[0.07] pt-3 text-[9.5px] leading-relaxed text-muted/70">{metrics.modeled.note}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07]">
        {([
          ["ledger", `Memory ledger (${memories.length})`],
          ["track", `Track record (${tested.length})`],
          ["autopsies", `Autopsies (${evaluated.length})`],
          ["verification", "Walrus verification"],
          ["community", "Community"],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`border-b-2 px-3 py-2.5 text-[11.5px] transition ${tab === key ? "border-lime text-cream" : "border-transparent text-muted hover:text-cream"}`}>{label}</button>
        ))}
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {notice ? <div className="rounded-xl border border-lime/25 bg-lime/[0.06] px-3.5 py-2.5 text-[11px] leading-relaxed text-lime">{notice}</div> : null}

      {tab === "ledger" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted/60" />
              <input className={`${inputClass} h-9 pl-8 text-[11.5px]`} placeholder="Search lessons, corrections, routes…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className={`${inputClass} h-9 w-auto text-[11px]`} value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((item) => <option key={item} value={item}>{item === "all" ? "All categories" : item.replaceAll("_", " ")}</option>)}
            </select>
            <select className={`${inputClass} h-9 w-auto text-[11px]`} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="confirmed">Walrus confirmed</option>
              <option value="local">Local / blocked</option>
              <option value="hypothesis">Hypotheses</option>
              <option value="superseded">Superseded</option>
            </select>
            <span className="text-[10px] text-muted"><Filter className="mr-1 inline h-3 w-3" />{filtered.length} shown</span>
          </div>

          <Card>
            <div className="divide-y divide-white/[0.06]">
              {filtered.length === 0 ? <p className="px-5 py-10 text-center text-[11.5px] text-muted">No memory matches those filters.</p> : null}
              {filtered.map((memory) => {
                const isOpen = openMemory === memory.id;
                return (
                  <div key={memory.id} className={`px-5 py-4 transition ${memory.supersededBy ? "opacity-60" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={writeTone[memory.writeStatus] ?? "muted"}>{memory.writeStatus}</Badge>
                      <Badge tone={writeTone[memory.verificationStatus] ?? "muted"}>{memory.verificationStatus.replaceAll("_", " ")}</Badge>
                      <span className="text-[9px] uppercase tracking-[0.1em] text-muted/60">{memory.category.replaceAll("_", " ")}</span>
                      {memory.isSynthetic ? <span className="text-[8.5px] text-amber/60">synthetic demo</span> : null}
                      {memory.evidence.length > 0 ? (
                        <span className="text-[9px] text-muted" title="Outcomes that tested this lesson">
                          <span className="text-lime">{memory.evidence.filter((e) => e.verdict === "held").length} held</span>
                          {" · "}
                          <span className={memory.evidence.some((e) => e.verdict === "contradicted") ? "text-red" : ""}>{memory.evidence.filter((e) => e.verdict === "contradicted").length} wrong</span>
                        </span>
                      ) : null}
                      <span className="ml-auto text-[9px] text-muted/50">{shortDate(memory.createdAt)} · {Math.round(memory.confidence * 100)}%</span>
                    </div>
                    <button type="button" onClick={() => setOpenMemory(isOpen ? null : memory.id)} className="mt-2 flex w-full items-start gap-2 text-left">
                      <p className="flex-1 text-[12px] leading-relaxed text-cream">{memory.summary}</p>
                      <ChevronDown className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-muted/50 transition ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen ? (
                      <div className="mt-3 space-y-2.5 rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5 animate-rise">
                        <div>
                          <p className="text-[9px] uppercase tracking-[0.11em] text-muted">Lesson</p>
                          <p className="mt-1 text-[11px] leading-relaxed text-cream/80">{memory.lesson}</p>
                        </div>
                        {memory.evidence.length > 0 ? (
                          <div>
                            <p className="text-[9px] uppercase tracking-[0.11em] text-muted">Track record</p>
                            <ul className="mt-1 space-y-1">
                              {memory.evidence.map((e) => (
                                <li key={e.id} className="flex flex-wrap items-baseline gap-2 text-[10.5px] text-cream/80">
                                  <Badge tone={verdictTone[e.verdict] ?? "muted"}>{e.verdict}</Badge>
                                  <span className="tabular-nums text-muted">{Math.round(e.confidenceBefore * 100)}% → {Math.round(e.confidenceAfter * 100)}%</span>
                                  <span className="flex-1">{e.reason}</span>
                                  <Link href={`/app/decisions/${e.decisionId}`} className="text-[9.5px] text-muted hover:text-lime">decision →</Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {memory.structuredRule ? (
                          <div>
                            <p className="text-[9px] uppercase tracking-[0.11em] text-muted">Typed rule</p>
                            <pre className="mt-1 overflow-x-auto rounded bg-black/30 p-2 font-mono text-[8.5px] leading-relaxed text-lime/75">{memory.structuredRule}</pre>
                          </div>
                        ) : null}
                        <div className="grid gap-2 text-[9.5px] sm:grid-cols-2">
                          <div><span className="text-muted">Memory ID</span><p className="truncate font-mono text-cream/70">{memory.id}</p></div>
                          <div><span className="text-muted">Source</span><p className="text-cream/70">{memory.source}{memory.isSynthetic ? " · synthetic" : ""}</p></div>
                          <div className="sm:col-span-2"><span className="text-muted">Walrus blob</span><p className="break-all font-mono text-[9px] text-lime/70">{memory.walrusBlobId ?? "None — not a Mainnet write"}</p></div>
                          {memory.jobId ? <div className="sm:col-span-2"><span className="text-muted">Job ID</span><p className="break-all font-mono text-[9px] text-cream/60">{memory.jobId}</p></div> : null}
                          {memory.writeError ? <div className="sm:col-span-2"><span className="text-muted">Write note</span><p className="leading-relaxed text-amber/75">{memory.writeError}</p></div> : null}
                          {memory.supersededBy ? <div className="sm:col-span-2"><span className="text-muted">Superseded by</span><p className="font-mono text-[9px] text-cream/60">{memory.supersededBy}</p></div> : null}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {memory.decision ? <Link href={`/app/decisions/${memory.decision.id}`} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.1] px-2.5 text-[10px] text-muted transition hover:text-cream">Source decision <ArrowRight className="h-2.5 w-2.5" /></Link> : null}
                          {memory.verificationStatus === "hypothesis" ? (
                            <>
                              <Button size="sm" onClick={() => memoryFeedback(memory.id, "confirm")} disabled={busy === memory.id}><Check className="h-3 w-3" /> Confirm</Button>
                              <Button size="sm" variant="secondary" onClick={() => memoryFeedback(memory.id, "reject")} disabled={busy === memory.id}><X className="h-3 w-3" /> Reject</Button>
                            </>
                          ) : null}
                          {memory.writeStatus !== "confirmed" && memory.verificationStatus !== "hypothesis" && memory.verificationStatus !== "rejected" ? (
                            <Button size="sm" variant="outline" onClick={() => writeMemory(memory.id)} loading={busy === memory.id}><Database className="h-3 w-3" /> Write to Walrus</Button>
                          ) : null}
                          {memory.walrusBlobId ? (
                            <a href={`https://walruscan.com/blob/${memory.walrusBlobId}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-lime/25 px-3 text-[10px] text-lime transition hover:bg-lime/[0.08]">View blob <ExternalLink className="h-2.5 w-2.5" /></a>
                          ) : null}
                          <button type="button" onClick={() => exclude(memory.id, !memory.supersededBy)} className="ml-auto text-[10px] text-muted transition hover:text-red">
                            {memory.supersededBy ? "Already excluded" : "Exclude from decisions"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "track" ? (
        <div className="space-y-3">
          <Card>
            <CardHeader
              title="Do the lessons actually work?"
              subtitle="Every recorded outcome judges the lessons that shaped its decision. Held lessons gain confidence and act more strongly next time; lessons that applied and still failed lose it and are flagged for review. Nothing is deleted."
            />
            <div className="grid gap-px border-t border-white/[0.06] bg-white/[0.06] sm:grid-cols-4">
              {[
                { label: "Lessons tested", value: String(tested.length) },
                { label: "Verdicts: held", value: String(heldCount), tone: "text-lime" },
                { label: "Verdicts: contradicted", value: String(contradictedCount), tone: contradictedCount > 0 ? "text-red" : "" },
                { label: "Hold rate", value: heldCount + contradictedCount > 0 ? `${Math.round((heldCount / (heldCount + contradictedCount)) * 100)}%` : "—" },
              ].map((item) => (
                <div key={item.label} className="bg-[#11150f] p-4">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-muted">{item.label}</p>
                  <p className={`mt-2 text-[20px] tabular-nums text-cream ${item.tone ?? ""}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="divide-y divide-white/[0.06]">
              {tested.length === 0 ? <p className="px-5 py-10 text-center text-[11.5px] text-muted">No lesson has been tested by an outcome yet. Follow a memory-shaped decision and record what happened.</p> : null}
              {tested.map((memory) => {
                const first = memory.evidence[0].confidenceBefore;
                const held = memory.evidence.filter((e) => e.verdict === "held").length;
                const wrong = memory.evidence.filter((e) => e.verdict === "contradicted").length;
                const needsReview = wrong > 0 && memory.confidence < 0.5;
                return (
                  <div key={memory.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_220px] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {needsReview ? <Badge tone="red">Needs review</Badge> : held > 0 && wrong === 0 ? <Badge tone="lime">Proven {held}×</Badge> : <Badge tone="amber">Mixed</Badge>}
                        <span className="text-[9px] uppercase tracking-[0.1em] text-muted/60">{memory.category.replaceAll("_", " ")}</span>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-cream">{memory.summary}</p>
                      <p className="mt-1 text-[10.5px] text-muted">{memory.evidence[memory.evidence.length - 1].reason}</p>
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between text-[10px] text-muted">
                        <span>Confidence</span>
                        <span className="tabular-nums"><span className="text-muted/70">{Math.round(first * 100)}%</span> → <span className={memory.confidence >= first ? "text-lime" : "text-red"}>{Math.round(memory.confidence * 100)}%</span></span>
                      </div>
                      <div className="relative mt-1.5">
                        <Progress value={memory.confidence * 100} tone={needsReview ? "red" : memory.confidence >= first ? "lime" : "amber"} />
                        <span className="absolute -top-0.5 h-2.5 w-px bg-cream/60" style={{ left: `${first * 100}%` }} title="Before its first test" />
                      </div>
                      <div className="mt-1.5 flex gap-1">
                        {memory.evidence.map((e) => (
                          <span key={e.id} className={`h-1.5 flex-1 rounded-full ${e.verdict === "held" ? "bg-lime" : e.verdict === "contradicted" ? "bg-red" : "bg-white/15"}`} title={`${e.verdict}: ${e.reason}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "autopsies" ? (
        <div className="space-y-3">
          {evaluated.length === 0 ? <Card className="p-8 text-center text-[11.5px] text-muted">No evaluated decisions yet. Record an outcome from a decision page to start the autopsy loop.</Card> : null}
          {evaluated.map((decision) => {
            const outcome = decision.outcomes[0];
            const errors = (() => { try { return JSON.parse(outcome.predictionError) as Record<string, number | null>; } catch { return {}; } })();
            return (
              <Card key={decision.id}>
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={outcome.shortfallOccurred ? "red" : outcome.objectiveAchieved ? "lime" : "amber"}>{outcome.outcomeStatus}</Badge>
                      <span className="text-[9px] uppercase tracking-[0.1em] text-muted">{shortDate(outcome.evaluatedAt)}</span>
                      {outcome.shortfallOccurred ? <span className="text-[9.5px] text-red">shortfall</span> : null}
                    </div>
                    <p className="mt-2 text-[12.5px] text-cream">{decision.objective}</p>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[9.5px] text-muted">
                      <span>Fee error <span className="tabular-nums text-cream/80">{errors.feeErrorMinor != null ? formatMinor(Math.abs(errors.feeErrorMinor), decision.currency) : "—"}</span></span>
                      <span>Delivery error <span className="tabular-nums text-cream/80">{errors.deliveryErrorHours != null ? `${Math.abs(errors.deliveryErrorHours).toFixed(1)}h` : "—"}</span></span>
                      <span>Buffer error <span className="tabular-nums text-cream/80">{errors.bufferErrorMinor != null ? formatMinor(Math.abs(errors.bufferErrorMinor), decision.currency) : "—"}</span></span>
                    </div>
                    {decision.memories[0] ? <p className="mt-2 text-[10.5px] leading-relaxed text-muted">Lesson: {decision.memories[0].summary}</p> : null}
                  </div>
                  <Link href={`/app/decisions/${decision.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.1] px-3 text-[10.5px] text-muted transition hover:border-lime/30 hover:text-lime">
                    Open autopsy <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      {tab === "verification" ? (
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader title="Walrus Memory status" subtitle="A write is only counted as confirmed when the relayer returns a blob ID." right={<Database className="h-4 w-4 text-muted" />} />
            <div className="space-y-3 border-t border-white/[0.06] px-5 py-4">
              <div className="flex items-center justify-between text-[11px]"><span className="text-muted">Configured</span><span className={verification.health.configured ? "text-lime" : "text-amber"}>{verification.health.configured ? "Yes" : "No"}</span></div>
              <div className="flex items-center justify-between text-[11px]"><span className="text-muted">Relayer reachable</span><span className={verification.health.reachable ? "text-lime" : "text-amber"}>{verification.health.reachable ? "Yes" : "No"}</span></div>
              <div className="flex items-center justify-between text-[11px]"><span className="text-muted">Write ready</span><span className="text-cream/80">{verification.health.writeReady === null ? "unknown" : verification.health.writeReady ? "yes" : "no"}</span></div>
              <div className="flex items-center justify-between text-[11px]"><span className="text-muted">Server</span><span className="max-w-[60%] truncate font-mono text-[9.5px] text-cream/70">{verification.health.serverUrl}</span></div>
              <div className="flex items-center justify-between text-[11px]"><span className="text-muted">Namespace</span><span className="max-w-[60%] truncate font-mono text-[9.5px] text-lime/70">{verification.namespace}</span></div>
              {verification.health.error ? <p className="rounded-lg bg-amber/[0.05] px-3 py-2 text-[10px] leading-relaxed text-amber/85">{verification.health.error}</p> : null}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="rounded-lg bg-white/[0.03] p-2.5"><p className="text-[9px] uppercase tracking-[0.1em] text-muted">Confirmed</p><p className="mt-1 text-[17px] tabular-nums text-lime">{verification.counts.confirmed}</p></div>
                <div className="rounded-lg bg-white/[0.03] p-2.5"><p className="text-[9px] uppercase tracking-[0.1em] text-muted">Blocked</p><p className="mt-1 text-[17px] tabular-nums text-amber">{verification.counts.blocked}</p></div>
                <div className="rounded-lg bg-white/[0.03] p-2.5"><p className="text-[9px] uppercase tracking-[0.1em] text-muted">Failed</p><p className="mt-1 text-[17px] tabular-nums text-red">{verification.counts.failed}</p></div>
                <div className="rounded-lg bg-white/[0.03] p-2.5"><p className="text-[9px] uppercase tracking-[0.1em] text-muted">Pending</p><p className="mt-1 text-[17px] tabular-nums text-cream">{verification.counts.pending}</p></div>
              </div>
              <p className="text-[9.5px] leading-relaxed text-muted/70">{verification.note}</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Write ledger" subtitle="Job ID, blob ID, category, decision, and status for every confirmed write." right={<Badge tone="muted">{verification.records.length}</Badge>} />
            <div className="max-h-[560px] divide-y divide-white/[0.06] overflow-y-auto border-t border-white/[0.06]">
              {verification.records.map((record) => (
                <div key={record.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={writeTone[record.writeStatus] ?? "muted"}>{record.writeStatus}</Badge>
                    <span className="text-[9px] uppercase tracking-[0.1em] text-muted/60">{record.category.replaceAll("_", " ")}</span>
                    <span className="ml-auto text-[9px] text-muted/50">{shortDate(record.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-cream/85">{record.summary}</p>
                  <p className="mt-1 break-all font-mono text-[8.5px] text-muted/60">{record.blobId ? `blob ${record.blobId}` : record.error ?? "No blob ID"}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "community" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Consent" subtitle="Community route statistics are opt-in. Withdrawing stops future aggregation; it cannot retract already published aggregates." right={<Globe2 className="h-4 w-4 text-muted" />} />
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06] px-5">
              <div className="py-1">
                <Toggle
                  checked={consentState.community_route_intelligence ?? false}
                  onChange={(next) => toggleConsent("community_route_intelligence", next)}
                  disabled={busy === "community_route_intelligence"}
                  label="Community route intelligence"
                  description="Share de-identified route cost and delivery errors. Groups need at least 3 contributors and 5 observations before any statistic appears."
                />
              </div>
              <Toggle checked={consentState.anonymous_research ?? false} onChange={(next) => toggleConsent("anonymous_research", next)} disabled={busy === "anonymous_research"} label="Anonymous research" description="Allow aggregated, non-identifying research on financial patterns. No individual records." />
              <Toggle checked={consentState.product_updates ?? false} onChange={(next) => toggleConsent("product_updates", next)} disabled={busy === "product_updates"} label="Product updates" description="Occasional email about new LANDED capabilities. No financial data." />
            </div>
            <div className="border-t border-white/[0.06] px-5 py-4">
              <Button size="sm" variant="secondary" onClick={aggregate} loading={busy === "aggregate"}><RefreshCw className="h-3.5 w-3.5" /> Recompute community aggregates</Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Published route statistics" subtitle={community.note} right={<Badge tone="muted">{community.stats.length} groups</Badge>} />
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {community.stats.length === 0 ? <p className="px-5 py-10 text-center text-[11.5px] leading-relaxed text-muted">{metrics.community.note}</p> : null}
              {community.stats.map((stat) => (
                <div key={stat.routeGroupKey} className="px-5 py-3">
                  <p className="font-mono text-[10.5px] text-cream/85">{stat.routeGroupKey}</p>
                  <p className="mt-1 text-[9.5px] text-muted">{stat.contributorCount} contributors · {stat.observationCount} observations · confidence {Math.round(stat.confidence * 100)}%</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      <div className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.015] px-4 py-3">
        <p className="flex items-center gap-2 text-[10px] text-muted"><Sparkles className="h-3 w-3 text-lime" /> {metrics.counts.followed} followed · {metrics.counts.memoryInfluenced} influenced by memory</p>
        <Link href="/app/plan" className="text-[10.5px] text-lime">Make a new decision →</Link>
      </div>
    </div>
  );
}
