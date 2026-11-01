"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, LockKeyhole, Mail, User } from "lucide-react";
import { post, errorMessage } from "@/lib/client";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";
import { DemoButton } from "@/components/DemoButton";
import { Logo } from "@/components/Logo";

export function AuthForm({ initialMode }: { initialMode: "signin" | "signup" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "signin") {
        const result = await post<{ next: string }>("/api/auth/login", { email, password });
        router.push(result.next ?? "/app");
      } else {
        const result = await post<{ next: string }>("/api/auth/signup", { name, email, password, currency: "USD" });
        router.push(result.next ?? "/onboarding");
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <aside className="sky relative m-3 hidden overflow-hidden rounded-[36px] p-10 lg:flex lg:flex-col lg:justify-between">
        <span className="cloud left-[12%] top-[24%] h-14 w-48" />
        <span className="cloud right-[10%] top-[58%] h-16 w-56" />
        <Link href="/" className="relative flex items-center gap-2.5">
          <Logo size={28} />
        </Link>
        <div className="relative max-w-md">
          <p className="font-display text-[44px] leading-[1.02] text-cream">
            Make your next decision with more confidence.
          </p>
          <p className="mt-5 text-[13.5px] leading-7 text-muted">
            Understand what you can send, save, or spend after your commitments are covered. Confirm the lessons
            from past outcomes to help LANDED make more informed recommendations.
          </p>
          <div className="mt-8 space-y-2.5">
            {["Bills and safety buffer considered", "Recommendations with clear explanations", "Lessons you review and confirm"].map((item) => (
              <div key={item} className="flex items-center gap-3 text-[12px] text-cream/75">
                <span className="h-1.5 w-1.5 rounded-full bg-lime" />
                {item}
              </div>
            ))}
          </div>
        </div>
        <p className="relative font-mono text-[10px] text-muted/60">built for Tatum × Walrus · Total Recall</p>
      </aside>

      <main className="flex flex-1 flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <Link href="/" className="flex items-center gap-2 text-[12px] text-muted transition hover:text-cream lg:hidden">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <Link href="/" className="hidden items-center gap-2 text-[12px] text-muted transition hover:text-cream lg:flex">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to home
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12">
          <p className="text-[11px] uppercase tracking-[0.18em] text-lime">{mode === "signin" ? "Welcome back" : "Create your account"}</p>
          <h1 className="mt-3 font-display text-[38px] leading-tight text-cream">
            {mode === "signin" ? "Pick up where you left off." : "Start planning with LANDED."}
          </h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            {mode === "signin"
              ? "Sign in to see today’s safe-to-move amount and what changed since last time."
              : "Add your balances and upcoming bills to build your first plan. No bank connection is required."}
          </p>

          <div className="mt-7 grid grid-cols-2 rounded-xl border border-black/[0.08] bg-black/[0.02] p-1">
            <button
              type="button"
              onClick={() => { setMode("signin"); setError(null); }}
              aria-pressed={mode === "signin"}
              disabled={loading}
              className={`h-9 rounded-lg text-[12px] transition ${mode === "signin" ? "bg-black/[0.06] text-cream" : "text-muted hover:text-cream"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setError(null); }}
              aria-pressed={mode === "signup"}
              disabled={loading}
              className={`h-9 rounded-lg text-[12px] transition ${mode === "signup" ? "bg-black/[0.06] text-cream" : "text-muted hover:text-cream"}`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" ? (
              <Field label="Name">
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted/60" />
                  <input className={`${inputClass} pl-9`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Your name" autoComplete="name" />
                </div>
              </Field>
            ) : null}
            <Field label="Email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted/60" />
                <input className={`${inputClass} pl-9`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" autoComplete="email" />
              </div>
            </Field>
            <Field label="Password" hint={mode === "signup" ? "Use at least 8 characters and a password you don’t use elsewhere." : undefined}>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted/60" />
                <input className={`${inputClass} pl-9`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="••••••••" autoComplete={mode === "signin" ? "current-password" : "new-password"} />
              </div>
            </Field>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {mode === "signin" ? "Sign in" : "Create account"} <ArrowRight className="h-4 w-4" />
            </Button>
            {mode === "signup" ? (
              <p className="text-center text-[10.5px] leading-relaxed text-muted/80">
                By creating an account you agree to the <Link href="/privacy" className="text-cream/80 underline underline-offset-2 hover:text-lime">privacy and terms</Link>. LANDED is a planning tool, not a bank or financial adviser.
              </p>
            ) : null}
          </form>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-black/[0.08]" />
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted/60">or explore the demo</span>
            <span className="h-px flex-1 bg-black/[0.08]" />
          </div>

          <DemoButton className="[&>button]:w-full [&>button]:justify-center" label="Open demo account" />
          <div className="mt-3 rounded-xl border border-black/[0.07] bg-black/[0.02] px-3.5 py-2.5 text-[11px] leading-relaxed text-muted">
            The demo is shared with other visitors. Use fictional information only.
          </div>
        </div>
      </main>
    </div>
  );
}
