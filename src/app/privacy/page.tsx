import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Privacy and terms · LANDED",
  description: "What LANDED stores, where your data goes, and what LANDED is not.",
};

const sections: { title: string; body: string[] }[] = [
  {
    title: "What LANDED is — and is not",
    body: [
      "LANDED is a planning tool. It is not a bank, a money transmitter, or a licensed financial adviser. It never moves money, never holds funds, and never connects to a bank account. Its recommendations are estimates computed from the information you give it; you decide what to do.",
    ],
  },
  {
    title: "What we store",
    body: [
      "Your name, email, a salted scrypt hash of your password (never the password), and session tokens stored only as hashes.",
      "The money records you enter or import: balances, transactions, bills, savings goals, payment-route quotes, decisions, outcomes, and the lessons you confirm.",
      "An audit log of significant actions (sign-in, outcome recorded, memory written) so you can trust what happened.",
    ],
  },
  {
    title: "Walrus Memory",
    body: [
      "Lessons you confirm — and, if you opt in, a journal of past advice — are written to Walrus Memory in a namespace derived from a hash of your sign-in email. Walrus Memory encrypts each blob. Blobs are permanent: no application, including LANDED, can delete them.",
      "Nothing becomes memory without your confirmation, drafts and rejected lessons are never written, and the decision journal is off unless you turn it on.",
    ],
  },
  {
    title: "Tatum",
    body: [
      "If you connect a Sui wallet or paste a transaction digest, LANDED reads public onchain data for that address or transaction through Tatum. It never asks for a private key or seed phrase and cannot sign anything. Exchange rates come from Tatum's Data API.",
    ],
  },
  {
    title: "Optional AI explanations",
    body: [
      "If the operator of this deployment enables it, a short set of already-computed facts (amounts, the advice and its reasons, lesson summaries — never your email or account identifiers) is sent to the configured AI provider to produce a plain-language summary. The summary is discarded if it contains any number LANDED did not compute.",
    ],
  },
  {
    title: "Sharing",
    body: [
      "We do not sell or share your data. Community route statistics are off by default; if you opt in, only de-identified cost and delivery errors are aggregated, and a statistic is published only once at least 3 people and 5 observations contribute.",
    ],
  },
  {
    title: "Your controls",
    body: [
      "Export everything as JSON from Settings → Data & consent. Exclude any lesson from future advice. Change your password, which signs out every other device, or permanently delete your account from Settings → Profile. Deleting removes every record LANDED holds; Walrus blobs remain encrypted and unlinked.",
    ],
  },
  {
    title: "Security",
    body: [
      "Every database query is scoped to your account. Server-side keys never reach the browser. Writes are origin-checked and rate-limited. Money is handled as integers end to end.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={28} />
        </Link>
        <Link href="/login" className="text-[12.5px] text-muted transition hover:text-cream">Sign in</Link>
      </header>
      <main className="mx-auto w-full max-w-3xl px-5 pb-20 pt-6 sm:px-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-lime">Privacy and terms</p>
        <h1 className="mt-3 font-display text-[40px] leading-tight text-cream sm:text-[52px]">Plainly: what happens to your data.</h1>
        <p className="mt-4 text-[14px] leading-7 text-muted">Last updated October 2026.</p>
        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-[17px] text-cream">{section.title}</h2>
              <div className="mt-2 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 40)} className="text-[13.5px] leading-7 text-muted">{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
