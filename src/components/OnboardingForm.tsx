"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { post, errorMessage } from "@/lib/client";
import { Button, ErrorNote, Field, inputClass, selectClass, Toggle } from "@/components/ui";

type Obligation = { name: string; amount: string; dueDate: string; priority: "essential" | "important" | "discretionary" };

function inDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [objective, setObjective] = useState("Protect rent, send money home, and build a buffer.");
  const [currency, setCurrency] = useState("USD");
  const [startingBalance, setStartingBalance] = useState("");
  const [safetyBuffer, setSafetyBuffer] = useState("100");
  const [riskPosture, setRiskPosture] = useState<"cautious" | "balanced" | "flexible">("balanced");
  const [includeExampleData, setIncludeExampleData] = useState(true);
  const [obligations, setObligations] = useState<Obligation[]>([
    { name: "Rent", amount: "", dueDate: inDays(8), priority: "essential" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateObligation(index: number, patch: Partial<Obligation>) {
    setObligations((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await post("/api/onboarding", {
        currency,
        objective,
        startingBalance: startingBalance || "0",
        obligations: obligations.filter((o) => o.name.trim() && o.amount.trim()),
        safetyBuffer: safetyBuffer || "0",
        riskPosture,
        includeExampleData,
      });
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-16">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime text-[14px] font-bold text-[#0b1007]">L</span>
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted">LANDED setup · {defaultName}</p>
          <p className="text-[12px] text-cream">Step {step} of 2</p>
        </div>
      </div>

      <div className="mt-6 flex gap-1.5">
        <span className={`h-1 flex-1 rounded-full ${step >= 1 ? "bg-lime" : "bg-white/10"}`} />
        <span className={`h-1 flex-1 rounded-full ${step >= 2 ? "bg-lime" : "bg-white/10"}`} />
      </div>

      {step === 1 ? (
        <div className="animate-rise mt-10">
          <p className="text-[11px] uppercase tracking-[0.18em] text-lime">The picture</p>
          <h1 className="mt-3 font-display text-[40px] leading-[1.05] text-cream sm:text-[48px]">What are you protecting?</h1>
          <p className="mt-3 max-w-lg text-[13px] leading-6 text-muted">
            LANDED uses this to choose what counts as an essential obligation. You can change everything later — and
            every number is self-reported until you connect a verified source.
          </p>

          <div className="mt-8 space-y-5">
            <Field label="Main objective">
              <input className={inputClass} value={objective} onChange={(e) => setObjective(e.target.value)} maxLength={200} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Currency">
                <select className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {["USD", "EUR", "GBP", "PHP", "MXN", "INR", "NGN", "KES"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Liquid balance">
                <input className={inputClass} inputMode="decimal" placeholder="0.00" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} />
              </Field>
              <Field label="Safety buffer">
                <input className={inputClass} inputMode="decimal" placeholder="100.00" value={safetyBuffer} onChange={(e) => setSafetyBuffer(e.target.value)} />
              </Field>
            </div>
            <Field label="Risk posture" hint="Cautious keeps a larger reserve. Flexible accepts more timing risk.">
              <select className={selectClass} value={riskPosture} onChange={(e) => setRiskPosture(e.target.value as typeof riskPosture)}>
                <option value="cautious">Cautious — protect first</option>
                <option value="balanced">Balanced — cover bills, keep room</option>
                <option value="flexible">Flexible — optimize for the goal</option>
              </select>
            </Field>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4">
              <Toggle
                checked={includeExampleData}
                onChange={setIncludeExampleData}
                label="Add clearly labelled example data"
                description="Creates synthetic accounts, bills, and one demo route so you can see the full loop. Every record is marked synthetic."
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <Button size="lg" onClick={() => setStep(2)} disabled={!objective.trim()}>
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="animate-rise mt-10">
          <p className="text-[11px] uppercase tracking-[0.18em] text-lime">The obligations</p>
          <h1 className="mt-3 font-display text-[40px] leading-[1.05] text-cream sm:text-[48px]">What lands before you do?</h1>
          <p className="mt-3 max-w-lg text-[13px] leading-6 text-muted">
            Add bills that must be covered. Only essential and important obligations reduce safe-to-move. Skip this if
            you added example data.
          </p>

          <div className="mt-8 space-y-3">
            {obligations.map((row, index) => (
              <div key={index} className="grid gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:grid-cols-[1.4fr_1fr_1fr_0.9fr_auto] sm:items-end">
                <Field label={index === 0 ? "Name" : " "}>
                  <input className={inputClass} value={row.name} onChange={(e) => updateObligation(index, { name: e.target.value })} placeholder="Rent" />
                </Field>
                <Field label={index === 0 ? "Amount" : " "}>
                  <input className={inputClass} inputMode="decimal" value={row.amount} onChange={(e) => updateObligation(index, { amount: e.target.value })} placeholder="1450.00" />
                </Field>
                <Field label={index === 0 ? "Due" : " "}>
                  <input className={inputClass} type="date" value={row.dueDate} onChange={(e) => updateObligation(index, { dueDate: e.target.value })} />
                </Field>
                <Field label={index === 0 ? "Priority" : " "}>
                  <select className={selectClass} value={row.priority} onChange={(e) => updateObligation(index, { priority: e.target.value as Obligation["priority"] })}>
                    <option value="essential">Essential</option>
                    <option value="important">Important</option>
                    <option value="discretionary">Optional</option>
                  </select>
                </Field>
                <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => setObligations((rows) => rows.filter((_, i) => i !== index))} aria-label="Remove obligation">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setObligations((rows) => [...rows, { name: "", amount: "", dueDate: inDays(15), priority: "important" }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add another obligation
            </Button>
          </div>

          {error ? <ErrorNote className="mt-6">{error}</ErrorNote> : null}

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button size="lg" onClick={submit} loading={loading}>
              Enter LANDED <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
