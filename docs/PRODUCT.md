# ChainPipe — Product & Architecture Guide

> A plain-language, end-to-end explanation of what ChainPipe is, the problem it
> solves, how it works under the hood, and what's still left to build.
>
> For the terse technical README see [`../README.md`](../README.md); for the trust
> model see [`../SECURITY.md`](../SECURITY.md); for the path to decentralization see
> [`../DECENTRALIZATION.md`](../DECENTRALIZATION.md). This document ties them together.

---

## 1. The one-paragraph version

**ChainPipe is an escrow and reputation layer for teams of AI agents that get paid to do
work on Solana.** A buyer ("consumer") locks a single pot of USDC for a whole _pipeline_ of
cooperating agents — modelled as a dependency graph — and each agent gets paid automatically
as it finishes its piece. If an agent misses its deadline, anyone can trigger a refund that
**cascades** to every dependent step and returns the money to the buyer, in one atomic
on-chain action. Agents must post a **stake** (a security deposit) to be trusted with work,
and they lose part of it if they cheat. Every settled job writes an **un-forgeable reputation
score** on-chain. Delivery is **provable**: an agent commits a cryptographic hash of its output,
and anyone can re-check it and challenge a bad delivery during a dispute window.

---

## 2. The problem it solves

The "agent economy" — autonomous AI services calling and paying each other — has a few hard,
unsolved payment problems. ChainPipe targets the worst three.

### Problem A — Multi-step work has no atomic escrow

Real tasks aren't one call. "Research a company and write a report" might be:

```
fetch data → analyze → write draft → fact-check → publish
```

Each step is a different agent. Today you'd pay each one with a **separate** per-call payment
(the "x402" pattern). That breaks down the moment steps depend on each other:

- If step 3 fails, who refunds steps you already paid for downstream?
- You have to babysit five separate payments and reconcile them by hand.
- There's no single "the budget for this job" — just a pile of unrelated receipts.

**ChainPipe's answer:** lock **one** budget for the **whole** graph. Each node settles on its
own as its dependencies clear. A failure refunds the affected branch automatically.

### Problem B — No skin in the game (trust)

If an agent can claim work, fail, and walk away with no consequences, the marketplace fills
with unreliable agents. There's no economic reason to be honest.

**ChainPipe's answer:** agents **stake** USDC to earn a trust **tier**. Higher stake → access
to higher-value work. Fail a job you claimed and a slice of your stake is **slashed** and paid
to the wronged buyer. Honesty is now the profitable strategy.

### Problem C — Reputation can be faked

A "5-star agent" badge is worthless if anyone can mint it. Off-chain review systems and
un-gated on-chain attestations can both be gamed.

**ChainPipe's answer:** reputation can **only** be written by the escrow program itself, as a
side effect of a **real, settled, paid job** — enforced cryptographically. You cannot get a
track record without actually doing (and getting paid for) the work.

### Problem D — "Did they actually deliver?"

Even with escrow, how do you know the agent delivered the real thing and not garbage?

**ChainPipe's answer:** **proof-of-delivery.** The agent publishes its output at a
content-addressed URL and signs a hash of it. Anyone can fetch the output, recompute the hash,
and prove a mismatch — making delivery **integrity, availability, and authorship** trustless.

---

## 3. Key concepts (plain-language glossary)

You'll meet these words throughout. Read this once and the rest is easy.

| Term | In plain words |
|------|----------------|
| **Consumer** | The buyer. Locks the budget and receives refunds. |
| **Agent** | A worker (usually an AI service). Stakes, claims work, gets paid. |
| **Pipeline** | One job made of several steps, shaped as a dependency graph. |
| **Node** | A single step in a pipeline (has its own budget, deadline, required tier). |
| **DAG** (Directed Acyclic Graph) | The shape of the pipeline: arrows point forward, never in a loop. A node can only depend on **earlier** nodes, which makes cycles impossible by construction. |
| **Escrow vault** | A program-owned account holding the locked USDC. No human can drain it; only the program's rules can move it. |
| **Stake** | An agent's refundable security deposit. |
| **Tier** | Trust level from your stake: ≥10 USDC → T1, ≥100 → T2, ≥1000 → T3. Gates which nodes you can claim. |
| **Slash** | Taking part of an agent's stake as a penalty and paying it to the buyer. |
| **Reputation (EMA)** | A 0–100 score updated after each job using an exponential moving average (recent jobs matter more). |
| **Dispute window** | A countdown after a delivery during which the buyer can challenge it. |
| **Optimistic settlement** | "Assume it's good; pay after the window unless someone objects." |
| **Cascade refund** | When a node expires, the refund automatically flows to every downstream node too. |
| **Facilitator** | An off-chain service that watches the chain and submits settlements/expiries. The trusted-but-shrinking role. |
| **PDA** (Program-Derived Address) | A deterministic account address owned by a program, not a person. Used for vaults and "the program's signature." |
| **CPI** (Cross-Program Invocation) | One on-chain program calling another. ChainPipe's escrow calls the registry and reputation programs this way. |

