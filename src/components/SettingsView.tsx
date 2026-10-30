"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CircleAlert, Database, Download, ExternalLink, Globe2, Landmark, Link2,
  Plus, RefreshCw, Route, Save, ShieldCheck, Trash2,
} from "lucide-react";
import { formatMinor } from "@/lib/money";
import { del, errorMessage, patch, post } from "@/lib/client";
import { Badge, Button, Card, CardHeader, ErrorNote, Field, inputClass, selectClass, Toggle } from "@/components/ui";
import { AccountSecurity } from "@/components/AccountSecurity";

type Account = { id: string; name: string; accountType: string; currency: string; balanceMinor: number; isLiquid: boolean; includeInSafeToMove: boolean; verificationStatus: string; balanceSource: string; isSynthetic: boolean; walletAddress: string | null; lastSyncedAt: string | Date | null };
type Commitment = { id: string; name: string; amountMinor: number; currency: string; dueDate: string | Date; recurrence: string; priority: string; status: string; isSynthetic: boolean };
type Goal = { id: string; name: string; targetMinor: number; currentMinor: number; currency: string; monthlyContributionMinor: number; priority: string; status: string; targetDate: string | Date | null };
type Quote = { id: string; sendAmountMinor: number; feeMinor: number; networkFeeMinor: number; expectedReceivedMinor: number; estimatedDeliveryHours: number; source: string; evidenceQuality: string; quotedAt: string | Date };
type RouteRow = { id: string; name: string; providerOrMethod: string; originCurrency: string; destinationCurrency: string; payoutMethod: string; routeType: string; isActive: boolean; isSynthetic: boolean; quotes: Quote[] };
type Integration = { configured: boolean; reachable: boolean; status: string; error: string | null; serverUrl?: string; network?: string; checkpoint?: string | null; missing?: string[]; accountId?: string | null; version?: string | null; writeReady?: boolean | null };
type Consent = { consentType: string; granted: boolean };

