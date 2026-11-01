# Building LANDED: advice that changes after the outcome

Most "AI finance" products generate a confident answer and then forget it ever happened. LANDED starts from the opposite end: a recommendation is a hypothesis, and the product only earns the right to improve after the user reports what actually happened.

This is the story of the decisions behind it, including the parts that are deliberately blocked.

## The product question

"What is safe to move?" sounds simple until you try to answer it honestly.

A checking balance is not available cash. Rent is due. A card bill lands before payroll. Groceries exist. Expected income is a forecast, not money. A remittance quote advertises a fee but the recipient receives less. And last month's transfer that looked fine may have caused a shortfall two weeks later.

LANDED turns those into one deterministic pipeline:

1. Build an immutable snapshot of the user's financial context.
2. Simulate the next 45 days.
3. Protect essential obligations, savings contributions, near-term spending, and a buffer.
4. Rank routes on the amount that actually lands.
5. Apply typed lessons recalled from memory.
6. Preserve both the memory-informed action and the no-memory baseline.

The baseline matters. Without it, "the app learns" is a marketing claim. With it, every decision can show exactly what memory changed.

## Money is integers, not vibes

The first rule: no floating-point money and no LLM arithmetic.

`src/lib/money.ts` parses human input into integer minor units, handling `1,234.56`, `1.234,56`, zero-decimal currencies like JPY, and explicit rounding. Caps, reserves, rate application, and comparisons operate on integers. The language model, when enabled, only explains a result the engine already computed.

This is not ceremony. A 50% cap that drifts by a cent under float arithmetic is still a cap the user did not approve. It also makes tests meaningful: expected values are exact integers.

## The cash-flow bug that changed the design

The first simulation advanced recurring bills one day at a time:

```ts
nextDueDate(addDays(dueDate, 1), "monthly", asOf)
```

For rent due in 11 days, the next occurrence became "tomorrow", then the next, and the projected balance collapsed. The dashboard looked catastrophic for a user with a healthy balance.

The fix was to advance from the due date by the actual recurrence interval, and to cap the horizon explicitly at 45 days. A monthly bill now appears twice if it genuinely recurs inside the horizon. The test suite asserts a 28–31 day gap between rent events — not just that the numbers are positive.

A second bug was subtler. Daily variable spending was divided by the number of days that contained transactions. A weekly grocery run became an enormous daily burn. The correct denominator is the 90-day observation window. Both bugs were caught by treating the simulation as a product surface, not an implementation detail.

## Memory needs two representations

A memory that only lives in a vector database is hard to audit and impossible to apply deterministically. A memory that only lives in a local table is not really portable.

LANDED stores both:

- **Authoritative typed rule** in the database: `AMOUNT_CAP`, `RESERVE_COMMITMENT`, `EXCLUDE_EXPECTED_INCOME`, `PAYOUT_DEDUCTION`, and so on.
- **Portable text** on Walrus, containing the memory ID, category, timestamps, decision reference, confidence, summary, lesson, rule JSON, conditions, and an explicit scope warning.

On recall, the database rule wins. The Walrus text is a fallback. If a blob is restored without a local row, it is treated as rule-less, hypothesis-level text — useful context, never an authoritative instruction.

The namespace is derived server-side: `landed-<sha256("landed:account:" + userId).slice(0, 24)>`. A delegate key can read every namespace, so Walrus is not the authorization boundary. Every query is scoped by `userId` in the database.

## Confirmed means confirmed

The hardest product constraint was honesty. It is easy to build a demo where a button says "Saved to Walrus" and nothing happened. LANDED distinguishes:

- `confirmed` — Walrus returned a blob ID; the ID and timestamp are stored.
- `writing` / `pending` — in progress, not counted.
- `blocked` — credentials missing; nothing was attempted.
- `failed` — the attempt failed; the error is retained.
- `local_rehearsal` — stored locally and clearly not a Mainnet write.