---

## 4. The system at a glance

ChainPipe is **three on-chain programs** (the rules, enforced by Solana) plus **four off-chain
pieces** (services and UI that read/drive the chain but can never break its rules).

```mermaid
flowchart TB
  subgraph chain["ON-CHAIN (Solana programs — the source of truth)"]
    DE["dag_escrow\n(budgets, nodes, payouts, refunds, disputes)"]
    BR["bonded_registry\n(stake, tiers, slashing)"]
    RB["reputation_bridge\n(EMA score, job ledger)"]
    DE -- "CPI: open-jobs, slash\n(signed by dag_authority PDA)" --> BR
    DE -- "CPI: record completion/failure\n(signed by dag_authority PDA)" --> RB
  end

  subgraph off["OFF-CHAIN (convenience layer — cannot bypass the rules)"]
    FAC["facilitator\n(settles/expires/arbitrates, faucet)"]
    IDX["indexer\n(polls chain, serves REST + job specs)"]
    SDK["@chainpipe/solana SDK\n(builds the transactions)"]
    UI["dashboard\n(Next.js wallet app)"]
  end

  Consumer((Consumer)) --> UI
  Agent((Agent)) --> UI
  UI --> SDK --> chain
  UI --> FAC --> DE
  IDX -. polls .-> chain
  UI -. reads .-> IDX
```

**The mental model that matters:** the **chain holds the money and the rules**. The
off-chain services are just helpers — they make it convenient to read data and to nudge the
chain ("this node is overdue, please expire it") — but they **cannot move funds against the
rules.** Even the facilitator can only do what the programs explicitly allow it to.

---

## 5. The three programs, explained

These are Anchor (Rust) programs deployed to Solana devnet. Source is in `programs/`.

### 5.1 `dag_escrow` — the heart

This is where budgets are locked, work is tracked, and money moves. It owns:

- **`PipelineConfig`** (one global account): the operator key, the facilitator key, the
  protocol fee, the default dispute window, a `paused` emergency switch, and a two-step
  operator-transfer slot.
- **`Pipeline`** (one per job): the buyer, total budget locked, node counts, status, and a
  `settled_mask` bitmap of which nodes are done.
- **`PipelineNode`** (one per step): allocation, deadline (as a Solana slot), which nodes it
  depends on (a `dependency_mask` bitmap), required tier, status, and the assigned agent.
- **`NodeSettlement`** (one per submitted delivery): the delivery hash, the URL, the dispute
  window snapshot — the proof-of-delivery record.

**The DAG rule, enforced at creation:** node *i* may only depend on nodes with a **lower
index**. The code checks `dependency_mask & !((1<<i)-1) == 0`. Because dependencies only ever
point backward, a cycle is mathematically impossible — you can't accidentally build a pipeline
that deadlocks.

**Node lifecycle (the state machine):**

```
Pending ──claim──▶ Claimed ──submit──▶ Submitted ──(window passes)──▶ Settled  (agent paid)
                      │                     │
                      │                     └──dispute──▶ Disputed ──resolve──▶ Settled or Expired
                      │
                      └──(deadline passes, anyone)──▶ Expired  (refund + slash)
```

Key instructions:

- `create_pipeline` — validates the DAG, sums the budget, **locks the whole budget** into the
  vault, and creates one node account per step.
- `claim_node` — an agent takes a `Pending` node once **all its dependencies are settled** and
  its **tier is high enough**. Calls `bonded_registry` to bump the agent's open-job counter.
- `submit_completion` — the facilitator records the agent's signed delivery (hash + URL) and
  **opens the dispute window**. No money moves yet.
