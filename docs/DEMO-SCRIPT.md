# ChainPipe — 3-minute demo video script

> A spoken script for a product demo video. ~415 spoken words → 2:50–3:10 once the `(beat)`s
> and screen-cue pauses fill in (≈150 wpm spoken, slower with the on-screen actions).
> `[SCREEN]` = what to show; **bold** = the spoken line. Talk like a person explaining it to a
> smart friend, not a press release. Pauses are marked `(beat)`. Drafted 2026-06-26 —
> rewrite any line that doesn't sound like *you* saying it out loud.
>
> Live to capture against: **https://chainpipe.vercel.app** (devnet).

---

## 0:00 — 0:25 · The hook

`[SCREEN: clean title card, then cut to your face or the dashboard home]`

**"AI agents are starting to hire each other. One agent fetches data, hands it to another that
analyzes it, that hands it to a third that writes the report.** (beat) **The work is a pipeline —
but the *money* isn't. Today you pay each agent in a separate transaction. So when step three
fails, after you've already paid steps one and two… who refunds you? Nobody. You're chasing it
by hand."**

**"That's the problem ChainPipe fixes."**

> Delivery note: land "who refunds you? Nobody" flat and a little annoyed — it's the pain.

## 0:25 — 0:45 · What it is, in one breath

`[SCREEN: the home page — live stats, agents, pipelines]`

**"ChainPipe is escrow and reputation for teams of AI agents, on Solana. You lock *one* budget
for a *whole* pipeline of agents. Each one gets paid automatically as it finishes its piece —
and if anyone misses a deadline, the refund cascades back to you in a single transaction."**

## 0:45 — 1:35 · The demo — buyer side

`[SCREEN: /pipeline/create — the visual DAG builder]`

**"Here's a buyer building a job. I drag out the steps — fetch, analyze, write — and wire up
what depends on what.** (beat) **I set a budget, an allocation per step, a deadline, and a
minimum trust tier for each agent."**

`[SCREEN: click "Lock & deploy", wallet pops, confirm]`

**"I lock the whole budget once. It goes into a vault that *no human controls* — not even us.
Only the program's own rules can move that money."**

`[SCREEN: /work — agent view, claim a node, then submit with proof]`

**"Now the agent side. An agent has staked USDC to earn a trust tier — that's their skin in the
game. It claims a step, does the work, and submits the result with a *signed cryptographic
hash* of the output. Anyone can re-check that hash. You can't fake a delivery."**

## 1:35 — 2:15 · Getting paid, and failing

`[SCREEN: /pipeline/[pda] — node goes Submitted → Settled, reputation ticks up]`

**"No dispute? The agent gets paid automatically, and an *un-forgeable* reputation score is
written on-chain — because the only thing that can write reputation is a real, paid, settled
job."**

`[SCREEN: a node that blew its deadline → click expire → cascade refund]`

**"And the failure case — this is the one I love. This agent missed its deadline. Anyone can
expire it.** (beat) **Watch: not only does that step refund, *every* downstream step that was
waiting on it refunds too — to the buyer — in one atomic transaction. Plus the agent that
flaked gets *slashed*."**

> Delivery note: slow down on the cascade. Let the numbers update on screen before you talk.

## 2:15 — 2:45 · Why trust it

`[SCREEN: split — vault / slash / reputation / proof-of-delivery]`

**"So: custody you can't drain, refunds nobody can block, reputation nobody can fake, and
delivery anyone can verify. (beat) We're honest about what's still centralized — a single
operator and arbiter today — but every piece of decentralizing them is already built into the
programs. It's a migration, not a rewrite."**

## 2:45 — 3:00 · Close

`[SCREEN: home page + URL + npm package]`

**"It's live on Solana devnet right now — three on-chain programs, an SDK on npm, the whole
dashboard you just saw. ChainPipe: lock one budget, trust the work, get your money back when it
fails.** (beat) **Come build a pipeline."**

`[SCREEN: chainpipe.vercel.app]`

---

## Production checklist

- **Total spoken ≈ 415 words** → 2:50–3:10 with the pauses and on-screen actions. If you run
  long, cut the 0:25–0:45 "what it is" block (the demo carries it).
- **Pre-seed state** so the recording is deterministic: one pipeline mid-flight (a node in
  `Submitted`) and one with an overdue node ready to expire. Use `scripts/seed-devnet.mts`.
- **Have two wallets ready** (a buyer and a staked agent) so the role toggle is instant.
- **The cascade refund is the money shot** — record it twice and keep the cleaner take.
- Devnet RPC can lag; pre-warm the pages and have the facilitator/indexer up before you hit
  record so stats don't show stale or zero.
- If a transaction is slow on camera, cut to the confirmed state — don't narrate a spinner.
