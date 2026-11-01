"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Plus } from "lucide-react";
import { errorMessage, post } from "@/lib/client";
import { Button, Card, CardHeader, ErrorNote, Field, inputClass, selectClass, SuccessNote } from "@/components/ui";

const CATEGORIES = [
  ["income", "Income"], ["housing", "Housing"], ["utilities", "Utilities"], ["food", "Groceries"], ["dining", "Dining"],
  ["transport", "Transport"], ["subscriptions", "Subscriptions"], ["shopping", "Shopping"], ["entertainment", "Entertainment"],
  ["health", "Health"], ["transfer", "Transfer"], ["uncategorized", "Other"],
] as const;

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Add one transaction or import a CSV. The data Spend Watch and the forecasts learn from. */
export function TransactionTools({ currency, accounts }: { currency: string; accounts: { id: string; name: string; currency: string }[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"add" | "import" | null>(null);
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("food");
  const [accountId, setAccountId] = useState(accounts.find((a) => a.currency === currency)?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const transactionCurrency = accounts.find((account) => account.id === accountId)?.currency ?? currency;

  async function addTransaction() {
    setBusy(true); setError(null); setNotice(null);
    try {
      await post("/api/transactions", {
        amount, currency: transactionCurrency, direction, date, merchant: merchant.trim() || null,
        category: direction === "in" && category === "food" ? "income" : category,
        accountId: accountId || null,
      });
      setNotice(`Added ${direction === "in" ? "income" : "spending"} of ${amount} ${transactionCurrency}. Update the account balance in Settings to keep your forecast current.`);
      setAmount(""); setMerchant("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function importCsv() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Choose a CSV file first."); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (accountId) form.append("accountId", accountId);
      const response = await fetch("/api/transactions/import", { method: "POST", body: form, credentials: "same-origin" });
      const json = (await response.json()) as { imported?: number; skipped?: number; rows?: number; error?: string };
      if (!response.ok) throw new Error(json.error ?? "Import failed");
      setNotice(`Imported ${json.imported} of ${json.rows} rows${json.skipped ? ` (${json.skipped} skipped as duplicates or unreadable)` : ""}.`);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Add transactions"
        subtitle="Add transactions manually or import a CSV to improve spending insights and forecasts."
        right={
          <div className="flex gap-2">
            <Button size="sm" variant={mode === "add" ? "primary" : "outline"} onClick={() => setMode(mode === "add" ? null : "add")}><Plus className="h-3.5 w-3.5" /> Add</Button>
            <Button size="sm" variant={mode === "import" ? "primary" : "outline"} onClick={() => setMode(mode === "import" ? null : "import")}><FileUp className="h-3.5 w-3.5" /> Import CSV</Button>
          </div>
        }
      />
      {mode ? (
        <div className="space-y-3 border-t border-black/[0.06] px-5 py-4 sm:px-6">
          {accounts.length > 0 ? (
            <Field label="Account">
              <select className={selectClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">No account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
              </select>
            </Field>
          ) : null}
          {mode === "add" ? (
            <div className="grid gap-3 sm:grid-cols-5">
              <Field label="Type">
                <select className={selectClass} value={direction} onChange={(e) => { const next = e.target.value as "in" | "out"; setDirection(next); setCategory(next === "in" ? "income" : "food"); }}>
                  <option value="out">Spending</option>
                  <option value="in">Income</option>
                </select>
              </Field>
              <Field label={`Amount (${transactionCurrency})`}>
                <input className={inputClass} inputMode="decimal" placeholder="24.50" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Date">
                <input className={inputClass} type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Merchant or source">
                <input className={inputClass} placeholder="Corner Grocer" maxLength={120} value={merchant} onChange={(e) => setMerchant(e.target.value)} />
              </Field>
              <Field label="Category">
                <select className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-5">
                <Button onClick={addTransaction} loading={busy} disabled={!amount.trim()}>Add transaction</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <input aria-label="Transaction CSV file" ref={fileRef} type="file" accept=".csv,text/csv" className="block w-full text-[12px] text-muted file:mr-3 file:rounded-full file:border-0 file:bg-black/[0.05] file:px-3 file:py-1.5 file:text-cream" />
              <p className="text-[11px] leading-relaxed text-muted">
                Columns: <span className="font-mono text-cream/80">date, amount, description</span>, optionally <span className="font-mono text-cream/80">merchant, category, direction, currency</span>.
                Negative amounts are spending. Categories are inferred when missing. Matching duplicate rows are skipped. Account balances are not updated by an import.
              </p>
              <Button onClick={importCsv} loading={busy}><FileUp className="h-3.5 w-3.5" /> Import</Button>
            </div>
          )}
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {notice ? <SuccessNote>{notice}</SuccessNote> : null}
        </div>
      ) : null}
    </Card>
  );
}