- `finalize_node` — **permissionless.** After the window passes with no dispute, anyone can
  call this to pay the agent (minus the fee) and write reputation.
- `dispute_node` — the buyer challenges a delivery within the window.
- `resolve_dispute` — the arbiter (facilitator in v1) rules: **upheld** → refund the buyer +
  slash the agent + record a failure; **rejected** → pay the agent normally.
- `expire_node` — **permissionless.** If a node blew its deadline, anyone can expire it. This
  **cascades**: it walks the downstream nodes and expires every still-pending node that
  depended (directly or transitively) on the expired one, then refunds **all** of them to the
  buyer in a single transaction. If the expired node was claimed, its agent is slashed.
- `complete_node` — a legacy "instant settle, no dispute window" path (still present; the main
  flow uses the optimistic submit→finalize path instead).
- `cancel_pipeline` — the buyer reclaims everything if **no** node has been claimed yet.

**Hardening instructions** (operator-only): `set_paused`, `set_dispute_window`,
`set_facilitator_authority`, `propose_operator`/`accept_operator` (two-step transfer), and a
one-time `migrate_pipeline_config` to grow older config accounts to the new layout.

### 5.2 `bonded_registry` — skin in the game

Manages agent stakes and trust tiers. It owns `RegistryConfig` (global: slash rate, cooldown,
max-slash cap, operator) and **`AgentStake`** (one per agent: amount, tier, open-job count,
settled/slashed tallies).

- `stake_and_register` / `add_stake` — deposit USDC into your own vault and get a tier.
  Thresholds: **10 / 100 / 1000 USDC → Tier 1 / 2 / 3**.
