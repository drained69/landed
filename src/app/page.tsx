import Link from "next/link";
import {
  ArrowUpRight, Brain, CircleDollarSign, Database, Fingerprint, GitCompareArrows,
  Landmark, Route, ShieldCheck, Sparkles, Wallet,
} from "lucide-react";
import { getSessionUser } from "@/server/auth";
import { DemoButton } from "@/components/DemoButton";
import { Badge } from "@/components/ui";

const loop = [
  {
    n: "01",
    title: "See the real picture",
    body: "Liquid balances, bills, savings goals, and expected income in one place. Expected income is never mistaken for cleared cash.",
    icon: Wallet,
  },
  {
    n: "02",
    title: "Make a decision",
    body: "LANDED computes safe-to-move in integer cents, ranks routes on realized recipient amount and evidence quality, then shows its work.",
    icon: Route,
  },
  {
    n: "03",
    title: "Compare the outcome",
    body: "When the transfer lands, you record what actually happened. Fees, delivery time, and buffer error are calculated, not guessed.",
    icon: GitCompareArrows,
  },
  {
    n: "04",
    title: "Remember, then change",
    body: "You confirm the lesson. It is written to Walrus with a typed rule, recalled later, and changes the next recommendation.",
    icon: Brain,
  },
];

const evidence = [
  {
    icon: Landmark,
    tag: "Tatum · Sui Mainnet",
    title: "Real onchain reads",
    body: "Balances and transactions come from Tatum's Sui JSON-RPC gateway when a server-side API key is configured. No public-RPC stand-in labelled as Tatum.",
  },
  {
    icon: Database,
    tag: "Walrus Memory",
    title: "Persistent, portable lessons",
    body: "Confirmed lessons are written to a per-user namespace. Every record shows its job ID, blob ID, category, status, decision, and timestamp.",
  },
  {
    icon: Fingerprint,
    tag: "Authorization boundary",
    title: "Your database owns access",
    body: "Walrus is the memory layer, not the authorization layer. Every query is scoped by the authenticated user before recall or write.",
  },
  {
    icon: ShieldCheck,
    tag: "Deterministic engine",
    title: "No LLM arithmetic",
    body: "Cash-flow simulation, route scoring, and prediction errors use tested TypeScript with integer minor units. The optional AI layer only explains.",
  },
];

