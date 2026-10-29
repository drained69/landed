"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2 } from "lucide-react";
import { apiFetch, errorMessage, post } from "@/lib/client";
import { Button, Card, CardHeader, ErrorNote, Field, inputClass, SuccessNote } from "@/components/ui";

/** Change password (signs out other devices) and permanently delete the account. */
export function AccountSecurity({ email, isDemo }: { email: string; isDemo: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [busy, setBusy] = useState<"password" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function changePassword() {
    setBusy("password"); setError(null); setNotice(null);
    try {
      const result = await post<{ note: string }>("/api/account/password", { currentPassword: current, newPassword: next });
      setNotice(result.note);
      setCurrent(""); setNext("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setBusy("delete"); setError(null); setNotice(null);
    try {
      const result = await apiFetch<{ note: string }>("/api/account", {
        method: "DELETE",
        body: JSON.stringify({ confirmEmail, password: deletePassword }),
      });
      window.alert(result.note);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  if (isDemo) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader title="Account" subtitle="This is the shared demo account. Create your own account to change a password or delete your data." />
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Account and security" subtitle={`Signed in as ${email}.`} right={<KeyRound className="h-4 w-4 text-muted" />} />
      <div className="grid gap-6 border-t border-black/[0.06] px-5 py-5 sm:px-6 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-[13px] text-cream">Change password</p>
          <Field label="Current password">
            <input className={inputClass} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="New password" hint="At least 8 characters. Every other device is signed out.">
            <input className={inputClass} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Button size="sm" onClick={changePassword} loading={busy === "password"} disabled={!current || next.length < 8}>Change password</Button>
        </div>

        <div className="space-y-3 rounded-xl border border-red/20 bg-red/[0.03] p-4">
          <p className="text-[13px] text-red">Delete account</p>
          <p className="text-[11.5px] leading-relaxed text-muted">
            Permanently deletes your accounts, transactions, decisions, outcomes, lessons and sessions here. Export
            your data first if you want a copy. Memories already written to Walrus stay there encrypted; no app can
            delete a Walrus blob.
          </p>
          <Field label={`Type ${email} to confirm`}>
            <input className={inputClass} value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Password">
            <input className={inputClass} type="password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
          </Field>
          <Button
            size="sm"
            variant="danger"
            onClick={deleteAccount}
            loading={busy === "delete"}
            disabled={confirmEmail.trim().toLowerCase() !== email.toLowerCase() || !deletePassword}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete my account
          </Button>
        </div>
      </div>
      {error || notice ? (
        <div className="border-t border-black/[0.06] px-5 py-3 sm:px-6">
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {notice ? <SuccessNote>{notice}</SuccessNote> : null}
        </div>
      ) : null}
    </Card>
  );
}