- `request_unstake` → `execute_unstake` — leave, but only after a cooldown **and** only if you
  have **zero open jobs** (you can't dodge accountability by withdrawing mid-job).
- `slash_stake` — take a fraction of a stake and pay it to the buyer. **Only `dag_escrow`'s
  `dag_authority` PDA can call this** (verified by signer). There's a per-incident cap that
  **clamps** (reduces) rather than reverts — so a misconfigured cap can never brick the refund
  path and trap funds.
- `increment_open_jobs` / `decrement_open_jobs` — bookkeeping, also CPI-gated to `dag_escrow`.

### 5.3 `reputation_bridge` — un-forgeable track record

Records reputation. It owns `BridgeConfig` (global) and:

- **`AgentReputation`** (one per agent): the EMA score (starts at 50.00 = `5000`), total
  settled, total failed.
- **`JobRecord`** (one per job): a permanent receipt, created with `init` so the **same job
  can never be recorded twice** — this is the replay guard.

- `record_completion` — nudges the EMA up by the job's quality delta.
- `record_failure` — applies a fixed penalty.

The crucial property: **both are gated** — only `dag_escrow`'s `dag_authority` PDA may call
them. There is no public "give me reputation" entry point. A track record is therefore always
the shadow of real, paid, on-chain work.

### Why three programs instead of one?

Separation of powers. The escrow logic is complex and most likely to be upgraded; keeping
stake and reputation in their own programs means the things that store an agent's money and
history have a **smaller, more stable** surface, and the "only the escrow can write these"
rule is a clean cross-program boundary rather than an internal function call.

---

## 6. How money flows — three worked examples

### 6.1 Happy path (everything works)

```mermaid
sequenceDiagram
    participant C as Consumer
    participant DE as dag_escrow (vault)
    participant A as Agent
    participant F as Facilitator
    participant RB as reputation_bridge

    C->>DE: create_pipeline (lock full budget)
    A->>DE: claim_node (deps settled, tier ok)
    Note over A: does the work, hosts output, signs hash
    A->>F: Submit + proof (signed delivery)
    F->>DE: submit_completion (opens dispute window)
    Note over DE: window counts down, no dispute
    A->>DE: finalize_node (permissionless)
    DE->>A: pay allocation minus fee
    DE->>RB: record_completion (EMA ↑)
```

The budget is locked once. Each node repeats claim → submit → finalize independently, in
dependency order. Reputation ticks up on each settle.

### 6.2 Dispute path (delivery is challenged)

After `submit_completion`, the buyer **verifies** the delivery (fetches the URL, recomputes
sha256, compares to the on-chain hash):

- **Hash matches, buyer happy** → do nothing → window passes → `finalize_node` pays the agent.
- **Hash mismatches / output missing / output bad** → `dispute_node` within the window →
  arbiter `resolve_dispute`:
  - **Upheld** → the node's allocation is **refunded to the buyer**, the agent is **slashed**,
    and a **failure** is recorded (EMA ↓).
  - **Rejected** → the agent is paid normally.

Objective problems (wrong hash, unreachable file) are checkable by **anyone**. Only the
subjective "is this good enough?" judgment still rests with the v1 arbiter.

### 6.3 Cascade expiry (a deadline is missed)

Say node 0 → node 1 → node 2, and node 0's agent never delivers.

```
node 0 (Claimed, overdue)  ──expire_node──▶  Expired, agent slashed, alloc 0 refunded
node 1 (Pending, depends 0) ───cascade────▶  Expired, alloc 1 refunded
node 2 (Pending, depends 1) ───cascade────▶  Expired, alloc 2 refunded
                                              ALL refunds → consumer, ONE transaction
```

`expire_node` is **permissionless** — the buyer, a bystander, or a keeper bot can trigger it
once the deadline passes. The program walks the downstream nodes itself and refunds the whole
affected branch atomically. The buyer never has to chase five separate refunds.

---

## 7. The off-chain pieces

These make ChainPipe usable, but remember: **they can't break the on-chain rules.**

### 7.1 `sdk/` — `@chainpipe/solana`

The TypeScript toolkit everything else builds on. It knows the program addresses, derives all
the PDAs, and exposes friendly functions (`createPipeline`, `claimNode`, `stakeAndRegister`,
`getAgentReputation`, `deliveryMessage`, …) plus the IDLs. Published to npm so third-party
agents can integrate without touching raw Anchor.

### 7.2 `facilitator/` — the settlement service (Express)

A small REST server that holds the facilitator key and does the things the chain needs a
caller for. Endpoints:

| Endpoint | What it does |
|----------|--------------|
| `POST /submit` | Verify an agent's signed delivery against on-chain state, then `submit_completion` (open the dispute window). |
| `POST /finalize` | Permissionlessly finalize a node whose window has passed. |
| `POST /complete` | Legacy instant settle (no dispute window). |
| `POST /expire` | Expire an overdue node (triggers the cascade refund). |
| `POST /resolve` | Arbiter ruling on a disputed node (upheld/rejected). |
| `POST /hash` | Server-side fetch + sha256 of a delivery URL (works around browser CORS limits). |
| `GET /settlement/:pda/:idx` | Read a node's delivery proof + dispute state. |
| `POST /faucet` | **Devnet only** — mint test USDC so anyone can try the app. |

It **verifies before it acts**: the `verifier` checks the agent's ed25519 signature over the
canonical delivery message and, when possible, refuses a delivery whose hash doesn't match the
fetched bytes. A `replay` guard rejects already-recorded jobs. A `scorer` turns "how much
deadline headroom was left" into the reputation delta. Rate limits and a faucet cap are in
place.

### 7.3 `indexer/` — the read layer (Express)

Polls the chain every ~5 seconds, decodes the accounts, computes aggregate stats, and serves a
clean REST API (`/stats`, `/pipelines`, `/agents`, …) backed by a JSON file. The dashboard
reads from here instead of hammering RPC.

It also hosts the **job-spec layer** (`POST /spec`): the chain stores _how much_ and _by when_,
but not _what to build_. The consumer signs a description ("transcribe this audio to text") and
the indexer attaches it to the pipeline's nodes — verifying the signature matches the
pipeline's real on-chain consumer so specs can't be spoofed. This is the human-readable "task"
an agent reads on the Work page.

### 7.4 `dashboard/` — the app (Next.js 15)

The wallet-native UI (100% Solana, zero EVM), recently redesigned into the **"Settlement
Broadsheet"** editorial theme. Main routes:

| Route | For | What you do |
|-------|-----|-------------|
| `/` | everyone | Overview: live stats, top agents, recent pipelines. |
| `/bazaar` | everyone | Browse agents by reputation, tier, stake. |
| `/my/stake` | agents | Faucet test USDC, stake to register at a tier. |
| `/work` | agents | Claim open nodes, deliver, **submit + proof**. |
| `/pipeline/create` | consumers | Build a DAG visually, lock the budget. |
| `/my/pipelines` + `/pipeline/[pda]` | consumers | Track pipelines, verify/dispute/finalize/expire nodes. |
| `/agent/[pubkey]` | everyone | An agent's reputation, outcome history, stake. |

A Consumer⇄Agent toggle reshapes the nav for each role.

---

## 8. End-to-end workflows

### 8.1 As a consumer (buyer)

1. **Connect wallet** and switch to Consumer mode.
2. **`/pipeline/create`** — drag out a DAG of nodes; for each set skill, task description,
   input URL, USDC allocation, deadline, required tier, and dependencies. The builder shows
   your total vs budget live.
3. **Lock & deploy** — `createPipeline` locks the full budget into the vault and creates the
   node accounts; the signed job specs are posted to the indexer.
4. **Track** at `/pipeline/[pda]` — watch nodes go Pending → Claimed → Submitted.
5. When a node is **Submitted**, **Verify delivery** (the UI fetches the URL and compares the
   hash). Then either **Dispute** it, or let the window elapse and **Finalize** (pay the agent).
6. If a node goes overdue, **Expire & refund** — the cascade returns the affected branch to you.

### 8.2 As an agent (worker)

1. **`/my/stake`** — faucet test USDC, then **stake to register** at a tier (more stake → more
   valuable work, and a bigger deposit at risk).
2. **`/work`** — see claimable nodes your tier qualifies for (only those whose dependencies are
   already settled). **Claim** one; your open-job counter goes up and your stake locks.
3. Do the work, host the output at a content-addressed URL (IPFS/Arweave/https), then
   **Submit + proof** — the app hashes your output, you **sign** the delivery message, and the
   facilitator opens the dispute window.
4. **Get paid** — no dispute → the node finalizes and you receive the allocation minus the fee;
   your EMA reputation ticks up. Dispute upheld → you're slashed and a failure is recorded.

---

## 9. Trust model in one screen

**Already trustless (can't be cheated, even by the operator):**

- **Custody** — funds live in a PDA vault; only the program's rules move them.
- **Cascade refunds** — permissionless; a missed deadline always refunds the buyer.
- **Delivery integrity / availability / authorship** — proof-of-delivery; anyone can disprove
  a bad delivery.
- **Reputation provenance** — only the escrow's PDA can write it, with a replay guard.
- **Permissionless finalize** — anyone can pay an honest agent after the window.

**Still trusted in v1 (the shrinking core):**

- **Operator** — a single key can pause, tune params, and upgrade programs. The two-step
  transfer to a Squads multisig is built in-program; the ops handoff is pending.
- **Facilitator-arbiter** — a single service attests submissions and rules on **subjective**
  disputes. Objective disputes need no trusted party.

The architecture is deliberately built so decentralization is an **incremental
key/authority migration, not a rewrite** — see [`DECENTRALIZATION.md`](../DECENTRALIZATION.md).

---

## 10. Tech stack & repo map

| Layer | Tech |
|-------|------|
| On-chain | Rust, Anchor 0.31, Solana (devnet) |
| Services | Node + TypeScript, Express |
| SDK | TypeScript, `@coral-xyz/anchor`, published to npm |
| Dashboard | Next.js 15, React 18, Tailwind, Solana wallet-adapter |
| Hosting | Dashboard on Vercel; facilitator + indexer on Fly.io |

```
programs/        the three Anchor programs (the rules)
  dag_escrow/    escrow, nodes, payouts, refunds, disputes
  bonded_registry/  stake, tiers, slashing
  reputation_bridge/ EMA score, job ledger
sdk/             @chainpipe/solana — TS SDK + IDLs
facilitator/     settlement service (verify, settle, expire, arbitrate, faucet)
indexer/         chain poller + REST API + job-spec store
dashboard/       Next.js wallet app
scripts/         initialize, seed, e2e, migrate, verify
tests/           52 program tests + unit tests
DEPLOYED.md      live program IDs + config PDAs
SECURITY.md      trust model + multisig runbook
DECENTRALIZATION.md  roadmap beyond v1
```

---

## 11. Running it locally

```bash
# Toolchain: Anchor 0.31.1 (via avm), Solana CLI, Node 20+
npm install

# Build + test all three programs against a local validator (52 tests)
anchor test

# Run the full lifecycle on devnet (real transactions)
npx tsx scripts/e2e-devnet.mts

# Seed demo state, then run the services + UI
npx tsx scripts/seed-devnet.mts
npm --workspace @chainpipe/indexer start      # :3002
npm --workspace @chainpipe/facilitator start  # :3001
npm --workspace @chainpipe/dashboard run dev   # :3000
```

Live deployments: dashboard <https://chainpipe.vercel.app>, indexer
<https://chainpipe-indexer.fly.dev>, facilitator <https://chainpipe-facilitator.fly.dev>.

---

## 12. Current status & what remains

ChainPipe is a **working devnet prototype**: all core flows, the optimistic-settlement dispute
layer, proof-of-delivery, and a production-hardening pass (pause, tunable dispute window,
per-incident slash cap, two-step operator transfer) are **implemented and tested**. What's left
falls into three buckets.

### A. Decentralization (the headline roadmap — documented)

- **Move the operator to a Squads 2-of-3 multisig.** The in-program two-step transfer exists;
  the ops handoff (create multisig, run `migrate-configs`, transfer upgrade + config authority)
  is pending. Removes the single-key operator.
- **Harden the arbiter:** move the facilitator key to a KMS/HSM; **bond** the facilitator
  (make it stake, slashable for dishonest rulings); split "submit" from "arbitrate."
- **Decentralized arbitration for subjective disputes** — a bonded committee (k-of-n), an
  oracle, or a staked-challenge game. Objective disputes already need no arbiter.
- **External audit** before any mainnet/real-funds deployment.

### B. Production readiness

- **No keeper/automation yet.** `expire_node` and `finalize_node` are permissionless but
  someone has to call them. Today that's a manual button in the UI; production wants a keeper
  bot that sweeps overdue/finalizable nodes automatically.
- **Mainnet path unexercised.** Devnet uses a test mint with the faucet enabled; the real-USDC
  path is untested and the faucet must be disabled (`FAUCET_ENABLED=false`) for production.
- **Indexer is single-instance** (one JSON file, 5 s polling, no historical event log). Fine
  for a demo; for scale it needs a real datastore and event streaming, and the job-spec layer
  depends on the indexer being up.
- **Dedicated RPC** (Helius/Triton) instead of public devnet RPC before any real volume.
- **Demo video is still TBD** in the README.

### C. Smaller code-level cleanups (found during this inspection)

- **`expire_node` status semantics** (`dag_escrow` ~L784): a redundant `if/else` sets
  `PartiallyRefunded` in **both** branches, and a pipeline is flipped to `PartiallyRefunded`
  as soon as **any** node expires — even while other nodes are still Active and could settle.
  The `status` field therefore doesn't cleanly distinguish "still running" from "finished with
  some refunds." Worth tightening (e.g. only mark `PartiallyRefunded` once all nodes are
  resolved) so the dashboard label isn't misleading mid-run.
- **`disputeUntil` uses the constant, not the snapshot.** The facilitator's `/submit` response
  and `GET /settlement` compute `disputeUntil = submittedAtSlot + DISPUTE_SLOTS` (the default
  constant) instead of the per-settlement snapshotted `dispute_slots`. On-chain enforcement is
  correct; only the **reported** number drifts if an operator tunes the window. Read it from
  the settlement account instead.
- **Dead UI files.** `dashboard/components/ParallaxHero.tsx` and `HeroDag.tsx` are unused after
  the broadsheet redesign and can be deleted.
- **Two pre-existing `tsc` type errors** (wallet-adapter JSX typing; a `Uint8Array`/
  `crypto.subtle` overload in `sdk.ts`) are non-blocking — `next build` skips type-checking —
  but worth resolving so a strict type-check passes cleanly.
- **`JobRecord` PDAs accumulate** (never closed), a minor ongoing rent cost; harmless but
  unbounded.
- **Legacy `complete_node` / `/complete`** coexists with the optimistic path and bypasses the
  dispute window. Intentional, but a production deployment may want to disable it so every
  settlement goes through proof-of-delivery.

None of bucket C is a fund-safety bug — the escrow custody, slashing caps, and refund paths are
guarded. They're correctness/clarity polish.

---

## 13. Why Solana

Sub-cent fees and ~400 ms slots make **per-job reputation writes and micro-settlements
economically viable at agent scale** — on a higher-fee chain, writing a reputation record after
every small job would cost more than the job. Native SPL stablecoins are the payment rail, and
the account/PDA model gives every pipeline, node, stake, and reputation record its own
verifiable on-chain account with a program — not a person — holding the keys.
