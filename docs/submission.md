# Total Recall submission checklist

Track: **Consumer Finance Apps** (Tatum × Walrus Total Recall, submissions close 10 Nov 2026, 17:00 UTC).

## Official checklist

| # | Requirement | Where it is in LANDED | Status |
| --- | --- | --- | --- |
| 1 | Walrus Memory integrated and writing on Mainnet | `src/server/services/memory.ts` — `rememberAndWait`, `recall`, `restore`, `listMemories` via `@mysten-incubation/memwal` | Code ready. **Needs `MEMWAL_PRIVATE_KEY` + `MEMWAL_ACCOUNT_ID`.** |
| 2 | Tatum RPC used for onchain data | `src/server/services/tatum.ts` — Sui JSON-RPC (checkpoint, balances, coin metadata, transaction blocks); `src/server/services/rates.ts` — Data API rates | Code ready. **Needs `TATUM_API_KEY`.** |
| 3 | At least 10 memories stored on Mainnet | `pnpm walrus:backfill` writes the 21 lessons and 5 journal entries; `pnpm walrus:verify` checks the ledger *and* the relayer's own inventory | Blocked on credentials (1) |
| 4 | Published blog post | Draft: [docs/blog.md](blog.md) | Publish (Medium, Mirror, dev.to, or similar) |
| 5 | Working demo and public repo | Dockerfile + `railway.json`; with `LANDED_SEED_DEMO=true` the demo is seeded once and its dates roll forward, so it reads the same on judging day | Deploy, record video, push repo |
| 6 | Optional: Tatum AI Builder | Not used. LANDED is an indie build; the AI Builder award is a separate $500 path inside ai.tatum.io | Skipped by design |

## The four pillars in the brief

| Pillar | What a judge will see |
| --- | --- |
| **Apps that remember** — "scores, preferences, and reasoning across sessions… sharper every week" | *Preferences*: typed rules and Spend Watch limits. *Scores*: each lesson's track record (held / contradicted, confidence before → after). *Reasoning*: the decision journal. *Sharper every week*: the learning curve on Overview and Memory. *Across sessions*: email-derived namespace + **Restore from Walrus**. |
| **Real stack** — "Memory on Mainnet. Tatum Sui RPC and Data APIs" | Walrus `rememberAndWait` / `recall` / `restore` / `listMemories`; Tatum Sui RPC for balances, history and settlement evidence; Tatum Data API for sourced exchange rates. |
| **Web2 welcome** | Dollars-first app; no wallet needed; chain details only appear as proof. Landing page leads with everyday benefits. |
| **Tatum AI Builder** (optional) | Not used — see row 6 above. |

## Judging criteria → evidence

| Weight | Criterion | Strongest evidence |
| --- | --- | --- |
| 30% | Walrus and Tatum integration | Append-only lesson updates on Walrus with newest-wins restore; Spend Watch rules recalled from Walrus with visible coverage; memory changes advice ($300 → $150 now / $150 later; Spend Watch alerts exist only because of memory); Restore from Walrus; relayer inventory check; Tatum RPC settlement verification re-checked server-side; Tatum Data API rates |
| 30% | Technical quality | Integer money end to end (BigInt rate conversion); 80 tests including Walrus flows against the SDK's MemWalMock; deterministic engines; per-user authorization tested against a real database; no fabricated confirmations |
| 20% | Creativity | Memory that keeps a track record and loses confidence when wrong; alerts only from rules you chose; a journal you can ask about |
| 20% | Presentation | [Demo script](demo-script.md), [blog](blog.md), README requirement map, honest status labels in the UI |

## Before you submit

1. Create a Walrus Memory agent at the Memory dashboard. Put the **delegate** private key in `MEMWAL_PRIVATE_KEY` and the account ID in `MEMWAL_ACCOUNT_ID` (the delegate public key is the `MEMWAL_AGENT_ID` the form asks for).
2. Create a Tatum key and set `TATUM_API_KEY` (the dashboard account ID goes on the form).
3. Write memories and verify:
   ```bash
   pnpm walrus:backfill --include-synthetic
   pnpm walrus:verify
   ```
4. In the app, open **Memory → Walrus verification**: lessons and journal entries on Walrus should match the ledger. Optional proof of portability: point a fresh database at the same credentials, sign in with the same email, click **Restore from Walrus**.
5. Settings → Integrations: Tatum RPC reachable, Data API shows a live SUI/USD rate.
6. Deploy, record the demo following [demo-script.md](demo-script.md), publish the blog, push the repo.
7. Bonus points: post on X or LinkedIn tagging @Tatum_io and @WalrusFoundation.
