# LANDED architecture

## 1. System shape

```
Browser
  │  cookie session (landed_session, httpOnly, SameSite=Lax)
  ▼
Next.js App Router
  ├── Server components: requireUser() → Prisma, all reads scoped by userId
  ├── Client views: forms → /api/* (origin checked, Zod validated)
  └── Services
        ├── financial.ts   context, snapshots, dashboard
        ├── decisions.ts   generate, follow, outcome, autopsy, replay
        ├── memory.ts      Walrus write/recall, namespace, ledger verification
        ├── tatum.ts       verified Sui reads (server key only)
        ├── community.ts   consent-gated aggregates
        └── metrics.ts     learning metrics
  ▼
SQLite/Postgres (authorization boundary, authoritative typed rules)
  +
Walrus Memory (public, portable lesson text; per-user namespace)
```

The database is the source of truth for ownership. Walrus is a durable, portable memory store; a delegate key can read every namespace, so Walrus is never used to enforce authorization.

## 2. Money and time

- All amounts are integer **minor units**. `src/lib/money.ts` parses human input without floating-point drift, handles decimal-comma input, zero-decimal currencies (JPY/KRW/VND), and rejects unsafe integers.
- Percentages are applied with explicit rounding (`Math.round`, `Math.floor` to a currency step), never hidden float arithmetic.
- The cash-flow simulation covers **45 days** from the decision date. Monthly commitments recur inside the horizon; a monthly rent due in 11 days appears twice, not once.
- Variable spending is a 90-day trailing average divided by the **90-day window**, not by transaction-days. This avoids overstating a weekly grocery run as a daily cost.
- Expected income is excluded by default. If enabled, it is weighted by observed reliability and reduced by a further 20%. A recalled rule can still exclude it.

## 3. Decision pipeline

`buildDecisionInput(userId, request)` creates an immutable `DecisionInputSnapshot`:

- as-of timestamp, currency, requested amount, decision type
- source account, destination
- route quotes normalized to the requested amount, with observed reliability
- accounts, commitments, goals, expected income
- safety buffer, risk posture, cash-flow statistics, previous shortfalls
- `memoryCutoff` and `engineVersion`

`decide(snapshot, memories)` is a pure function:

1. `computeCashFlow` simulates the horizon with memory adjustments.
2. `safeToMoveMinor` protects cleared balance, essential/important bills, savings contributions, 14 days of variable spending, and the buffer.
3. A transfer is evaluated against the timeline to find shortfall risk.
4. `rankRoutes` scores quotes on realized recipient amount, total cost, speed, observed reliability, and freshness.
5. Memory rules adjust the amount (caps, reserves), income treatment, route expected received amount, and route scores.
6. The result contains both `action` (memory-informed) and `baselineAction` (no memory), plus per-adjustment `memoryId`/`memoryBlobId`.

This baseline is stored alongside every decision, which is why the product can always show *what memory changed* rather than claiming improvement after the fact.

## 4. Route ranking

Quotes must share one currency corridor and one send amount; otherwise ranking is refused with an explanation. Expired quotes are excluded. Scores combine:

- recipient amount (largest weight)
- total cost (fee + network fee)
- delivery speed
- smoothed observed reliability (prior 0.5, sample-size weighted)
- quote freshness

Then memory applies:

- `PAYOUT_DEDUCTION`: reduce expected received amount by the observed percentage × confidence.
- `ROUTE_PENALTY`: subtract score × confidence; optional fee/delivery multipliers.
- `ROUTE_PREFERENCE`: add score × confidence.

The UI always shows whether a quote is live provider pricing, user-entered, or demo data.

## 5. Outcome learning loop

```
decision (snapshot + recommendation + baseline + prediction)
   │ follow
   ▼
movement (planned → settled)
   │ user records observed result
   ▼
evaluateOutcome(predicted, observed)
   ├── status: achieved | partial | missed | inconclusive
   ├── numeric errors: fee, received, delivery, buffer
   ├── confirmed causes (direct arithmetic facts)
   └── hypotheses (possible explanations, explicitly not proven)
   │
   ▼
extractLessons(...) → draft lesson candidates (never auto-confirmed)
   │ user confirms / rejects / corrects
   ▼
MemoryRecord (typed rule + portable text)
   │ writeMemoryToWalrus
   ▼
Walrus blob ID → status confirmed

…and on the *next* outcome:

recordMemoryEvidence(decision.memoryReferences, evaluation)
   ├── assessMemory(rule, confidence, evaluation) → held | contradicted | inconclusive
   ├── MemoryEvidence row (verdict, reason, confidence before → after)
   └── MemoryRecord.confidence updated
```

