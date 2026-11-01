"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { parseAmountToMinor } from "@/lib/money";
import { post, errorMessage } from "@/lib/client";
import { Button, ErrorNote, Field, inputClass, selectClass } from "@/components/ui";
import { LogoMark } from "@/components/Logo";

type Obligation = {
  name: string; amount: string; dueDate: string;
  priority: "essential" | "important" | "discretionary";
  recurrence: "none" | "weekly" | "monthly" | "yearly";
};

function inDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [objective, setObjective] = useState("Protect rent, send money home, and build a buffer.");
  const [currency, setCurrency] = useState("USD");
  const [startingBalance, setStartingBalance] = useState("");
  const [safetyBuffer, setSafetyBuffer] = useState("100");
  const [riskPosture, setRiskPosture] = useState<"cautious" | "balanced" | "flexible">("balanced");
  const [incomeLabel, setIncomeLabel] = useState("Paycheck");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeDate, setIncomeDate] = useState(inDays(-10));
  const [incomeCadence, setIncomeCadence] = useState<"weekly" | "biweekly" | "monthly">("monthly");
  const [obligations, setObligations] = useState<Obligation[]>([
    { name: "", amount: "", dueDate: inDays(8), priority: "essential", recurrence: "monthly" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateObligation(index: number, patch: Partial<Obligation>) {
    setObligations((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function nextStep() {
    setError(null);
    try {
      if (!objective.trim()) throw new Error("Enter your main financial objective.");
      if (parseAmountToMinor(startingBalance || "0", currency) < 0 || parseAmountToMinor(safetyBuffer || "0", currency) < 0) {
        throw new Error("Your starting balance and safety buffer must be zero or greater.");
      }
      if (incomeAmount.trim() && (parseAmountToMinor(incomeAmount, currency) <= 0 || !incomeDate || incomeDate > inDays(0))) {
        throw new Error("Enter a positive income amount and the date it was received, no later than today.");
      }
      setStep(2);
    } catch (err) { setError(errorMessage(err)); }
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const bills = obligations.filter((row) => row.name.trim() || row.amount.trim());
      for (const bill of bills) {
        if (!bill.name.trim() || !bill.amount.trim() || !bill.dueDate || parseAmountToMinor(bill.amount, currency) <= 0) {
          throw new Error("Complete the name, positive amount, and due date for each bill, or remove the row.");
        }
      }
      await post("/api/onboarding", {
        currency,
        objective,
        startingBalance: startingBalance || "0",
        obligations: bills,
        safetyBuffer: safetyBuffer || "0",
        riskPosture,
        income: incomeAmount.trim()
          ? { label: incomeLabel.trim() || "Paycheck", amount: incomeAmount, lastReceived: incomeDate, cadence: incomeCadence }
          : undefined,
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
        <LogoMark size={32} />
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted">LANDED setup · {defaultName}</p>
          <p className="text-[12px] text-cream">Step {step} of 2</p>
        </div>
      </div>

      <div className="mt-6 flex gap-1.5">
        <span className={`h-1 flex-1 rounded-full ${step >= 1 ? "bg-lime" : "bg-black/10"}`} />
        <span className={`h-1 flex-1 rounded-full ${step >= 2 ? "bg-lime" : "bg-black/10"}`} />
      </div>

      {step === 1 ? (
        <div className="animate-rise mt-10">
          <p className="text-[11px] uppercase tracking-[0.18em] text-lime">Your financial profile</p>
          <h1 className="mt-3 font-display text-[40px] leading-[1.05] text-cream sm:text-[48px]">Set your priorities</h1>
          <p className="mt-3 max-w-lg text-[13px] leading-6 text-muted">
            Add your balance, income, and safety buffer to build your first forecast. You choose which bills are essential in the next step. You can update these details later.
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
              <Field label={`Available balance (${currency})`}>
                <input className={inputClass} inputMode="decimal" placeholder="0.00" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} />
              </Field>
              <Field label={`Safety buffer (${currency})`}>
                <input className={inputClass} inputMode="decimal" placeholder="100.00" value={safetyBuffer} onChange={(e) => setSafetyBuffer(e.target.value)} />
              </Field>
            </div>
            <div className="rounded-xl border border-black/[0.08] bg-black/[0.02] p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Your income (optional)</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted/80">
                Your most recent paycheck lets LANDED forecast the next one. It is never counted as cash until it lands
                unless you choose to.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <Field label="Source">
                  <input className={inputClass} value={incomeLabel} onChange={(e) => setIncomeLabel(e.target.value)} maxLength={60} />
                </Field>
                <Field label="Amount received">
                  <input className={inputClass} inputMode="decimal" placeholder="3200.00" value={incomeAmount} onChange={(e) => setIncomeAmount(e.target.value)} />
                </Field>
                <Field label="Last received">
                  <input className={inputClass} type="date" value={incomeDate} max={inDays(0)} onChange={(e) => setIncomeDate(e.target.value)} />
                </Field>
                <Field label="How often">
                  <select className={selectClass} value={incomeCadence} onChange={(e) => setIncomeCadence(e.target.value as typeof incomeCadence)}>
                    <option value="monthly">Monthly</option>
                    <option value="biweekly">Every 2 weeks</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </Field>
              </div>
            </div>
            <Field label="Planning preference" hint="Cautious keeps a larger reserve. Flexible accepts more timing risk.">
              <select className={selectClass} value={riskPosture} onChange={(e) => setRiskPosture(e.target.value as typeof riskPosture)}>
                <option value="cautious">Cautious — prioritize reserves</option>
                <option value="balanced">Balanced — cover bills and goals</option>
                <option value="flexible">Flexible — prioritize your goal</option>
              </select>
            </Field>
          </div>

          {error ? <ErrorNote className="mt-6">{error}</ErrorNote> : null}

          <div className="mt-8 flex justify-end">
            <Button size="lg" onClick={nextStep} disabled={!objective.trim()}>
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="animate-rise mt-10">
          <p className="text-[11px] uppercase tracking-[0.18em] text-lime">Your upcoming bills</p>
          <h1 className="mt-3 font-display text-[40px] leading-[1.05] text-cream sm:text-[48px]">Add bills to protect</h1>
          <p className="mt-3 max-w-lg text-[13px] leading-6 text-muted">
            Add bills that must be covered. Only essential and important obligations reduce safe-to-move. You can add
            more, import a CSV, or connect a Sui wallet later.
          </p>

          <div className="mt-8 space-y-3">
            {obligations.map((row, index) => (
              <div key={index} className="grid gap-2 rounded-xl border border-black/[0.08] bg-black/[0.02] p-3 sm:grid-cols-[1.3fr_0.9fr_1fr_0.9fr_0.9fr_auto] sm:items-end">
                <Field label="Bill name">
                  <input className={inputClass} value={row.name} onChange={(e) => updateObligation(index, { name: e.target.value })} placeholder="Rent" />
                </Field>
                <Field label={`Amount (${currency})`}>
                  <input className={inputClass} inputMode="decimal" value={row.amount} onChange={(e) => updateObligation(index, { amount: e.target.value })} placeholder="1450.00" />
                </Field>
                <Field label="Due date">
                  <input className={inputClass} type="date" value={row.dueDate} onChange={(e) => updateObligation(index, { dueDate: e.target.value })} />
                </Field>
                <Field label="Priority">
                  <select className={selectClass} value={row.priority} onChange={(e) => updateObligation(index, { priority: e.target.value as Obligation["priority"] })}>
                    <option value="essential">Essential</option>
                    <option value="important">Important</option>
                    <option value="discretionary">Optional</option>
                  </select>
                </Field>
                <Field label="Repeats">
                  <select className={selectClass} value={row.recurrence} onChange={(e) => updateObligation(index, { recurrence: e.target.value as Obligation["recurrence"] })}>
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="yearly">Yearly</option>
                    <option value="none">Once</option>
                  </select>
                </Field>
                <Button variant="ghost" size="sm" className="mb-0.5" onClick={() => setObligations((rows) => rows.filter((_, i) => i !== index))} aria-label={`Remove ${row.name || `bill ${index + 1}`}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setObligations((rows) => [...rows, { name: "", amount: "", dueDate: inDays(15), priority: "important", recurrence: "monthly" }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add another bill
            </Button>
          </div>

          {error ? <ErrorNote className="mt-6">{error}</ErrorNote> : null}

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" disabled={loading} onClick={() => { setError(null); setStep(1); }}>Back</Button>
            <Button size="lg" onClick={submit} loading={loading}>
              Finish setup <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
