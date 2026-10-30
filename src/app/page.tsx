import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, Check, Database, Fingerprint, History, Landmark, LineChart, ShieldCheck, X,
} from "lucide-react";
import { getSessionUser } from "@/server/auth";
import { DemoButton } from "@/components/DemoButton";
import { Logo, LogoMark } from "@/components/Logo";

/** Hand-drawn underline used under one key phrase per headline. */
function Scribble({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden className={`pointer-events-none absolute -bottom-2 left-0 h-[0.32em] w-full ${className}`}>
      <path d="M3 12.5C48 6.5 112 4 166 6.2c43 1.8 88 4.6 131 1.6" fill="none" stroke="#2e7d4f" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-medium text-lime">{children} ›</p>;
}

const remembers = [
  {
    kind: "Preferences",
    title: "What you told it to hold.",
    body: "A $120 dining limit. The $18 you agreed to pay for streaming. A cushion you never dip below. Set once, kept everywhere.",
    tint: "from-[#fbe7b0] via-[#fdf3d6]",
    card: (
      <ul className="space-y-2 font-mono text-[11px]">
        {["dining ≤ $120 / month", "streaming approved at $18.00", "keep $150 after any transfer"].map((t) => (
          <li key={t} className="flex items-center gap-2 text-cream/85">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-lime/15 text-lime"><Check className="h-2.5 w-2.5" /></span>
            {t}
          </li>
        ))}
      </ul>
    ),
  },
  {
    kind: "Scores",
    title: "Which lessons actually work.",
    body: "Every real outcome grades the lessons behind the advice. Ones that keep working get more say; ones that failed get less and are flagged.",
    tint: "from-[#cfe8d6] via-[#e8f4ea]",
    card: (
      <div>
        <p className="font-mono text-[10px] text-muted">northline lesson · held 2×</p>
        <p className="mt-1 font-display text-[34px] leading-none text-cream">77%</p>
        <div className="mt-2 space-y-1.5">
          {([["before", 62], ["after", 77]] as const).map(([label, v]) => (
            <div key={label} className="flex items-center gap-2 font-mono text-[10px] text-muted">
              <span className="w-10">{label}</span>
              <span className="h-1.5 flex-1 rounded-full bg-black/[0.06]"><span className="block h-full rounded-full bg-lime" style={{ width: `${v}%` }} /></span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    kind: "Reasoning",
    title: "Why it said what it said.",
    body: "An optional journal of every answer — the question, the advice and the reason — so you can ask “what did you tell me last time?” weeks later.",
    tint: "from-[#f6d2c6] via-[#fbe9e2]",
    card: (
      <div className="space-y-2 text-[11.5px]">
        <p className="rounded-xl bg-black/[0.04] px-3 py-2 text-cream/80">What did you tell me last time?</p>
        <p className="rounded-xl bg-ink px-3 py-2 text-white">You asked to send $300. I said $150 now — rent was 9 days out.</p>
      </div>
    ),
  },
];

const chores = [
  "protect rent before anything else", "count income only once it lands", "rank routes by what actually arrives",
  "spot a subscription price hike", "pace dining against your limit", "grade last week's advice",
  "remember a route that ran late", "split a risky transfer", "keep a cushion you never touch",
  "verify a Sui settlement via Tatum", "restore your memory on a new phone", "explain every number it changed",
];

const stack = [
  { icon: Database, tag: "Walrus Memory · Mainnet", title: "Typed lessons, portable text", body: "Confirmed lessons are written to your namespace with their typed rule embedded. Recall is semantic; the database rule stays authoritative." },
  { icon: History, tag: "Walrus · restore + inventory", title: "Total Recall on any device", body: "The namespace follows your sign-in, so restore() and recall rebuild your ledger anywhere; listMemories() independently counts what is stored." },
  { icon: Landmark, tag: "Tatum · Sui", title: "Settlement you can check", body: "Balances, history and transaction evidence. The server re-verifies a digest before anything is called onchain-verified." },
  { icon: LineChart, tag: "Tatum · Data API", title: "Sourced exchange rates", body: "Crypto balances and gas are valued only with a rate Tatum returns — shown with its source, never added to safe-to-move." },
  { icon: Fingerprint, tag: "Authorization", title: "Your database owns access", body: "Walrus is the memory layer, not the lock. Every query is scoped to the signed-in account before recall or write." },
  { icon: ShieldCheck, tag: "Deterministic engine", title: "No LLM arithmetic", body: "Cash flow, routes and prediction errors are tested TypeScript in integer cents. The optional AI layer only explains — and is discarded if it invents a number." },
];

const never = [
  "Call a local lesson a Walrus Mainnet write.",
  "Show a converted balance without a sourced rate.",
  "Treat an onchain settlement as proof the recipient got paid.",
  "Let an unconfirmed lesson change your advice.",
  "Hide a failed integration behind sample data.",
  "Move your money. It advises; you decide.",
];

export default async function LandingPage() {
  const user = await getSessionUser();
  const primaryHref = user ? "/app" : "/login?mode=signup";
  const primaryLabel = user ? "Open LANDED" : "Create your free account";

  return (
    <div className="min-h-dvh overflow-x-hidden">
      {/* ── Hero: sky canvas ─────────────────────────────────────────── */}
      <section className="sky relative mx-2 mt-2 overflow-hidden rounded-[32px] sm:mx-3 sm:mt-3 sm:rounded-[40px]">
        <span className="cloud left-[8%] top-[22%] h-16 w-52" />
        <span className="cloud right-[6%] top-[30%] h-14 w-60" />
        <span className="cloud left-[18%] top-[58%] h-12 w-44 opacity-70" />
        <span className="cloud right-[16%] top-[64%] h-16 w-56 opacity-70" />

        <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" aria-label="LANDED home"><Logo size={28} /></Link>
          <nav className="hidden items-center gap-8 text-[13px] text-cream/75 md:flex">
            <a className="transition hover:text-cream" href="#remembers">What it remembers</a>
            <a className="transition hover:text-cream" href="#spend">Spend Watch</a>
            <a className="transition hover:text-cream" href="#stack">Under the hood</a>
            <a className="transition hover:text-cream" href="#honesty">Honesty</a>
          </nav>
          <div className="flex items-center gap-3">
            {user ? null : <Link href="/login" className="hidden text-[13px] text-cream/75 transition hover:text-cream sm:block">Sign in</Link>}
            <Link href={user ? "/app" : "/login?mode=signup"} className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black/80">
              {user ? "Open LANDED" : "Create account"}
            </Link>
          </div>
        </header>

        <div className="relative mx-auto max-w-4xl px-5 pb-10 pt-12 text-center sm:px-8 sm:pt-16">
          <p className="text-[12.5px] text-cream/60">For anyone who sends, saves or spends money</p>
          <h1 className="mx-auto mt-4 max-w-4xl text-balance font-display text-[40px] leading-[1.06] text-cream sm:text-[58px]">
            Know what&apos;s safe to move.
            <br />
            Money with a{" "}
            <span className="relative inline-block">
              memory.
              <Scribble />
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-[17px] leading-7 text-cream/65 sm:text-[19px] sm:leading-8">
            LANDED protects your bills, watches your subscriptions and limits, and remembers what really happened last
            time — so next week&apos;s answer is better than this week&apos;s, on any device.
          </p>

          <div className="mx-auto mt-8 flex max-w-lg flex-col items-stretch justify-center gap-2.5 rounded-[24px] bg-white/80 p-2.5 shadow-[0_18px_50px_-24px_rgba(10,11,12,0.35)] backdrop-blur sm:flex-row sm:items-center">
            <Link href={primaryHref} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-white transition hover:bg-black/80 sm:w-auto sm:flex-1">
              {primaryLabel} <ArrowRight className="h-4 w-4" />
            </Link>
            <DemoButton variant="secondary" label="Explore the live demo" className="sm:flex-1 [&>button]:h-11 [&>button]:w-full" />
          </div>
          <p className="mt-3 text-[11.5px] text-cream/55">No bank login · no crypto knowledge · two-minute setup</p>
        </div>

        {/* Product preview */}
        <div className="relative mx-auto max-w-4xl px-3 pb-12 sm:px-8 sm:pb-14">
          <div className="overflow-hidden rounded-[24px] border border-black/[0.06] bg-white shadow-[0_30px_80px_-40px_rgba(10,11,12,0.45)]">
            <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-4 py-2.5">
              <p className="flex items-center gap-2 font-mono text-[11px] text-muted"><LogoMark size={16} /> landed · decision replay</p>
              <span className="rounded-full border border-black/[0.08] bg-[#f6f6f4] px-2.5 py-0.5 font-mono text-[10px] text-muted">From the demo</span>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
              <div className="sm:col-span-2">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">You asked</p>
                <p className="mt-1 font-display text-[24px] leading-tight text-cream sm:text-[28px]">Can I send $300 to my sister today?</p>
              </div>
              <div className="rounded-2xl border border-black/[0.06] bg-[#f6f6f4] p-4">
                <p className="font-mono text-[10.5px] text-muted">without memory</p>
                <p className="mt-1 text-[26px] tabular-nums text-muted line-through decoration-black/20">$300.00</p>
                <p className="mt-1 text-[12px] text-muted">A balance check says yes.</p>
              </div>
              <div className="rounded-2xl border border-lime/25 bg-[#eef6f0] p-4">
                <p className="font-mono text-[10.5px] text-lime">with LANDED</p>
                <p className="mt-1 text-[26px] font-semibold tabular-nums text-cream">$150 now</p>
                <p className="mt-1 text-[12px] text-cream/70">Then $150 after payday. Two remembered lessons applied.</p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                {[
                  ["Cap a single transfer at 50% of safe-to-move when rent is near", "confirmed lesson"],
                  ["FastRemit charged $14.80 against a $0.99 quote", "route penalty applied"],
                ].map(([t, d]) => (
                  <div key={t} className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] px-3.5 py-2.5">
                    <p className="flex items-center gap-2 text-left text-[12.5px] text-cream/85"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" /> {t}</p>
                    <span className="hidden shrink-0 font-mono text-[10px] text-muted sm:block">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-4 text-center font-display text-[15px] text-cream/70 sm:pr-4 sm:text-right">
            the answer changed because the last outcome was real <span aria-hidden>↗</span>
          </p>
        </div>
      </section>

      <main>
        {/* ── Intro ─────────────────────────────────────────────────── */}
        <section className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-20 sm:grid-cols-[180px_1fr] sm:px-8 sm:py-28">
          <Eyebrow>Introducing LANDED</Eyebrow>
          <div className="space-y-5 text-[17px] leading-8 text-cream/80 sm:text-[19px]">
            <p>
              Your balance is not the answer. Rent is due in nine days, the phone bill in four, groceries this week, and
              there is a cushion you never want to touch. Most apps show the number and forget you the moment you close them.
            </p>
            <p>
              LANDED works out what is genuinely safe to move, shows its work next to what a no-memory answer would have
              said, and asks what really happened afterwards. <strong className="font-semibold text-cream">You confirm what it learns.</strong>{" "}
              Next time the advice is different — and it can tell you exactly which memory changed it.
            </p>
          </div>
        </section>

        {/* ── The careful work ──────────────────────────────────────── */}
        <section className="border-y border-black/[0.05] bg-[#f1f1ee]">
          <div className="mx-auto max-w-5xl px-5 py-20 text-center sm:px-8 sm:py-24">
            <Eyebrow>The careful work</Eyebrow>
            <h2 className="mx-auto mt-4 max-w-3xl font-display text-[34px] leading-[1.12] text-cream sm:text-[50px]">
              All the money worries,
              <br />
              checked before you hit send.
            </h2>
            <div className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-2.5">
              {chores.map((c, i) => (
                <span key={c} className={`chip px-4 py-2 text-[13px] text-cream/85 ${i >= chores.length - 3 ? "opacity-60" : ""}`}>{c}</span>
              ))}
            </div>
            <p className="mx-auto mt-10 max-w-md text-[14px] leading-6 text-muted">
              None of it is magic. All of it repeats every week — exactly the work worth handing to something that remembers.
            </p>
          </div>
        </section>

        {/* ── What it remembers ─────────────────────────────────────── */}
        <section id="remembers" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <Eyebrow>Apps that remember</Eyebrow>
          <h2 className="mt-4 max-w-3xl font-display text-[34px] leading-[1.12] text-cream sm:text-[50px]">
            Sharper every week,
            <br />
            not every{" "}
            <span className="relative inline-block">
              login.
              <Scribble />
            </span>
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3 md:gap-6">
            {remembers.map((item) => (
              <div key={item.kind}>
                <div className={`rounded-[22px] bg-gradient-to-br ${item.tint} to-white p-5`}>
                  <div className="rounded-2xl border border-black/[0.05] bg-white p-4 shadow-[0_12px_30px_-20px_rgba(10,11,12,0.35)]">
                    <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">{item.kind}</p>
                    {item.card}
                  </div>
                </div>
                <p className="mt-4 text-[14px] leading-6 text-muted">
                  <span className="font-semibold text-cream">{item.title}</span> {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Spend Watch ───────────────────────────────────────────── */}
        <section id="spend" className="border-t border-black/[0.05]">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <Eyebrow>Spend Watch</Eyebrow>
              <h2 className="mt-4 font-display text-[34px] leading-[1.12] text-cream sm:text-[46px]">
                Your limits aren&apos;t suggestions.
                <br />
                They&apos;re{" "}
                <span className="relative inline-block">
                  memory.
                  <Scribble />
                </span>
              </h2>
              <p className="mt-6 text-[16px] leading-7 text-muted">
                LANDED spots subscriptions, price hikes and spending that runs hot — and only suggests. Say “remember this”
                and it watches from then on. Every alert names the promise it is holding you to.
              </p>
              <div className="mt-6 flex gap-8 text-[13.5px]">
                <p><span className="block font-display text-[32px] leading-none text-muted">0</span><span className="mt-1 block text-muted">alerts without memory</span></p>
                <p><span className="block font-display text-[32px] leading-none text-lime">2</span><span className="mt-1 block text-muted">with the rules you set</span></p>
              </div>
            </div>
            <div className="rounded-[28px] bg-gradient-to-br from-[#f6d2c6] via-[#fbe9e2] to-[#fdf3d6] p-4 sm:p-6">
              <div className="space-y-3">
                {[
                  { t: "Streaming bundle charged $21.99 — you approved $18.00", d: "$47.88 more a year than the price you agreed to keep.", m: "approved at $18.00" },
                  { t: "Dining is $32.00 over your limit", d: "$152.00 this month against the $120.00 limit you set.", m: "set a $120 dining limit" },
                ].map((a) => (
                  <div key={a.t} className="rounded-2xl border border-black/[0.05] bg-white p-4 shadow-[0_12px_30px_-22px_rgba(10,11,12,0.4)]">
                    <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-red"><span className="h-1.5 w-1.5 rounded-full bg-red" /> outside your rule</p>
                    <p className="mt-1.5 text-[14px] font-medium text-cream">{a.t}</p>
                    <p className="mt-1 text-[12.5px] text-muted">{a.d}</p>
                    <p className="mt-2 font-mono text-[10.5px] text-lime">because you {a.m}</p>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-black/[0.05] bg-white p-4">
                  <div>
                    <p className="text-[12.5px] text-muted">“Can I spend $60 on dining tonight?”</p>
                    <p className="mt-1 text-[13.5px] text-cream">Cash-wise, yes. By your $120 limit — no.</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[11.5px] text-white"><X className="h-3 w-3" /> Not now</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Web2 welcome ──────────────────────────────────────────── */}
        <section className="border-t border-black/[0.05] bg-[#f1f1ee]">
          <div className="mx-auto max-w-5xl px-5 py-20 text-center sm:px-8 sm:py-24">
            <Eyebrow>Web2 welcome</Eyebrow>
            <h2 className="mx-auto mt-4 max-w-2xl font-display text-[34px] leading-[1.12] text-cream sm:text-[50px]">No crypto degree required.</h2>
            <p className="mx-auto mt-5 max-w-xl text-[16px] leading-7 text-muted">
              The blockchain does its job out of sight: it keeps your memory and checks settlements. You just see money.
            </p>
            <div className="mt-10 grid gap-4 text-left sm:grid-cols-3">
              {[
                ["Dollars, not tokens", "Balances, bills and limits in your currency. Crypto only appears if you connect a wallet — with a sourced dollar value."],
                ["Your memory moves with you", "Sign in on a new phone and LANDED restores what it learned about you. Nothing to export, nothing to re-teach."],
                ["No bank login, no surprises", "Enter balances, import your bank's CSV, or sync a Sui wallet. LANDED never moves money."],
              ].map(([t, b]) => (
                <div key={t} className="rounded-[22px] border border-black/[0.05] bg-white p-6">
                  <p className="text-[15px] font-semibold text-cream">{t}</p>
                  <p className="mt-2 text-[13.5px] leading-6 text-muted">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Stack ─────────────────────────────────────────────────── */}
        <section id="stack" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <Eyebrow>Under the hood</Eyebrow>
          <h2 className="mt-4 max-w-3xl font-display text-[34px] leading-[1.12] text-cream sm:text-[50px]">
            Walrus Mainnet.
            <br />
            Tatum RPC and Data APIs.
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stack.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-[22px] border border-black/[0.06] bg-white p-6 transition hover:shadow-[0_18px_40px_-28px_rgba(10,11,12,0.4)]">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef6f0] text-lime"><Icon className="h-4 w-4" /></span>
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">{item.tag}</span>
                  </div>
                  <h3 className="mt-5 text-[16px] font-semibold text-cream">{item.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-6 text-muted">{item.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Honesty ───────────────────────────────────────────────── */}
        <section id="honesty" className="border-t border-black/[0.05] bg-[#f1f1ee]">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <Eyebrow>You stay in charge</Eyebrow>
              <h2 className="mt-4 font-display text-[34px] leading-[1.12] text-cream sm:text-[46px]">What LANDED will never do.</h2>
              <p className="mt-4 text-[15px] leading-7 text-muted">When a credential is missing, it says so — a blocked state, never a fake success.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {never.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl border border-black/[0.05] bg-white p-4">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red/10 text-red"><X className="h-3 w-3" /></span>
                  <p className="text-[13.5px] leading-6 text-cream/80">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Closing ───────────────────────────────────────────────── */}
        <section className="px-2 py-3 sm:px-3">
          <div className="sky relative overflow-hidden rounded-[32px] px-5 py-20 text-center sm:rounded-[40px] sm:py-24">
            <span className="cloud left-[10%] top-[30%] h-14 w-48" />
            <span className="cloud right-[12%] top-[50%] h-14 w-56" />
            <h2 className="relative mx-auto max-w-2xl font-display text-[36px] leading-[1.1] text-cream sm:text-[54px]">Ready for money that remembers?</h2>
            <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={primaryHref} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-white transition hover:bg-black/80">
                {primaryLabel} <ArrowRight className="h-4 w-4" />
              </Link>
              <DemoButton variant="secondary" label="Explore the live demo" className="[&>button]:h-11 [&>button]:bg-white" />
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-10 text-[12.5px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Logo size={22} />
          <span className="text-muted/80">Built for the Tatum × Walrus Total Recall hackathon</span>
        </div>
        <div className="flex flex-wrap gap-5">
          <Link className="transition hover:text-cream" href="/login">Sign in</Link>
          <Link className="transition hover:text-cream" href="/privacy">Privacy and terms</Link>
          <a className="inline-flex items-center gap-1 transition hover:text-cream" href="https://walrus.xyz" target="_blank" rel="noreferrer">Walrus <ArrowUpRight className="h-3 w-3" /></a>
          <a className="inline-flex items-center gap-1 transition hover:text-cream" href="https://tatum.io" target="_blank" rel="noreferrer">Tatum <ArrowUpRight className="h-3 w-3" /></a>
        </div>
      </footer>
    </div>
  );
}