**Track record (`src/server/engine/evidence.ts`).** Cash rules (`AMOUNT_CAP`, `BUFFER_FLOOR`, `RESERVE_COMMITMENT`, `EXCLUDE_EXPECTED_INCOME`, `SPLIT_TRANSFER`, `DELAY_REMAINDER`) are judged on whether the buffer held; route rules on whether the memory-adjusted route delivered the predicted amount on time. A held verdict moves confidence 25% of the way toward 0.95; a contradicted one moves it 30% of the way toward 0.10. Confidence already weights how strongly each rule acts in `computeCashFlow` and `rankRoutes`, so the track record changes future advice. A contradicted lesson below 0.5 is flagged *needs review*; nothing is auto-deleted. Verdicts are idempotent per (memory, decision).

Rules currently supported:

| Rule | Effect |
| --- | --- |
| `AMOUNT_CAP` | Cap a single move at a percentage of safe-to-move |
| `SPLIT_TRANSFER` | Recommend splitting, remainder after income when available |
| `RESERVE_COMMITMENT` | Reserve an extra percentage of a matching bill inside N days |
| `EXCLUDE_EXPECTED_INCOME` | Ignore income below a reliability threshold |
| `BUFFER_FLOOR` | Raise the protected buffer |
| `DELAY_REMAINDER` | Wait for income before the remainder |
| `ROUTE_PENALTY` / `ROUTE_PREFERENCE` | Adjust route scores |
| `PAYOUT_DEDUCTION` | Reduce expected recipient amount |
| `SPEND_LIMIT` | Monthly category limit; Spend Watch paces and alerts against it, Ask LANDED checks purchases against it |
| `SUBSCRIPTION_WATCH` | Approved price for a recurring merchant; a charge above it (beyond tolerance) raises an alert |

### Spend Watch (`src/server/engine/spending.ts`)

Deterministic and integer-only. Recurring charges are detected per merchant from a regular schedule (weekly 6–8 days, monthly 25–35, yearly 350–380; every gap within 20% of the median) and a fixed price (earlier charges within 3%; the latest may differ — that is the price change). Rent and utilities are excluded because the cash-flow engine already protects them. Category pacing compares month-to-date against a remembered `SPEND_LIMIT`, or the trailing three-month average when no limit exists, with linear projection only after day 7.

Heuristics only ever produce **proposals**. **Alerts** are raised exclusively by confirmed `SPEND_LIMIT` / `SUBSCRIPTION_WATCH` memories, so each alert carries the memory ID (and blob ID once written) that caused it, and the no-memory view has zero alerts by construction. Remembering a proposal, or updating a rule, creates a new confirmed memory and supersedes the old one; history is never rewritten.

### Total Recall, inventory and the decision journal

- **Namespace** = `sha256("landed:email:" + normalized sign-in email)` → `landed-<24 hex>`. Deriving it from the sign-in rather than the database row id makes memory portable across devices and fresh installs. Journal entries use `<namespace>-journal`, so they are never recalled as rules.
- **`walrusInventory`** walks `listMemories()` and counts blobs in both namespaces, then compares them with locally confirmed blob IDs (`matched`, `onlyOnWalrus`, `onlyLocal`). `pnpm walrus:verify` requires the minimum against both the ledger and this inventory.
- **`restoreFromWalrus`** calls `restore(namespace)` so the relayer re-indexes any blobs it is missing, recalls LANDED's portable lesson texts with several broad queries, and recreates or re-links rows it does not have. `parsePortableLesson` is the exact inverse of `formatMemoryText` (tested as a round trip), so a recovered lesson's typed rule changes advice again.
- **Lesson updates** (`MemoryUpdate`, `<namespace>-updates`): Walrus blobs are immutable, so every change to a written lesson — a track-record confidence move, supersession, exclusion — is appended as a self-describing update (`formatLessonUpdate`). Updates to a lesson that is not on Walrus yet wait for it. `flushLessonUpdates` runs after the response (`after()`) and in `walrus:backfill`. Lesson text also carries `status` and `superseded_by`, so even a lesson first written after it was replaced restores correctly. Restore replays updates with `latestLessonState` (newest wins) and rebuilds `MemoryEvidence` from verdicts.
- **Spend Watch recall** (`recallRuleMemories`): rules are recalled from Walrus each time; every active rule is labelled `walrus` (returned by this recall) or `local` (not written yet, or missed). Coverage is reported, never assumed.
- **Write guard**: `writeMemoryToWalrus` refuses drafts and rejected lessons; only `user_confirmed` lessons and `verified` journal entries leave the ledger.
- **Decision journal** (opt-in consent `decision_journal`): after each live decision, `after()` writes the question, advice, baseline and reason as a `reasoning` record. It has no typed rule and is excluded from rule recall; `recallJournal` answers "what did you tell me last time?".

### Learning curve

`getLearningCurve` buckets the last six weeks by when advice was given: outcomes and how many achieved their goal, track-record verdicts, lessons learned, and confirmed rules in force at week end. The summary reports what happened after the most recent miss rather than a first-versus-last percentage, which small samples would make misleading.