Without credentials, LANDED reports **0 confirmed Mainnet memories** rather than pretending. On the live deployment, the demo account has **25 confirmed Mainnet writes** (for example blob `yp3OTZo5P24Krq7TfdFGeRebRgAsI4VAVJnav338-9c`). `pnpm walrus:verify` doesn't trust LANDED's own records: it checks them against the relayer's inventory, which lists all 25.

Synthetic lessons are skipped by default during backfill. Walrus blobs are encrypted but permanent; writing fabricated history to Mainnet should be an explicit choice, not a side effect of a demo.

## Replay must not leak the future

A learning replay is easy to fake. Run the current engine with all current memories, compare it to the original answer, and declare improvement. That is not a replay; it is a time machine with hindsight.

LANDED reuses the stored input snapshot for both arms. The baseline arm gets no memories. The informed arm gets only memories created at or before a cutoff. The default cutoff is the decision's creation time. A requested cutoff later than the decision is clamped, and the response says so. An invalid cutoff is rejected rather than silently replaced with "now".

The result includes `modeledRiskDelta` labelled as a counterfactual model difference, not a measured real-world improvement. Actual improvement is only available for evaluated decisions, with observed values.

## Autopsy separates facts from stories

When a transfer misses, there are arithmetic facts: the fee was $14.80 instead of $0.99, the recipient received $13.81 less, delivery took 31 hours instead of 4, the buffer fell below zero.

Then there are hypotheses: an intermediary took a cut, the provider's batch cutoff slipped, the salary arrived late. LANDED records both but never merges them. A single outcome cannot prove causality, and the UI says so.

Draft lessons are generated from errors. They stay drafts until a user confirms, rejects, or corrects them. Only confirmed lessons can be written to Walrus and applied to future decisions.

## Routes: compare what lands

A fee comparison is not a route comparison. LANDED ranks on expected recipient amount first, then total cost, speed, observed reliability, and quote freshness. Quotes for different corridors or different send amounts are refused rather than normalized into a misleading comparison.

Recalled `PAYOUT_DEDUCTION` lessons reduce the expected received amount. `ROUTE_PENALTY` lessons demote a provider. The UI shows whether a quote is live provider pricing, user-entered, or demo data.

## Limits it learned from you, not from averages

Most budgeting apps nag from averages: "you spent 23% more on dining." LANDED's Spend Watch notices the same things — recurring charges from a fixed price on a schedule, categories pacing above a usual month — but treats them as *proposals*. Only a limit or a subscription price you chose to remember can raise an alert. The no-memory view has zero alerts by construction, so the difference memory makes is countable on screen: *alerts with memory: 2 · without memory: 0*.

Each alert names the memory behind it: "Streaming bundle charged $21.99 — you approved $18.00 (memory …, Aug 29)." Approving the new price writes a new memory and supersedes the old one, so the history of what you agreed to survives. The same rules reach the assistant: ask whether you can spend $60 on dining and LANDED answers that cash flow allows it but your own limit does not.

## Memory that can be wrong

A lesson confirmed once is still a hypothesis about the future. So every outcome now judges the lessons that shaped its decision. A cash rule held if the buffer held; a route lesson held if the route delivered what the memory-adjusted prediction said. Held lessons gain confidence, contradicted ones lose it, and confidence already weights how strongly a rule acts, so a lesson that keeps working gets more say and one that failed gets less, without anyone deleting it. The Memory page shows each lesson's track record: verdicts, reasons, confidence before and after.

## Tatum as the evidence layer

When a move settles on Sui, the user can paste the digest. LANDED reads it through Tatum's Sui GraphQL gateway (the transaction's effects, balance changes and gas), shows the settlement status, balance changes and gas, and fills the facts that are in the decision's currency. On save, the server reads the digest again rather than trusting the browser's claim: only a successful transaction can mark an outcome `onchain_verified`, and lessons drafted from it carry `verified_onchain` evidence. Tatum is what turns "the user says it arrived" into "the chain says it settled".