export default async function LandingPage() {
  const user = await getSessionUser();

  return (
    <div className="min-h-dvh overflow-hidden">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-lime text-[13px] font-bold text-[#0b1007]">L</span>
          <span className="text-[15px] font-semibold tracking-[0.16em] text-cream">LANDED</span>
        </Link>
        <nav className="hidden items-center gap-8 text-[12.5px] text-muted md:flex">
          <a className="transition hover:text-cream" href="#loop">How it learns</a>
          <a className="transition hover:text-cream" href="#evidence">Integrations</a>
          <a className="transition hover:text-cream" href="#honesty">Honesty</a>
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <Link href="/app" className="rounded-full bg-lime px-4 py-2 text-[12.5px] font-medium text-[#0b1007] transition hover:bg-[#d8ff8e]">
              Open LANDED
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden text-[12.5px] text-muted transition hover:text-cream sm:block">Sign in</Link>
              <Link href="/login?mode=signup" className="rounded-full border border-[#3a4437] px-4 py-2 text-[12.5px] text-cream transition hover:border-lime/50 hover:text-lime">
                Create account
              </Link>
            </>
          )}
        </div>
      </header>

      <main>
        <section className="grid-noise relative border-y border-white/[0.06]">
          <div className="absolute inset-0 bg-[radial-gradient(700px_300px_at_50%_0%,rgba(201,247,111,0.08),transparent_70%)]" />
          <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-28">
            <div className="animate-rise">
              <Badge tone="lime" className="mb-6">
                <Sparkles className="h-3 w-3" /> Tatum × Walrus · Total Recall
              </Badge>
              <h1 className="font-display text-balance text-[54px] leading-[0.96] text-cream sm:text-[72px] lg:text-[80px]">
                Your money,
                <br />
                with a <em className="text-lime not-italic">memory.</em>
              </h1>
              <p className="mt-6 max-w-xl text-[15px] leading-7 text-muted">
                LANDED finds what is genuinely safe to move, weighs every route against what actually happened last time,
                and remembers the lesson on Walrus. The next answer is different because the last outcome was real.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <DemoButton />
                <Link href="/login" className="inline-flex h-12 items-center gap-2 rounded-full border border-[#384233] px-5 text-[13.5px] text-cream transition hover:border-lime/40 hover:text-lime">
                  Use email <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <p className="mt-5 max-w-md text-[11px] leading-relaxed text-muted/80">
                The demo is fully seeded with synthetic balances and outcomes, labelled everywhere. No bank connection,
                exchange rate, or Walrus write is invented.
              </p>
            </div>

            <div className="animate-rise [animation-delay:120ms]">
              <div className="panel rounded-3xl p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted">
                    <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-amber" />
                    Decision replay
                  </div>
                  <span className="font-mono text-[10px] text-muted/70">USD · 45-day horizon</span>
                </div>

                <p className="mt-5 font-display text-[27px] leading-tight text-cream">Can I send $300 to my sister today?</p>

                <div className="mt-6 space-y-2.5">
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[11px] uppercase tracking-[0.1em] text-muted">Without memory</span>
                      <span className="text-[20px] tabular-nums text-muted line-through decoration-white/20">$300.00</span>
                    </div>
                    <p className="mt-1 text-[11.5px] text-muted/80">Simple balance check says yes.</p>
                  </div>
                  <div className="relative rounded-xl border border-lime/25 bg-lime/[0.055] p-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[11px] uppercase tracking-[0.1em] text-lime">With LANDED</span>
                      <span className="font-display text-[27px] leading-none text-lime">$150.00 now</span>
                    </div>
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-cream/75">
                      Then $150 after confirmed salary. Two remembered lessons applied.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-2 border-t border-white/[0.07] pt-4 text-[11px] leading-relaxed text-muted">
                  <p className="flex items-start gap-2">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
                    &ldquo;Cap a single transfer at 50% of safe-to-move when rent is near.&rdquo; · confirmed 8 days ago
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
                    &ldquo;FastRemit charged $14.80 against a $0.99 quote.&rdquo; · route penalty applied
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-lg bg-[#0a0d09] px-3 py-2 font-mono text-[10px] text-muted/70">
                  <span>namespace · landed-2f9c…</span>
                  <span className="text-lime/80">memory mode: live</span>
                </div>
              </div>
              <p className="mt-3 text-center text-[10.5px] text-muted/60">Illustration from the seeded demo. Amounts are computed, not mocked in the UI.</p>
            </div>
          </div>
        </section>

        <section id="loop" className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.18em] text-lime">The learning loop</p>
            <h2 className="mt-3 font-display text-4xl leading-tight text-cream sm:text-5xl">Advice that earns its confidence.</h2>
            <p className="mt-4 text-[14px] leading-7 text-muted">
              A recommendation is not a memory. LANDED waits for a confirmed outcome, separates what it predicted from
              what happened, and asks you before turning the difference into a rule.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {loop.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.n} className="panel-flat group rounded-2xl p-5 transition hover:border-lime/25">
                  <div className="flex items-center justify-between">
                    <Icon className="h-4.5 w-4.5 text-lime" />
                    <span className="font-mono text-[10px] text-muted/60">{item.n}</span>
                  </div>
                  <h3 className="mt-7 text-[14px] font-medium text-cream">{item.title}</h3>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted">{item.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section id="evidence" className="border-y border-white/[0.06] bg-[#0a0d09]/70">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-xl">
                <p className="text-[11px] uppercase tracking-[0.18em] text-lime">Under the hood</p>
                <h2 className="mt-3 font-display text-4xl text-cream sm:text-5xl">Real rails. Honest edges.</h2>
              </div>
              <p className="max-w-sm text-[12.5px] leading-relaxed text-muted">
                When a credential is missing, LANDED says so. It shows a blocked state instead of a fake success or a
                public endpoint wearing a partner&apos;s name.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {evidence.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="panel rounded-2xl p-6">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-lime/20 bg-lime/[0.06]">
                        <Icon className="h-4 w-4 text-lime" />
                      </span>
                      <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted">{item.tag}</span>
                    </div>
                    <h3 className="mt-5 text-[17px] text-cream">{item.title}</h3>
                    <p className="mt-2 text-[12.5px] leading-6 text-muted">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="honesty" className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-lime">Trust boundary</p>
              <h2 className="mt-3 font-display text-4xl leading-tight text-cream sm:text-5xl">What LANDED will never do.</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "Call a local lesson a Walrus Mainnet write.",
                "Show a converted balance without a sourced rate.",
                "Treat an onchain settlement as proof the recipient got paid.",
                "Let an unconfirmed hypothesis change your recommendation.",
                "Hide a failed integration behind sample data.",
                "Use an LLM to do money arithmetic.",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <CircleDollarSign className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime" />
                  <p className="text-[12px] leading-relaxed text-muted">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 text-[11px] text-muted/70 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-lime text-[9px] font-bold text-[#0b1007]">L</span>
            <span>LANDED · built for the Tatum × Walrus Total Recall Hackathon</span>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link className="transition hover:text-cream" href="/login">Sign in</Link>
            <a className="transition hover:text-cream" href="https://walrus.xyz" target="_blank" rel="noreferrer">Walrus</a>
            <a className="transition hover:text-cream" href="https://tatum.io" target="_blank" rel="noreferrer">Tatum</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