### Tatum Data API rates

`src/server/services/rates.ts` calls `POST /v4/data/rate/symbol/batch` (60-second cache) and keeps each rate as the decimal string Tatum returned, with its source and timestamp. `convertToMinor` converts base units to cents with BigInt arithmetic and half-up rounding. Converted values are reference only (dashboard balances, gas in USD) and never enter safe-to-move.

### Tatum-verified outcomes

`POST /api/tatum/transaction` reads `sui_getTransactionBlock` through Tatum and returns settlement status, sender, per-owner balance changes and net gas (computation + storage − rebate, in SUI). The outcome form can fill amount sent, received and delivery hours from it, but only for balance changes already in the decision's currency; SUI gas is shown, never converted. On save, the outcome route re-reads the digest server-side: a non-success transaction is refused, and `onchain_verified` can no longer be claimed by the client. Lessons drafted from a verified outcome are tagged `verified_onchain` with slightly higher confidence.
## 6. Walrus Memory integration

`MemoryRecord` stores:

- category, summary, lesson, confidence, verification status
- `structuredRule` JSON (authoritative)
- conditions, evidence references, original expectation, actual outcome
- namespace, `walrusBlobId`, job ID, owner, write status, error
- supersession and exclusion fields

Write path:

1. If not configured → `blocked` with a precise missing-env message. No blob is invented.
2. Mark `writing`.
3. Build portable text containing the memory ID, category, timestamps, decision ID, confidence, summary, lesson, rule JSON, conditions, and a scope warning.
4. `rememberAndWait(text, namespace, { idempotencyKey, timeoutMs })`.
5. Store the returned blob ID and mark `confirmed`; append an audit event.
6. On error → `failed` with the error, still not counted as a write.

Recall path:

1. Query locally owned, non-excluded, non-superseded, verified/user-confirmed memories created at or before the cutoff.
2. If Walrus is configured and reachable, request semantic recall from the per-user namespace.
3. Match hits to local records by blob ID or embedded memory ID; rehydrate the authoritative typed rule.
4. Blobs restored from Walrus without a local row are kept as text with a hypothesis-level, rule-less memory — never trusted as an authoritative rule.
5. If Walrus is unavailable, use local records and label the mode `local_rehearsal`.

Namespace: `landed-<sha256("landed:"+userId) first 24 hex>`, computed server-side.

## 7. Advice Autopsy and Replay

Autopsy shows the original recommendation and prediction, the observed result, absolute and relative errors, confirmed causes, hypotheses, and draft lessons. Settled outcomes cannot be overwritten; re-evaluation is a deliberate, separate flow.

Replay:

- Reuses the stored `inputSnapshot` for both arms.
- Baseline arm uses no memories; informed arm uses memories available at the cutoff.
- Default cutoff is the decision's `createdAt`.
- A requested cutoff later than the decision is **clamped**, with an explicit note; an invalid cutoff is rejected.
- `modeledRiskDelta` is labelled as a counterfactual model difference, not a measured real-world improvement.

## 8. Authorization and security

- Session tokens are random 32-byte values; only SHA-256 hashes are stored.
- Passwords use scrypt with per-user salt.
- Cookies: httpOnly, SameSite=Lax, `secure` in production.
- State-changing API routes check the `Origin` header against `Host`.
- Zod validates every body; errors are mapped to 400/401/403/404/429/503 without leaking internals in production.
- Every financial query includes `userId`; mutations first fetch with `{ id, userId }`, then update.
- Cross-user access tests cover decisions, movements, replay, outcomes, memories, and exclusions.
- Tatum and Walrus credentials are read only on the server, never exposed to client components.

## 9. Honesty states

| State | Meaning |
| --- | --- |
| `confirmed` | Walrus returned a blob ID (memory) or a transaction digest is recorded (onchain) |
| `pending` / `writing` | In progress; not counted |
| `blocked` | Required configuration missing; nothing was attempted |
| `failed` | Attempt failed; error retained |
| `local_rehearsal` | Lesson stored locally and explicitly not a Mainnet write |
| `unverified` | Self-reported balance or outcome without external proof |

## 10. Data model (principal tables)

- `User`, `Session`
- `FinancialAccount`, `Transaction`, `Commitment`, `SavingsGoal`
- `PaymentRoute`, `RouteQuote`, `RouteObservation`
- `FinancialDecision`, `DecisionOutcome`, `MoneyMovement`
- `MemoryRecord`, `Consent`, `CommunityRouteStatistic`
- `ImportBatch`, `AuditEvent`

All money columns are integers. JSON payloads are stored as text for SQLite/Postgres portability and parsed through typed helpers. The schema switches to PostgreSQL by changing the datasource provider.
