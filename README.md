# LANDED

**Money that remembers.**

LANDED is a consumer finance app that answers one question honestly: *what is actually safe to move right now?* It combines cleared balances, upcoming bills, savings goals, expected income, and route quotes; ranks payment routes on the amount that actually lands; watches subscriptions and category spending against limits the user taught it; then records what happened and turns confirmed outcomes into persistent, typed memory on Walrus — memory that keeps a track record and loses confidence when it turns out to be wrong.

Built for the **Tatum × Walrus Total Recall Hackathon**. The loop is real: an outcome can become a lesson, a confirmed lesson changes a future recommendation, and the changed recommendation is visible in a replay against the no-memory baseline.

```
context → deterministic decision → user follows → real outcome
   ↑                                                    │
   └──── typed lesson ← user confirms ← proposal ←──────┘
```

## What is real in this build

| Area | State |
| --- | --- |
| Financial engine | Real. Deterministic integer-minor-unit arithmetic, 45-day cash-flow simulation, route ranking. No LLM math. |
| Demo data | **Synthetic and labelled everywhere.** 5 accounts, 53 transactions, 5 bills, 4 routes, 5 decisions, 21 lessons, 5 journal entries. |
| Spend Watch | Real. Deterministic recurring-charge detection and category pacing. Alerts come only from user-confirmed `SPEND_LIMIT` / `SUBSCRIPTION_WATCH` memories. |
| Memory track record | Real. Every recorded outcome judges the lessons behind its decision (held / contradicted / inconclusive) and moves their confidence, which changes how strongly they act next time. |
| Tatum Sui RPC | Real JSON-RPC integration (`sui-mainnet.gateway.tatum.io`) when `TATUM_API_KEY` is set: wallet balances and history, and transaction evidence (status, balance changes, gas) that fills and verifies outcomes. Without it: HTTP 503 and an explicit `not configured` state. No public-RPC substitution. |
| Tatum Data API | Real `/v4/data/rate/symbol/batch` exchange rates (same key). Values SUI/stablecoin balances and Sui gas in dollars with the rate's source and timestamp; never added to safe-to-move. Without a key, crypto stays in its own units. |
| Total Recall | Real `restore()` + recall rebuild the lesson ledger from Walrus on a fresh install — including each lesson's latest confidence, which rules were replaced, and the track record. `listMemories()` independently counts what is stored. The namespace is derived from the sign-in email, so memory follows the person, not the device. |
| Lesson updates | Walrus blobs are immutable, so confidence changes, replaced rules and exclusions are appended to `<namespace>-updates` and replayed newest-wins on restore. |
| Spend Watch recall | Rules are recalled from Walrus on every check; each alert shows whether its rule came from a Walrus recall or the local ledger, and the page shows recall coverage. |
| Decision journal | Opt-in. Each answer's question, advice and reason is written to its own Walrus namespace and can be recalled ("what did you tell me last time?"). Never used as a rule. |
| Learning curve | Weekly rules-in-force and advice outcomes on Overview and Memory, from recorded outcomes only. |
| Walrus Memory | Real `@mysten-incubation/memwal` writes and recalls when `MEMWAL_PRIVATE_KEY` + `MEMWAL_ACCOUNT_ID` are set. A record is only `confirmed` when the relayer returns a blob ID. |
| Confirmed Mainnet memories | **0 in this checkout** — credentials are not present. The app reports 0 and labels all 26 records as local rehearsal. Nothing is faked. |
| AI explanation layer | Optional OpenAI-compatible endpoint. Arithmetic, ranking, memory rules, and writes never depend on it. |
| Bank connections | None. Balances are self-reported, CSV-imported, or verified onchain through Tatum. |

The seeded live decision is deliberately instructive:

- **No-memory baseline:** send **$300.00**.
- **With recalled memory:** send **$150.00 now, $150.00 after income** (50% single-move cap + route adjustment).
- Replay shows the two arms side by side using **the same input snapshot** and a cutoff clamped to the decision time.

Spend Watch carries a second, everyday example:

- **No memory:** 0 alerts. Averages and detected patterns are shown as proposals only.
- **With memory:** *Streaming bundle charged $21.99 — you approved $18.00* and *Dining is over your $120.00 limit*, each naming the memory that raised it.
- Asking *“Can I spend $60 on dining tonight?”* returns: cash flow allows it, your remembered limit does not.

## Quickstart

```bash
pnpm install
cp .env.example .env
pnpm setup        # prisma generate + db push + seed
pnpm dev
```

