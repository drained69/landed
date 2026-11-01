# LANDED — 2–3 minute demo script

Before recording, use a dedicated demo database. The reset command below deletes all records in the configured database:

```bash
pnpm db:reset
pnpm dev
```

Use a fresh browser profile or sign out so the demo starts at the marketing page. Figures and integration status depend on the seed, current date, and configured services. Check the displayed values before recording; do not present these examples as guaranteed results.

---

## 0:00–0:15 — Open

**Screen:** landing page.

> "LANDED answers a question most finance apps dodge: what is *actually* safe to move right now? And it remembers what happened last time."

Click **Open demo account**.

---

## 0:15–0:40 — The real picture

**Screen:** Overview.

Point at:

- **Safe to move now** and **Cleared**
- Protected commitments, near-term spending, and the safety buffer
- Any applied lessons and the displayed memory retrieval status

> "The balance is not the answer. Rent, bills, spending, and a buffer are protected first. And one recalled lesson already caps this move at 50% of safe-to-move."

> "The status shows whether the lessons came from Walrus or from this account’s saved records."

---

## 0:40–1:10 — Plan the move

Click **Plan**.

- Type: **Send**
- Amount: **$300**
- Recipient: **Sister**
- Leave **Count expected income** off.
- Click **Evaluate this move**.

Point at the result:

- The recommendation and the **no-memory baseline**
- Applied lessons with memory references: amount cap and route adjustment
- Route comparison on realized recipient amount

> "This comparison shows how confirmed lessons affect the recommendation. Each adjustment explains which lesson caused it."

---

## 1:10–1:35 — Spend Watch: limits it learned from you

Click **Spend Watch**.

Point at:

- **Alerts with memory: 2 · Without memory: 0**
- **Streaming bundle charged $21.99 — you approved $18.00**, with the memory chip that caused it
- **Dining is over your $120.00 limit**, again naming the remembered rule
- **LANDED noticed**: FitClub and CloudBox detected as recurring charges, plus suggested limits — none of them alert yet

> "LANDED notices patterns on its own, but it only *alerts* on things you told it to remember. Averages never nag you. Every alert names the memory behind it."

Click **Remember $90.00 limit** on transport. A third alert appears immediately, attributed to the new memory, and the Walrus write status is shown honestly.

Open **Ask LANDED** → “Can I spend $60 on dining tonight?”

> "Cash-wise it's fine. By the rule you gave me, it's a no — and it says which rule."

---

## 1:35–1:55 — Autopsy and replay

Open the decision, then **Learning replay**.

Point at:

- Baseline **$300.00** vs informed **$150.00**
- Identical input snapshot
- Cutoff equals the decision time; a later cutoff is clamped
- Memory list used by the informed arm

> "Replay is not a victory lap. Both arms use the identical snapshot. The only difference is which memories existed at the decision time, so a lesson learned afterwards cannot leak backwards."

Switch to **Autopsy**.

> "When an outcome is recorded, LANDED separates arithmetic facts from hypotheses. A missed buffer is a fact. 'The salary was late' is a hypothesis unless the user confirms it. Lessons stay drafts until a human approves them."

---

## 1:55–2:20 — The memory ledger and its track record

Click **Memory**.

Point at:

- **26 records**, **25 confirmed Mainnet writes** (each with a Walrus blob ID), 1 superseded lesson kept locally
- **Getting sharper every week** chart: rules in force grow from 1 to 20; the week of the shortfall shows a red miss, and the advice after it worked
- **Track record** tab: lessons tested by later outcomes, **6 verdicts held, 0 contradicted**, confidence moving e.g. **62% → 77%** for the Northline lesson
- **Walrus verification → Total Recall**: counts from the relayer's own inventory and **Restore from Walrus** for the same account; the decision-journal toggle

Ask LANDED: “What did you tell me last time I asked about sending money?” — the journal answers with the question, the advice, and the reason.
- Category, verification, write status, blob ID, decision, timestamp

> "Every outcome judges the lessons that shaped it. Lessons that hold gain confidence and act more strongly next time; a lesson that applied and still failed loses confidence and gets flagged for review. Memory that can be wrong, and knows it."

> "A lesson becomes confirmed only when Walrus returns a blob ID. The relayer's own inventory lists 20 lessons, 5 journal entries and 6 track-record updates, all matched to this ledger. Restore from Walrus rebuilds them for the same account."

Open one lesson → point at the typed rule and the portable Walrus text.

> "The typed rule is authoritative in the database. The same rule is embedded in the blob text so another tool can understand the memory without LANDED."

---

## 2:20–2:40 — Integrations and honesty

Click **Settings → Integrations**.

Point at:

- Tatum **configured**, Sui Mainnet reachable with a live checkpoint, and a live SUI/USD rate from the Data API
- Paste any Sui Mainnet address and click **Test read**: balances and recent transactions come back through Tatum
- Walrus **configured**, relayer reachable, write-ready
- AI explanation layer **off**; arithmetic does not depend on it
- Memory namespace derived server-side

> "Sui reads are real: paste a transaction digest when recording an outcome and LANDED reads settlement, balance changes and gas through Tatum, fills the facts, and re-verifies the digest server-side before it marks anything onchain-verified. Without keys the app reports a blocked state instead of simulating success."

---

## 2:40–2:55 — Close the loop

> "The loop is: context, deterministic decision, real outcome, autopsy, user-confirmed lesson, Walrus write, and a future decision that changes. `walrus:verify` checks LANDED's ledger against the relayer's own inventory: 25 confirmed Mainnet writes, all listed."

Optional:

1. Record an outcome and confirm the lesson it proposes.
2. Show the returned blob ID and `confirmed` status.
3. Show the new lesson applied to a fresh $300 request.

---

## Lines to avoid

- "LANDED moved money." It never moves money; it advises and records.
- "This was confirmed onchain." Only say that when a digest or blob ID is visible.
- "The AI calculated..." The AI never computes amounts.
- "Expected salary is available." It is excluded unless the user opts in and reliability clears recalled rules.