const currencies = ["USD", "EUR", "GBP", "PHP", "MXN", "INR", "NGN", "KES", "JPY"];

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function SettingsView({
  user, accounts, commitments, goals, routes, integrations, consents, memoryNamespace,
}: {
  user: { name: string; email: string; preferredCurrency: string; safetyBufferMinor: number; riskPosture: string; mainObjective: string | null; isDemo: boolean };
  accounts: Account[];
  commitments: Commitment[];
  goals: Goal[];
  routes: RouteRow[];
  integrations: {
    tatum: Integration; walrus: Integration; ai: { configured: boolean; note: string };
    rates: { configured: boolean; reachable: boolean; error: string | null; sample: { symbol: string; basePair: string; value: string; source: string; timestamp: string } | null };
  };
  consents: Consent[];
  memoryNamespace: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"profile" | "money" | "routes" | "integrations" | "data">("profile");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [name, setName] = useState(user.name);
  const [currency, setCurrency] = useState(user.preferredCurrency);
  const [safetyBuffer, setSafetyBuffer] = useState((user.safetyBufferMinor / 100).toFixed(2));
  const [riskPosture, setRiskPosture] = useState(user.riskPosture);
  const [objective, setObjective] = useState(user.mainObjective ?? "");

  const [balances, setBalances] = useState<Record<string, string>>(Object.fromEntries(accounts.map((a) => [a.id, (a.balanceMinor / 100).toFixed(2)])));
  const [newAccount, setNewAccount] = useState({ name: "", accountType: "bank", currency: user.preferredCurrency, balance: "", isLiquid: true });
  const [newBill, setNewBill] = useState({ name: "", amount: "", dueDate: todayPlus(7), recurrence: "none", priority: "essential" });
  const [newGoal, setNewGoal] = useState({ name: "", target: "", current: "0", monthly: "" });
  const [contributions, setContributions] = useState<Record<string, string>>({});
  const [newRoute, setNewRoute] = useState({ name: "", providerOrMethod: "", payoutMethod: "bank_deposit", routeType: "bank", description: "" });
  const [quoteForms, setQuoteForms] = useState<Record<string, { amount: string; fee: string; expectedReceived: string; hours: string; source: string }>>({});
  const [walletAddress, setWalletAddress] = useState("");
  const [walletLabel, setWalletLabel] = useState("Sui wallet");
  const [walletResult, setWalletResult] = useState<{ balances: { symbol: string; amountMinor: number; amountRaw: string }[]; transactions: { digest: string; status: string; explorerUrl: string }[] } | null>(null);
  const [consentState, setConsentState] = useState<Record<string, boolean>>(Object.fromEntries(consents.map((c) => [c.consentType, c.granted])));

  function updateQuote(routeId: string, patch: Partial<{ amount: string; fee: string; expectedReceived: string; hours: string; source: string }>) {
    setQuoteForms((prev) => {
      const existing: Partial<{ amount: string; fee: string; expectedReceived: string; hours: string; source: string }> = prev[routeId] ?? {};
      return {
        ...prev,
        [routeId]: { amount: "", fee: "", expectedReceived: "", hours: "24", source: "user_entered", ...existing, ...patch },
      };
    });
  }

  function flash(message: string) {
    setNotice(message);
    setError(null);
    router.refresh();
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key); setError(null); setNotice(null);
    try { await fn(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(null); }
  }

  async function saveProfile() {
    await run("profile", async () => {
      await patch("/api/settings", { name, currency, safetyBuffer, riskPosture, mainObjective: objective || null });
      flash("Profile and safety buffer updated.");
    });
  }

  async function saveAccount(account: Account) {
    await run(account.id, async () => {
      await patch(`/api/accounts/${account.id}`, { balance: balances[account.id] });
      flash(`${account.name} balance updated to ${balances[account.id]} ${account.currency}.`);
    });
  }

  async function toggleAccount(account: Account, field: "isLiquid" | "includeInSafeToMove", value: boolean) {
    await run(account.id, async () => {
      await patch(`/api/accounts/${account.id}`, { [field]: value });
      flash(`${account.name} updated.`);
    });
  }

  async function addAccount() {
    await run("account-add", async () => {
      await post("/api/accounts", newAccount);
      setNewAccount({ name: "", accountType: "bank", currency, balance: "", isLiquid: true });
      flash("Account added as a self-reported balance.");
    });
  }

  async function removeAccount(account: Account) {
    if (!window.confirm(`Delete ${account.name}? Its transactions remain but lose the account link.`)) return;
    await run(account.id, async () => {
      await del(`/api/accounts/${account.id}`);
      flash("Account deleted.");
    });
  }

  async function addBill() {
    await run("bill-add", async () => {
      await post("/api/commitments", { ...newBill, currency });
      setNewBill({ name: "", amount: "", dueDate: todayPlus(7), recurrence: "none", priority: "essential" });
      flash("Commitment added. It now reduces safe-to-move until paid.");
    });
  }

  async function payBill(bill: Commitment) {
    await run(bill.id, async () => {
      await post(`/api/commitments/${bill.id}`, {});
      flash(`${bill.name} marked paid. A posted transaction was recorded; the account balance was not auto-adjusted.`);
    });
  }

  async function removeBill(bill: Commitment) {
    if (!window.confirm(`Delete ${bill.name}?`)) return;
    await run(bill.id, async () => {
      await del(`/api/commitments/${bill.id}`);
      flash("Commitment deleted.");
    });
  }

  async function addGoal() {
    await run("goal-add", async () => {
      await post("/api/savings-goals", { name: newGoal.name, target: newGoal.target, current: newGoal.current, currency, monthlyContribution: newGoal.monthly, priority: "important" });
      setNewGoal({ name: "", target: "", current: "0", monthly: "" });
      flash("Savings goal added.");
    });
  }

  async function contribute(goal: Goal) {
    const amount = contributions[goal.id];
    await run(goal.id, async () => {
      await post(`/api/savings-goals/${goal.id}`, { amount });
      setContributions((prev) => ({ ...prev, [goal.id]: "" }));
      flash(`Contribution recorded for ${goal.name}.`);
    });
  }

  async function removeGoal(goal: Goal) {
    if (!window.confirm(`Delete ${goal.name}?`)) return;
    await run(goal.id, async () => {
      await del(`/api/savings-goals/${goal.id}`);
      flash("Savings goal deleted.");
    });
  }

  async function addRoute() {
    await run("route-add", async () => {
      await post("/api/routes", { ...newRoute, originCurrency: currency, destinationCurrency: currency });
      setNewRoute({ name: "", providerOrMethod: "", payoutMethod: "bank_deposit", routeType: "bank", description: "" });
      flash("Route added. Add a user-entered quote so it can appear in rankings.");
    });
  }

  async function toggleRoute(route: RouteRow) {
    await run(route.id, async () => {
      await patch(`/api/routes/${route.id}/quotes`, { isActive: !route.isActive });
      flash(`${route.name} ${route.isActive ? "paused" : "activated"}.`);
    });
  }

  async function addQuote(route: RouteRow) {
    const form = quoteForms[route.id];
    if (!form) return;
    await run(`quote-${route.id}`, async () => {
      await post(`/api/routes/${route.id}/quotes`, {
        sendAmount: form.amount,
        fee: form.fee || "0",
        networkFee: "0",
        expectedReceived: form.expectedReceived || undefined,
        estimatedDeliveryHours: form.hours || "24",
        source: form.source,
      });
      setQuoteForms((prev) => ({ ...prev, [route.id]: { amount: "", fee: "", expectedReceived: "", hours: "24", source: "user_entered" } }));
      flash(`Quote added to ${route.name}.`);
    });
  }

  async function lookupWallet() {
    await run("wallet", async () => {
      const response = await fetch(`/api/tatum/wallet?address=${encodeURIComponent(walletAddress)}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Tatum read failed");
      setWalletResult(json);
      flash("Wallet balances returned by Tatum (Sui Mainnet).");
    });
  }

  async function syncWallet() {
    await run("wallet-sync", async () => {
      const result = await post<{ accountsUpdated: number; transactionsImported: number }>("/api/tatum/wallet", { address: walletAddress, label: walletLabel });
      flash(`Tatum sync complete: ${result.accountsUpdated} balances, ${result.transactionsImported} transactions. Onchain settlement is not recipient payout proof.`);
    });
  }

  async function toggleConsent(type: string, granted: boolean) {
    await run(type, async () => {
      const result = await post<{ note: string }>("/api/consents", { consentType: type, granted });
      setConsentState((prev) => ({ ...prev, [type]: granted }));
      flash(result.note);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted/80">Your controls</p>
        <h1 className="mt-1.5 font-display text-[32px] leading-tight text-cream sm:text-[38px]">Nothing hidden.</h1>
        <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted">
          Edit every input LANDED uses, inspect integration status, replace synthetic quotes with your own, and export
          the complete record. Missing credentials are shown as blocked, not simulated.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-black/[0.07]">
        {([
          ["profile", "Profile & safety"],
          ["money", "Money"],
          ["routes", "Routes & quotes"],
          ["integrations", "Integrations"],
          ["data", "Data & consent"],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`border-b-2 px-3 py-2.5 text-[11.5px] transition ${tab === key ? "border-lime text-cream" : "border-transparent text-muted hover:text-cream"}`}>{label}</button>
        ))}
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {notice ? <div className="rounded-xl border border-lime/25 bg-lime/[0.06] px-3.5 py-2.5 text-[11px] leading-relaxed text-lime">{notice}</div> : null}

      {tab === "profile" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Profile" subtitle="The base currency and buffer feed every decision." right={<Save className="h-4 w-4 text-muted" />} />
            <div className="space-y-4 border-t border-black/[0.06] px-5 py-4">
              <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Email"><input className={inputClass} value={user.email} disabled /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Base currency">
                  <select className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>{currencies.map((c) => <option key={c}>{c}</option>)}</select>
                </Field>
                <Field label="Safety buffer" hint="Protected from every recommendation."><input className={inputClass} inputMode="decimal" value={safetyBuffer} onChange={(e) => setSafetyBuffer(e.target.value)} /></Field>
              </div>
              <Field label="Risk posture">
                <select className={selectClass} value={riskPosture} onChange={(e) => setRiskPosture(e.target.value)}>
                  <option value="cautious">Cautious — protect first</option>
                  <option value="balanced">Balanced</option>
                  <option value="flexible">Flexible — optimize for the goal</option>
                </select>
              </Field>
              <Field label="Main objective"><textarea className={`${inputClass} h-20 py-2`} value={objective} onChange={(e) => setObjective(e.target.value)} maxLength={200} /></Field>
              <Button onClick={saveProfile} loading={busy === "profile"}>Save profile</Button>
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Honesty state" subtitle="What is real on this deployment right now." />
              <div className="space-y-3 border-t border-black/[0.06] px-5 py-4">
                <div className="flex items-center justify-between text-[11px]"><span className="text-muted">Dataset</span><Badge tone={user.isDemo ? "amber" : "lime"}>{user.isDemo ? "Synthetic demo" : "Your records"}</Badge></div>
                <div className="flex items-center justify-between text-[11px]"><span className="text-muted">Tatum Sui</span><Badge tone={integrations.tatum.configured ? "lime" : "amber"}>{integrations.tatum.configured ? (integrations.tatum.reachable ? "reachable" : "configured · error") : "not configured"}</Badge></div>
                <div className="flex items-center justify-between text-[11px]"><span className="text-muted">Walrus Memory</span><Badge tone={integrations.walrus.configured ? "lime" : "amber"}>{integrations.walrus.configured ? (integrations.walrus.reachable ? "reachable" : "configured · error") : "not configured"}</Badge></div>
                <div className="flex items-center justify-between text-[11px]"><span className="text-muted">AI explanation layer</span><Badge tone={integrations.ai.configured ? "lime" : "muted"}>{integrations.ai.configured ? "configured" : "off"}</Badge></div>
                <p className="border-t border-black/[0.07] pt-3 text-[9.5px] leading-relaxed text-muted/70">Arithmetic never depends on the AI layer. Disabling it changes explanations, not decisions.</p>
              </div>
            </Card>

            <Card>
              <CardHeader title="Memory namespace" subtitle="Derived server-side from your sign-in email (hashed), so your memory follows you to any device. Never accepted from a request." />
              <div className="border-t border-black/[0.06] px-5 py-4">
                <p className="break-all rounded-lg bg-black/[0.04] p-2.5 font-mono text-[10px] text-lime/70">{memoryNamespace}</p>
                <p className="mt-2 text-[9.5px] leading-relaxed text-muted/70">The database remains LANDED&apos;s authorization boundary. A Walrus delegate key can read the namespace; it cannot bypass ownership checks here.</p>
              </div>
            </Card>
          </div>
          <AccountSecurity email={user.email} isDemo={user.isDemo} />
        </div>
      ) : null}

      {tab === "money" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Accounts" subtitle="Balances are authoritative. A recorded transaction does not silently adjust them." right={<Badge tone="muted">{accounts.length}</Badge>} />
            <div className="divide-y divide-black/[0.06] border-t border-black/[0.06]">
              {accounts.map((account) => (
                <div key={account.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {account.isSynthetic ? <Badge tone="amber">synthetic</Badge> : null}
                    <span className="text-[12px] text-cream">{account.name}</span>
                    <span className="text-[9.5px] text-muted">{account.accountType} · {account.currency} · {account.verificationStatus.replaceAll("_", " ")}</span>
                    {account.lastSyncedAt ? <span className="text-[9px] text-lime/60">synced {new Date(account.lastSyncedAt).toLocaleDateString()}</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <div className="w-40">
                      <Field label="Balance"><input className={`${inputClass} h-9`} inputMode="decimal" value={balances[account.id] ?? ""} onChange={(e) => setBalances((prev) => ({ ...prev, [account.id]: e.target.value }))} /></Field>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => saveAccount(account)} loading={busy === account.id}>Save</Button>
                    <label className="flex items-center gap-1.5 text-[10px] text-muted"><input type="checkbox" checked={account.isLiquid} onChange={(e) => toggleAccount(account, "isLiquid", e.target.checked)} className="accent-[#2e7d4f]" /> Liquid</label>
                    <label className="flex items-center gap-1.5 text-[10px] text-muted"><input type="checkbox" checked={account.includeInSafeToMove} onChange={(e) => toggleAccount(account, "includeInSafeToMove", e.target.checked)} className="accent-[#2e7d4f]" /> In safe-to-move</label>
                    <button type="button" onClick={() => removeAccount(account)} className="ml-auto text-muted transition hover:text-red" aria-label={`Delete ${account.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-black/[0.06] px-5 py-4">
              <p className="text-[10px] uppercase tracking-[0.11em] text-muted">Add an account</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-5">
                <input className={`${inputClass} h-9`} placeholder="Name" value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} />
                <select className={`${inputClass} h-9`} value={newAccount.accountType} onChange={(e) => setNewAccount({ ...newAccount, accountType: e.target.value })}>
                  {["bank", "cash", "wallet", "stablecoin", "savings"].map((t) => <option key={t}>{t}</option>)}
                </select>
                <input className={`${inputClass} h-9`} placeholder="0.00" inputMode="decimal" value={newAccount.balance} onChange={(e) => setNewAccount({ ...newAccount, balance: e.target.value })} />
                <select className={`${inputClass} h-9`} value={newAccount.currency} onChange={(e) => setNewAccount({ ...newAccount, currency: e.target.value })}>{currencies.map((c) => <option key={c}>{c}</option>)}</select>
                <Button size="sm" onClick={addAccount} loading={busy === "account-add"} disabled={!newAccount.name || !newAccount.balance}><Plus className="h-3 w-3" /> Add</Button>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Bills & commitments" subtitle="Essential and important obligations reduce safe-to-move." right={<Badge tone="muted">{commitments.length}</Badge>} />
              <div className="max-h-[380px] divide-y divide-black/[0.06] overflow-y-auto border-t border-black/[0.06]">
                {commitments.map((bill) => (
                  <div key={bill.id} className="flex items-center gap-2 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] text-cream">{bill.name} {bill.isSynthetic ? <span className="text-[8.5px] text-amber/60">synthetic</span> : null}</p>
                      <p className="text-[9.5px] text-muted">{new Date(bill.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {bill.priority} · {bill.status}</p>
                    </div>
                    <span className="text-[11.5px] tabular-nums text-cream/85">{formatMinor(bill.amountMinor, bill.currency)}</span>
                    {bill.status === "upcoming" ? <Button size="sm" variant="secondary" onClick={() => payBill(bill)} loading={busy === bill.id}>Paid</Button> : null}
                    <button type="button" onClick={() => removeBill(bill)} className="text-muted transition hover:text-red" aria-label={`Delete ${bill.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="border-t border-black/[0.06] px-5 py-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className={`${inputClass} h-9`} placeholder="Bill name" value={newBill.name} onChange={(e) => setNewBill({ ...newBill, name: e.target.value })} />
                  <input className={`${inputClass} h-9`} placeholder="Amount" inputMode="decimal" value={newBill.amount} onChange={(e) => setNewBill({ ...newBill, amount: e.target.value })} />
                  <input className={`${inputClass} h-9`} type="date" value={newBill.dueDate} onChange={(e) => setNewBill({ ...newBill, dueDate: e.target.value })} />
                  <select className={`${inputClass} h-9`} value={newBill.priority} onChange={(e) => setNewBill({ ...newBill, priority: e.target.value })}>
                    <option value="essential">Essential</option><option value="important">Important</option><option value="discretionary">Optional</option>
                  </select>
                  <select className={`${inputClass} h-9`} value={newBill.recurrence} onChange={(e) => setNewBill({ ...newBill, recurrence: e.target.value })}>
                    <option value="none">One time</option><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="yearly">Yearly</option>
                  </select>
                  <Button size="sm" onClick={addBill} loading={busy === "bill-add"} disabled={!newBill.name || !newBill.amount}><Plus className="h-3 w-3" /> Add bill</Button>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Savings goals" subtitle="Monthly contributions are reserved in the 45-day simulation." right={<Badge tone="muted">{goals.length}</Badge>} />
              <div className="divide-y divide-black/[0.06] border-t border-black/[0.06]">
                {goals.map((goal) => (
                  <div key={goal.id} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-[11.5px] text-cream">{goal.name}</p>
                      <span className="text-[9.5px] text-muted">{formatMinor(goal.currentMinor, goal.currency)} / {formatMinor(goal.targetMinor, goal.currency)}</span>
                      <button type="button" onClick={() => removeGoal(goal)} className="text-muted transition hover:text-red" aria-label={`Delete ${goal.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/[0.06]"><div className="h-full bg-lime" style={{ width: `${Math.min(100, (goal.currentMinor / Math.max(1, goal.targetMinor)) * 100)}%` }} /></div>
                    <div className="mt-2 flex items-center gap-2">
                      <input className={`${inputClass} h-8 w-28 text-[11px]`} placeholder="Contribute" inputMode="decimal" value={contributions[goal.id] ?? ""} onChange={(e) => setContributions((prev) => ({ ...prev, [goal.id]: e.target.value }))} />
                      <Button size="sm" variant="secondary" onClick={() => contribute(goal)} loading={busy === goal.id} disabled={!contributions[goal.id]}>Contribute</Button>
                      <span className="text-[9px] text-muted">+{formatMinor(goal.monthlyContributionMinor, goal.currency)}/mo</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-black/[0.06] px-5 py-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className={`${inputClass} h-9`} placeholder="Goal name" value={newGoal.name} onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })} />
                  <input className={`${inputClass} h-9`} placeholder="Target" inputMode="decimal" value={newGoal.target} onChange={(e) => setNewGoal({ ...newGoal, target: e.target.value })} />
                  <input className={`${inputClass} h-9`} placeholder="Current" inputMode="decimal" value={newGoal.current} onChange={(e) => setNewGoal({ ...newGoal, current: e.target.value })} />
                  <input className={`${inputClass} h-9`} placeholder="Monthly" inputMode="decimal" value={newGoal.monthly} onChange={(e) => setNewGoal({ ...newGoal, monthly: e.target.value })} />
                </div>
                <Button size="sm" className="mt-2" onClick={addGoal} loading={busy === "goal-add"} disabled={!newGoal.name || !newGoal.target}><Plus className="h-3 w-3" /> Add goal</Button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "routes" ? (
        <div className="space-y-4">
          {routes.map((route) => (
            <Card key={route.id}>
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Route className="h-3.5 w-3.5 text-lime" />
                    <p className="text-[12.5px] text-cream">{route.name}</p>
                    {route.isSynthetic ? <Badge tone="amber">synthetic</Badge> : null}
                    {!route.isActive ? <Badge tone="muted">paused</Badge> : null}
                  </div>
                  <p className="mt-1 text-[10px] text-muted">{route.providerOrMethod} · {route.originCurrency}→{route.destinationCurrency} · {route.payoutMethod.replaceAll("_", " ")}</p>
                </div>
                <Button size="sm" variant={route.isActive ? "secondary" : "outline"} onClick={() => toggleRoute(route)} loading={busy === route.id}>{route.isActive ? "Pause route" : "Activate route"}</Button>
              </div>
              {route.quotes.length > 0 ? (
                <div className="border-t border-black/[0.06] px-5 py-3">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-muted">Recent quotes</p>
                  <div className="mt-2 space-y-1.5">
                    {route.quotes.map((quote) => (
                      <div key={quote.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted">
                        <span>Send {formatMinor(quote.sendAmountMinor, route.originCurrency)}</span>
                        <span>Fee {formatMinor(quote.feeMinor + quote.networkFeeMinor, route.originCurrency)}</span>
                        <span className="text-cream/80">Receive {formatMinor(quote.expectedReceivedMinor, route.destinationCurrency)}</span>
                        <span>{quote.estimatedDeliveryHours}h</span>
                        <span className="text-muted/50">{quote.source} · {quote.evidenceQuality.replaceAll("_", " ")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="border-t border-black/[0.06] px-5 py-3 text-[10px] text-amber/70">No quote yet. This route is ignored by ranking until you add one.</p>}
              <div className="border-t border-black/[0.06] px-5 py-3">
                <div className="grid gap-2 sm:grid-cols-6">
                  <input className={`${inputClass} h-9`} placeholder="Send" inputMode="decimal" value={quoteForms[route.id]?.amount ?? ""} onChange={(e) => updateQuote(route.id, { amount: e.target.value })} />
                  <input className={`${inputClass} h-9`} placeholder="Fee" inputMode="decimal" value={quoteForms[route.id]?.fee ?? ""} onChange={(e) => updateQuote(route.id, { fee: e.target.value })} />
                  <input className={`${inputClass} h-9`} placeholder="Expected" inputMode="decimal" value={quoteForms[route.id]?.expectedReceived ?? ""} onChange={(e) => updateQuote(route.id, { expectedReceived: e.target.value })} />
                  <input className={`${inputClass} h-9`} placeholder="Hours" inputMode="numeric" value={quoteForms[route.id]?.hours ?? ""} onChange={(e) => updateQuote(route.id, { hours: e.target.value })} />
                  <select className={`${inputClass} h-9`} value={quoteForms[route.id]?.source ?? "user_entered"} onChange={(e) => updateQuote(route.id, { source: e.target.value })}>
                    <option value="user_entered">User quote</option><option value="provider_api">Provider</option><option value="demo">Demo</option>
                  </select>
                  <Button size="sm" variant="secondary" onClick={() => addQuote(route)} loading={busy === `quote-${route.id}`} disabled={!quoteForms[route.id]?.amount}><Plus className="h-3 w-3" /> Quote</Button>
                </div>
              </div>
            </Card>
          ))}
          <Card>
            <CardHeader title="Add a route" subtitle="Add the provider or method, then enter your own quote. LANDED does not invent live prices." />
            <div className="grid gap-2 border-t border-black/[0.06] px-5 py-4 sm:grid-cols-4">
              <input className={`${inputClass} h-9`} placeholder="Name" value={newRoute.name} onChange={(e) => setNewRoute({ ...newRoute, name: e.target.value })} />
              <input className={`${inputClass} h-9`} placeholder="Provider or method" value={newRoute.providerOrMethod} onChange={(e) => setNewRoute({ ...newRoute, providerOrMethod: e.target.value })} />
              <select className={`${inputClass} h-9`} value={newRoute.payoutMethod} onChange={(e) => setNewRoute({ ...newRoute, payoutMethod: e.target.value })}>
                {["bank_deposit", "wallet", "cash_pickup", "mobile_money", "instant"].map((m) => <option key={m} value={m}>{m.replaceAll("_", " ")}</option>)}
              </select>
              <select className={`${inputClass} h-9`} value={newRoute.routeType} onChange={(e) => setNewRoute({ ...newRoute, routeType: e.target.value })}>
                {["bank", "remittance", "onchain", "mobile_money", "cash"].map((m) => <option key={m} value={m}>{m.replaceAll("_", " ")}</option>)}
              </select>
              <input className={`${inputClass} h-9 sm:col-span-3`} placeholder="Description (optional)" value={newRoute.description} onChange={(e) => setNewRoute({ ...newRoute, description: e.target.value })} />
              <Button size="sm" onClick={addRoute} loading={busy === "route-add"} disabled={!newRoute.name || !newRoute.providerOrMethod}><Plus className="h-3 w-3" /> Add route</Button>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "integrations" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Tatum · Sui Mainnet" subtitle="Verified onchain reads only. No public-RPC substitution." right={<Landmark className="h-4 w-4 text-muted" />} />
            <div className="space-y-3 border-t border-black/[0.06] px-5 py-4">
              <div className="flex items-center justify-between text-[11px]"><span className="text-muted">API key</span><Badge tone={integrations.tatum.configured ? "lime" : "amber"}>{integrations.tatum.configured ? "configured" : "missing"}</Badge></div>
              <div className="flex items-center justify-between text-[11px]"><span className="text-muted">RPC reachable</span><span className={integrations.tatum.reachable ? "text-lime" : "text-amber"}>{integrations.tatum.reachable ? "yes" : "no"}</span></div>
              <div className="flex items-center justify-between text-[11px]"><span className="text-muted">Network</span><span className="text-cream/80">{integrations.tatum.network ?? "mainnet"}</span></div>
              <div className="flex items-center justify-between gap-4 text-[11px]"><span className="text-muted">Checkpoint</span><span className="truncate font-mono text-[9.5px] text-cream/70">{integrations.tatum.checkpoint ?? "—"}</span></div>
              {integrations.tatum.error ? <p className="rounded-lg bg-amber/[0.05] px-3 py-2 text-[10px] leading-relaxed text-amber/85">{integrations.tatum.error}</p> : null}
              <div className="space-y-2 border-t border-black/[0.07] pt-3">
                <Field label="Sui wallet address"><input className={inputClass} value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="0x… 64 hex characters" /></Field>
                <div className="flex gap-2">
                  <input className={inputClass} value={walletLabel} onChange={(e) => setWalletLabel(e.target.value)} placeholder="Label" />
                  <Button size="sm" variant="secondary" onClick={lookupWallet} loading={busy === "wallet"} disabled={!walletAddress}><RefreshCw className="h-3 w-3" /> Test read</Button>
                  <Button size="sm" onClick={syncWallet} loading={busy === "wallet-sync"} disabled={!walletAddress}><Link2 className="h-3 w-3" /> Sync</Button>
                </div>
              </div>
              <div className="space-y-2 border-t border-black/[0.07] pt-3">
                <div className="flex items-center justify-between text-[11px]"><span className="text-muted">Data API · exchange rates</span><Badge tone={integrations.rates.reachable ? "lime" : "amber"}>{integrations.rates.configured ? (integrations.rates.reachable ? "reachable" : "error") : "not configured"}</Badge></div>
                {integrations.rates.sample ? (
                  <p className="text-[10.5px] text-cream/80">1 {integrations.rates.sample.symbol} = {integrations.rates.sample.value} {integrations.rates.sample.basePair} <span className="text-muted">· {integrations.rates.sample.source} · {new Date(integrations.rates.sample.timestamp).toLocaleString("en-US")}</span></p>
                ) : null}
                <p className="text-[10px] leading-relaxed text-muted/80">Used to value SUI and stablecoin balances and to show Sui gas in USD. Converted values are shown for reference and never added to safe-to-move.{integrations.rates.error ? ` ${integrations.rates.error}` : ""}</p>
              </div>
              {walletResult ? (
                <div className="rounded-xl border border-lime/20 bg-lime/[0.04] p-3">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-lime">Tatum returned</p>
                  {walletResult.balances.length === 0 ? <p className="mt-1 text-[10px] text-muted">No known balances.</p> : null}
                  {walletResult.balances.map((balance) => <p key={balance.symbol} className="mt-1 text-[10.5px] text-cream/80">{balance.symbol}: {formatMinor(balance.amountMinor, balance.symbol)} <span className="text-muted/50">({balance.amountRaw} base units)</span></p>)}
                  {walletResult.transactions.slice(0, 3).map((tx) => <a key={tx.digest} href={tx.explorerUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-[9px] text-sky/80">{tx.digest.slice(0, 16)}… <ExternalLink className="h-2.5 w-2.5" /></a>)}
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Walrus Memory" subtitle="Lessons become persistent only when a blob ID is returned." right={<Database className="h-4 w-4 text-muted" />} />
            <div className="space-y-3 border-t border-black/[0.06] px-5 py-4">
              <div className="flex items-center justify-between text-[11px]"><span className="text-muted">Credentials</span><Badge tone={integrations.walrus.configured ? "lime" : "amber"}>{integrations.walrus.configured ? "configured" : "missing"}</Badge></div>
              <div className="flex items-center justify-between text-[11px]"><span className="text-muted">Relayer</span><span className={integrations.walrus.reachable ? "text-lime" : "text-amber"}>{integrations.walrus.reachable ? "reachable" : "not reachable"}</span></div>
              <div className="flex items-center justify-between text-[11px]"><span className="text-muted">Write ready</span><span className="text-cream/80">{integrations.walrus.writeReady == null ? "unknown" : integrations.walrus.writeReady ? "yes" : "no"}</span></div>
              <div className="flex items-center justify-between gap-4 text-[11px]"><span className="text-muted">Server</span><span className="truncate font-mono text-[9.5px] text-cream/70">{integrations.walrus.serverUrl}</span></div>
              {integrations.walrus.missing?.length ? <p className="rounded-lg bg-amber/[0.05] px-3 py-2 text-[10px] leading-relaxed text-amber/85">Missing server env: {integrations.walrus.missing.join(", ")}. Lessons remain in the local rehearsal ledger and are labelled as such.</p> : null}
              {integrations.walrus.error ? <p className="rounded-lg bg-amber/[0.05] px-3 py-2 text-[10px] leading-relaxed text-amber/85">{integrations.walrus.error}</p> : null}
              <div className="rounded-lg bg-black/[0.02] p-3">
                <p className="text-[9px] uppercase tracking-[0.1em] text-muted">Your namespace</p>
                <p className="mt-1 break-all font-mono text-[9.5px] text-lime/70">{memoryNamespace}</p>
              </div>
              <Link href="/app/learning" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-lime/25 px-3.5 text-[11px] text-lime transition hover:bg-lime/[0.08]">Open memory ledger <ShieldCheck className="h-3 w-3" /></Link>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Optional AI explanation layer" subtitle={integrations.ai.note} />
            <div className="border-t border-black/[0.06] px-5 py-4">
              <div className="flex items-center gap-3">
                <Badge tone={integrations.ai.configured ? "lime" : "muted"}>{integrations.ai.configured ? "configured" : "disabled"}</Badge>
                <p className="text-[10px] leading-relaxed text-muted">Set AI_BASE_URL, AI_API_KEY, and AI_MODEL on the server to enable plain-language explanations. It never computes amounts, ranks routes, or writes memory.</p>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "data" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Export everything" subtitle="JSON with accounts, transactions, bills, goals, routes, decisions, outcomes, memories, and consents." right={<Download className="h-4 w-4 text-muted" />} />
            <div className="border-t border-black/[0.06] px-5 py-4">
              <a href="/api/export" className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[12px] font-medium text-white transition hover:bg-black/80"><Download className="h-3.5 w-3.5" /> Download JSON</a>
              <p className="mt-3 text-[9.5px] leading-relaxed text-muted/70">Walrus blobs already written cannot be deleted by this application. The export notes this explicitly.</p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Consent" subtitle="Opt in to community route statistics. Nothing is shared without this." right={<Globe2 className="h-4 w-4 text-muted" />} />
            <div className="divide-y divide-black/[0.06] border-t border-black/[0.06] px-5">
              <Toggle checked={consentState.community_route_intelligence ?? false} onChange={(next) => toggleConsent("community_route_intelligence", next)} disabled={busy === "community_route_intelligence"} label="Community route intelligence" description="De-identified cost and delivery error only. Minimum 3 contributors and 5 observations." />
              <Toggle checked={consentState.anonymous_research ?? false} onChange={(next) => toggleConsent("anonymous_research", next)} disabled={busy === "anonymous_research"} label="Anonymous research" description="Aggregated pattern research. No individual records." />
              <Toggle checked={consentState.product_updates ?? false} onChange={(next) => toggleConsent("product_updates", next)} disabled={busy === "product_updates"} label="Product updates" description="Occasional product email. No financial data." />
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Data boundaries" subtitle="A plain-language summary of what this deployment stores." />
            <div className="grid gap-3 border-t border-black/[0.06] px-5 py-4 sm:grid-cols-3">
              {[
                ["Server database", "Owns authorization and the authoritative typed rules. Every query is filtered by your user ID."],
                ["Walrus Memory", "Stores confirmed lessons, their updates and (if you opt in) your decision journal in your account's namespace. Blobs are encrypted by Walrus Memory and permanent: no app can delete them."],
                ["No bank connection", "Balances are self-reported, CSV-imported, or verified onchain. Nothing is pulled from a bank without an explicit integration."],
              ].map(([title, body]) => (
                <div key={title} className="rounded-xl border border-black/[0.07] bg-black/[0.015] p-3.5">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted"><CircleAlert className="h-3 w-3" /> {title}</p>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-muted">{body}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