Open <http://localhost:3000> and choose **Open demo account** (or sign in with `demo@landed.app` / `landed-demo-2026`).

To reset the demo to its pristine, deterministic state:

```bash
pnpm db:reset
```

### Verification

```bash
pnpm typecheck
pnpm lint
pnpm test          # 72 tests, incl. Walrus flows end to end against the SDK's MemWalMock (write, inventory, recall coverage, updates, journal, fresh-install restore)
pnpm build
```

## Walk through the loop

1. **Overview** — safe-to-move is `$150.00`, with the single-move cap attributed to a recalled lesson. Projected low point, protected bills, and buffer are all visible.
2. **Plan a move** — ask to send `$300`. LANDED returns `$150 now / $150 after income`, compares routes, and shows which memories changed the answer.
3. **Decision detail** — `I followed this` creates a movement. `Record real outcome` captures fee, received amount, delivery hours, buffer after, and whether bills were covered.
4. **Advice Autopsy** — predicted vs observed, confirmed causes vs hypotheses, and draft lessons. Nothing becomes memory automatically.
5. **Confirm a lesson** — the user approves the wording and typed rule. Only then can it be written to Walrus.
6. **Walrus write** — with credentials, the app waits for a blob ID and stores it. Without credentials the status is `blocked`, not `confirmed`.
7. **Learning replay** — baseline vs memory-informed action on the identical snapshot. A future cutoff is clamped to the decision time.
8. **Memory** — ledger with category, status, blob ID, decision, confirmation time, verification and consent controls.
9. **Track record** — lessons tested by later outcomes: verdicts, reasons, and confidence before → after. A lesson that applied and still failed loses confidence and is flagged for review.
10. **Spend Watch** — recurring charges and category pace. Remember a limit or approve a price; from then on it alerts, across sessions, and names the memory behind every alert.
11. **Verify with Tatum** — when recording an outcome, paste a Sui digest. LANDED reads it through Tatum, fills the facts in the decision's currency, shows gas in SUI and (with a Tatum Data API rate) in dollars, and re-verifies the digest server-side before marking the outcome onchain-verified.
12. **Total Recall** — Memory → Walrus verification. The relayer's own inventory shows what is stored; **Restore from Walrus** rebuilds the ledger on a fresh install.
13. **Ask about the past** — “What did you tell me last time I asked about sending money?” recalls the decision journal.

## How memory changes a decision

Lessons are stored twice, deliberately:

- **Authoritative typed rule** in the user's database row (`AMOUNT_CAP`, `RESERVE_COMMITMENT`, `EXCLUDE_EXPECTED_INCOME`, `PAYOUT_DEDUCTION`, `ROUTE_PENALTY`, `ROUTE_PREFERENCE`, `BUFFER_FLOOR`, `SPLIT_TRANSFER`, `DELAY_REMAINDER`, `SPEND_LIMIT`, `SUBSCRIPTION_WATCH`).
- **Portable self-describing text** on Walrus, including the rule JSON and scope, so a recalled blob can be understood without this app.

On recall, the database rule wins; the Walrus text is a fallback. That keeps memory usable across tools while preventing a malformed blob from silently rewriting financial logic.

Walrus blobs are immutable, so a lesson's later changes are **appended**, not overwritten: confidence moves, replaced rules and exclusions are written as updates to `<namespace>-updates`. A restore replays them newest-wins, so a fresh install gets back the current state *and* the track record — not a stale snapshot, and never a replaced rule as active.

Memory is also **accountable**. Each outcome writes a `MemoryEvidence` verdict for every lesson that shaped the decision. Held lessons gain confidence (toward 0.95), contradicted ones lose it (toward 0.10), and confidence already weights how strongly a rule acts in the cash-flow and route engines — so a lesson that keeps working gets more say, and one that failed gets less, without anything being deleted.

Per-account namespace: `sha256("landed:email:" + normalized sign-in email)` rendered as `landed-<24 hex>` (journal entries use `<namespace>-journal`), derived server-side. Using the sign-in rather than the database row id is what makes memory portable: a fresh install or a new device recalls the same lessons. Every database query is still scoped by `userId`; Walrus is never the authorization boundary.

## Architecture

- **Next.js 16.4 App Router**, React 19, TypeScript, Tailwind v4, Recharts, Lucide.
- **Prisma 6 + SQLite** locally; schema is PostgreSQL-portable (see [docs/setup.md](docs/setup.md)).
- Cookie sessions, scrypt password hashing, hashed tokens, SameSite cookies, origin checks on writes, rate limits.
- API handlers centralize auth, validation, error mapping, and ownership checks.
- **No floating-point money.** Parsing, rounding, caps, reserves, and comparisons use integer minor units.

