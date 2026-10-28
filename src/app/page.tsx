import Link from "next/link";
import {
  ArrowUpRight, BellRing, Brain, CircleDollarSign, Database, Fingerprint, GitCompareArrows,
  History, Landmark, LineChart, MessageSquareQuote, Route, ShieldCheck, Smartphone, Sparkles,
  SlidersHorizontal, Trophy, Wallet,
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

/** The brief: "Walrus Memory keeps scores, preferences, and reasoning across sessions." */
const remembers = [
  {
    icon: SlidersHorizontal,
    kind: "Preferences",
    title: "What you told it to hold",
    body: "A $120 dining limit. The $18 you agreed to pay for streaming. A $150 cushion you never want to dip below. Set once, kept everywhere.",
    example: "“Keep dining at or under $120 a month.”",
  },
  {
    icon: Trophy,
    kind: "Scores",
    title: "Which lessons actually work",
    body: "Every real outcome grades the lessons behind the advice. The ones that keep working get more say; the ones that failed get less and are flagged.",
    example: "Northline lesson · held 2× · trust 62% → 77%",
  },
  {
    icon: MessageSquareQuote,
    kind: "Reasoning",
    title: "Why it said what it said",
    body: "An optional journal of every answer — the question, the advice, and the reason — so you can ask “what did you tell me last time?” weeks later.",
    example: "“Last time you asked to send $300, I said $150 now…”",
  },
];

const plain = [
  { icon: Wallet, title: "Dollars, not tokens", body: "You see balances, bills and limits in your own currency. Crypto amounts only appear if you connect a wallet — and then with a sourced dollar value." },
  { icon: Smartphone, title: "Your memory moves with you", body: "Sign in on a new phone and LANDED restores what it learned about you from Walrus. Nothing to export, nothing to re-teach." },
  { icon: ShieldCheck, title: "No bank login, no surprises", body: "Enter balances yourself or import a CSV. LANDED never moves money; it advises, then asks what really happened." },
];

const evidence = [
  {
    icon: Database,
    tag: "Walrus Memory · Mainnet",
    title: "Typed lessons, portable text",
    body: "Each confirmed lesson is written to the account's namespace as self-describing text with its typed rule embedded. Recall is semantic; the database rule stays authoritative.",
  },
  {
    icon: History,
    tag: "Walrus Memory · restore + inventory",
    title: "Total Recall on a fresh install",
    body: "The namespace is derived from the sign-in, not a device, so restore() and recall rebuild the ledger anywhere. listMemories() independently counts what is really stored.",
  },
  {
    icon: Landmark,
    tag: "Tatum · Sui RPC",
    title: "Settlement you can check",
    body: "Wallet balances and history, plus transaction evidence: status, balance changes and gas fill an outcome, and the server re-verifies the digest before calling it onchain-verified.",
  },
  {
    icon: LineChart,
    tag: "Tatum · Data API",
    title: "Sourced exchange rates",
    body: "SUI and stablecoin balances, and Sui gas, are valued in dollars only with a rate Tatum returns — shown with its source and time, never added to safe-to-move.",
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
          <a className="transition hover:text-cream" href="#remembers">What it remembers</a>
          <a className="transition hover:text-cream" href="#spend">Spend Watch</a>
          <a className="transition hover:text-cream" href="#evidence">Under the hood</a>
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
                LANDED tells you what is actually safe to send, save or spend, watches your subscriptions and limits, and
                remembers what really happened last time. Next week&apos;s answer is better than this week&apos;s — and it
                follows you to any device.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <DemoButton />
                <Link href="/login" className="inline-flex h-12 items-center gap-2 rounded-full border border-[#384233] px-5 text-[13.5px] text-cream transition hover:border-lime/40 hover:text-lime">
                  Use email <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <p className="mt-5 max-w-md text-[11px] leading-relaxed text-muted/80">
                No bank login and no crypto knowledge needed. The demo is seeded with synthetic balances and outcomes,
                labelled everywhere; no bank connection, exchange rate, or Walrus write is invented.
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

        <section id="remembers" className="mx-auto w-full max-w-6xl px-5 pt-20 sm:px-8 sm:pt-28">
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.18em] text-lime">Apps that remember</p>
            <h2 className="mt-3 font-display text-4xl leading-tight text-cream sm:text-5xl">Sharper every week, not every login.</h2>
            <p className="mt-4 text-[14px] leading-7 text-muted">
              Most money apps forget you the moment you close them. LANDED keeps three kinds of memory on Walrus, and every
              answer shows which memory shaped it.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {remembers.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.kind} className="panel rounded-2xl p-6">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-lime/20 bg-lime/[0.06]">
                      <Icon className="h-4 w-4 text-lime" />
                    </span>
                    <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted">{item.kind}</span>
                  </div>
                  <h3 className="mt-5 text-[17px] text-cream">{item.title}</h3>
                  <p className="mt-2 text-[12.5px] leading-6 text-muted">{item.body}</p>
                  <p className="mt-4 rounded-lg border border-white/[0.07] bg-[#0a0d09] px-3 py-2 font-mono text-[10.5px] leading-relaxed text-lime/80">{item.example}</p>
                </div>
              );
            })}
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

        <section id="spend" className="border-t border-white/[0.06]">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-lime">Spend Watch</p>
              <h2 className="mt-3 font-display text-4xl leading-tight text-cream sm:text-5xl">It nags you about your rules, not its averages.</h2>
              <p className="mt-4 text-[14px] leading-7 text-muted">
                LANDED spots subscriptions, price hikes and spending that runs hot — and only suggests. The moment you say
                “remember this”, it watches for you from then on, and every alert names the promise it is holding you to.
              </p>
              <p className="mt-4 text-[12.5px] text-muted">Without memory: <span className="text-cream">0 alerts</span>. With memory: <span className="text-lime">the ones you asked for</span>.</p>
            </div>
            <div className="panel rounded-3xl p-5 sm:p-6">
              <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-amber"><BellRing className="h-3.5 w-3.5" /> From what you told LANDED</p>
              <div className="mt-4 space-y-3">
                {[
                  { t: "Streaming bundle charged $21.99 — you approved $18.00", d: "That is $47.88 more a year than the price you agreed to keep.", m: "Approved Streaming bundle at $18.00 · Aug 29" },
                  { t: "Dining is $32.00 over your limit", d: "$152.00 spent this month against the $120.00 limit you set.", m: "Keep dining at or under $120.00 per month · Sep 24" },
                ].map((a) => (
                  <div key={a.t} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <p className="text-[13.5px] text-cream">{a.t}</p>
                    <p className="mt-1 text-[12px] text-muted">{a.d}</p>
                    <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-muted"><Brain className="h-3 w-3 text-lime/80" /> because: {a.m}</p>
                  </div>
                ))}
                <div className="rounded-xl border border-lime/25 bg-lime/[0.05] p-4">
                  <p className="text-[12px] text-muted">“Can I spend $60 on dining tonight?”</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-cream">Cash-wise, yes. By the $120 limit you asked me to hold, it would put dining $92 over — so no.</p>
                </div>
              </div>
              <p className="mt-3 text-center text-[10.5px] text-muted/60">From the seeded demo. Computed by the same engine you use.</p>
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06]">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-[11px] uppercase tracking-[0.18em] text-lime">Web2 welcome</p>
              <h2 className="mt-3 font-display text-4xl leading-tight text-cream sm:text-5xl">No crypto degree required.</h2>
              <p className="mt-4 text-[14px] leading-7 text-muted">
                The blockchain does its job out of sight: it keeps your memory and checks settlements. You just see money.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {plain.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="panel-flat rounded-2xl p-5">
                    <Icon className="h-4.5 w-4.5 text-lime" />
                    <h3 className="mt-5 text-[14px] font-medium text-cream">{item.title}</h3>
                    <p className="mt-2 text-[12px] leading-relaxed text-muted">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="evidence" className="border-y border-white/[0.06] bg-[#0a0d09]/70">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-xl">
                <p className="text-[11px] uppercase tracking-[0.18em] text-lime">Under the hood · real stack</p>
                <h2 className="mt-3 font-display text-4xl text-cream sm:text-5xl">Walrus Mainnet. Tatum RPC and Data APIs.</h2>
              </div>
              <p className="max-w-sm text-[12.5px] leading-relaxed text-muted">
                When a credential is missing, LANDED says so. It shows a blocked state instead of a fake success or a
                public endpoint wearing a partner&apos;s name.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                "Show a converted balance without a sourced Tatum rate.",
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