## Total Recall means a new phone, not a new you

The namespace is bound to the authenticated account ID, rather than an email address that has not been verified. This keeps lessons available across devices for the same account, while preventing a newly created account from claiming old memory merely by reusing its email. A new account cannot restore the old namespace; previously saved local lessons can be published into the current namespace. **Restore from Walrus** re-indexes and recalls available lessons for the current account, and relayer inventory reports which blobs are stored.

## Immutable memory, changing minds

Walrus blobs cannot be edited, but a lesson's standing changes: it gains or loses confidence, or a newer rule replaces it. Overwriting is impossible and pretending would be wrong, so LANDED appends. Each change is written as a small update memory, and a restore replays them newest-wins. The first version only changed the database; a restore would have brought back stale confidence and revived replaced rules as active. Now the track record itself lives on Walrus. Spend Watch also stopped reading rules straight from the database: it recalls them from Walrus on every check and labels each alert with where its rule actually came from.

## Scores, preferences, and reasoning

The hackathon brief says memory should keep scores, preferences, and reasoning. LANDED maps them literally. Preferences are the typed rules you approve. Scores are each lesson's track record. Reasoning is an opt-in decision journal: every answer's question, advice and reason, written to its own namespace so it can be recalled ("what did you tell me last time?") but can never act as a rule.

## Tatum Data API: a rate, or nothing

LANDED refused to convert currencies because it had no sourced rate. Tatum's Data API supplies one. SUI and stablecoin balances, and Sui gas on an outcome, now show a dollar value with the rate's source and time. The rate is kept as the decimal string Tatum returned and applied with integer arithmetic, and the converted value is never counted as spendable cash.

## What is intentionally absent

- **No bank connection.** Balances are self-reported, CSV-imported, or verified onchain. A fake "connected" state would undermine every number downstream.
- **No invented FX rates.** Balances are shown per currency; conversion requires a sourced rate.
- **No AI-authored decisions.** The optional AI layer explains; it does not calculate or write memory.
- **No auto-confirmed lessons.** Outcomes propose; humans confirm.

## Testing the claims

The test suite covers the parts that are easy to hand-wave:

- money parsing, zero-decimal currencies, unsafe input, formatting
- buffer protection, expected-income exclusion, amount caps, commitment reserves
- recurring bills inside the horizon and shortfall detection
- route ranking, payout deductions, expired quotes, incompatible corridors
- outcome evaluation, lesson extraction, portable rule parsing
- replay cutoff clamping and invalid cutoff rejection
- cross-user denial for decisions, replay, outcomes, memories, and exclusions using a throwaway database
- recurring-charge detection (including not mistaking groceries for a subscription), memory-only alerts, newest-rule-wins, purchase checks against a learned limit
- track-record verdicts for cash and route rules, bounded confidence updates, and the needs-review threshold
- BigInt rate conversion and rounding; portable lesson, update and journal text round trips, including corrupted rules
- Walrus end to end against the SDK's own `MemWalMock`: confirmed writes and relayer inventory, drafts never written, Spend Watch recall coverage, update flushing, journal recall, and a same-account restore that rebuilds lessons, their latest state and the track record — verified to fail if update replay is disabled

The authorization test is an integration test on purpose. Cross-user isolation is a property of the `where` clauses; mocking Prisma away would test nothing.

## What comes next

The obvious next step is real credentials: a Tatum key for verified Sui reads and a Walrus delegate key for confirmed Mainnet memories. The app is built to make that transition visible rather than silent: blocked becomes writing, writing becomes confirmed, and the ledger shows the blob ID.

The deeper product question is not "can it remember?" but "when should it change its mind?" LANDED's answer is conservative: one observed outcome proposes a lesson, a human confirms it, the rule is typed and portable, and every future decision can show the memory that moved it. That is slower than auto-learning. It is also the only version that can be audited.