More detail: [architecture](docs/architecture.md) · [setup and deployment](docs/setup.md) · [demo script](docs/demo-script.md) · [technical blog](docs/blog.md) · [submission checklist](docs/submission.md).

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm setup` | Generate client, push schema, seed demo |
| `pnpm db:reset` | Force-reset local DB and reseed |
| `pnpm demo:snapshot` | Print the demo account's headline numbers and Spend Watch state |
| `pnpm walrus:verify` | Check credentials/relayer, list confirmed blob IDs, cross-check the relayer's own inventory, require 10 by default |
| `pnpm walrus:verify --min=0` | Same checks without the 10-write minimum |
| `pnpm walrus:backfill --dry-run` | Show lessons eligible for a Walrus retry |
| `pnpm walrus:backfill` | Retry pending/failed/blocked non-synthetic lessons |
| `pnpm walrus:backfill --include-synthetic` | Explicit opt-in for demo lessons (public, permanent blobs) |

## Deployment

A `Dockerfile`, `.dockerignore`, and `railway.json` are included. SQLite needs a persistent volume mounted at `/app/prisma`; for a managed deployment, switch Prisma to PostgreSQL as described in [docs/setup.md](docs/setup.md). Server-only keys must never be prefixed with `NEXT_PUBLIC_`.

## Honest limitations

- Demo balances and history are synthetic; they are labelled in the UI, the export, and every seeded memory.
- No confirmed Walrus Mainnet writes exist in this checkout because no credentials are configured. The app does not count local rehearsal lessons as writes.
- There is no live bank or payout-provider integration. Route quotes are seeded or user-entered and labelled accordingly.
- FX conversion is deliberately absent unless a sourced rate is supplied. LANDED shows per-currency balances instead of inventing a rate.
- Advice Autopsy separates observed facts from hypotheses. A single outcome is never presented as proof of causality.

## Hackathon requirement map

| Requirement | Implementation |
| --- | --- |
| Genuinely recalled memory changes advice | Seeded `AMOUNT_CAP` + route preference move `$300` → `$150 now / $150 later`; every applied rule carries its memory ID |
| ≥10 confirmed Walrus Mainnet memories | Ready via `pnpm walrus:backfill` (26 eligible records: lessons + journal, then their track-record updates); drafts and rejected lessons are never written. `pnpm walrus:verify` enforces the count against both the ledger and the relayer inventory. **Blocked here: credentials absent** |
| Tatum Data APIs | `/v4/data/rate/symbol/batch` for sourced SUI/stablecoin valuations and gas in USD |
| "Keeps scores, preferences, and reasoning across sessions" | Scores: memory track record. Preferences: typed rules (`SPEND_LIMIT`, `BUFFER_FLOOR`, …). Reasoning: decision journal. Across sessions and devices: email-derived namespace + Restore from Walrus |
| "Sharper every week" | Weekly learning curve: rules in force and advice outcomes, plus confidence that moves with evidence |
| Web2 welcome / blockchain invisible | Dollars-first UI; Sui and Walrus details live under proof panels; landing page leads with everyday benefits |
| Memory ID, category, status, blob, decision, timestamp | Memory ledger and `/api/memories/verify` |
| Real Tatum Sui reads | `sui_getLatestCheckpointSequenceNumber`, balances, owned objects, transaction blocks through Tatum only; digests re-verified server-side before an outcome is `onchain_verified` |
| Consumer Finance track: spend tracking, subscriptions with learned limits | Spend Watch: recurring-charge detection, category pacing, `SPEND_LIMIT` / `SUBSCRIPTION_WATCH` memories, memory-only alerts, Ask LANDED purchase checks |
| Apps that learn over time | Memory track record: outcome verdicts per lesson, bounded confidence updates that change future rule strength, needs-review flag |
| Advice Autopsy | Predicted vs observed, errors, confirmed causes, hypotheses, draft lessons |
| Learning Replay | Identical snapshot, baseline vs informed, memory cutoff clamped to decision time |
| No fabricated confirmations | `confirmed` requires a returned blob ID / onchain digest; otherwise `blocked`, `failed`, or `unverified` |
| Integer money, deterministic math | `src/lib/money.ts`, `src/server/engine/*`; tests cover parsing, caps, reserves, ranking |
| Per-user authorization, server-side keys | Every query scoped by `userId`; tests cover cross-user denial; keys server-only |
