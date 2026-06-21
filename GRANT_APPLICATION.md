# ChainPipe — Superteam India Grant Application (draft)

> Form-ready draft. Honest to the shipped state (devnet prototype, v1 centralized operator).
> Replace **[bracketed]** items (team bio, demo video URL, exact ask) before submitting.
> Sections map to typical Superteam fields — reorder/trim to fit the live form.

---

## Project name
ChainPipe

## One-liner
The atomic multi-agent settlement and economic-trust layer for the x402 agent economy on
Solana — DAG pipeline escrow with cascading refunds, bonded stake-for-trust, and gated,
verifiable reputation.

## Elevator pitch (2–3 sentences)
ChainPipe supplies the atomic multi-agent settlement and economic-trust layer that per-job
x402 facilitators and un-gated agent registries lack. A working Solana devnet prototype ships
today: DAG pipeline escrow with single-instruction cascade refunds, bonded stake tiers with
slashing, CPI-gated reputation, and content-addressed proof-of-delivery — with 52 passing
program tests, live end-to-end transactions, a published SDK, and a working dashboard. We're
requesting funding to complete a mainnet deployment with real USDC, an external security audit,
and the first external pipeline pilots — building the missing settlement primitive before
agent-to-agent composition scales.

## The problem
The agent economy is converging on **x402** (HTTP-native agent payments) on Solana. Two gaps:

1. **No atomicity across a pipeline.** Today's facilitators (Dexter, PayAI, MCPay) settle one
   job at a time. When a multi-step workflow of cooperating agents partially fails, funds get
   stranded mid-pipeline with no clean unwind.
2. **Un-gated reputation.** The official 8004 / ATOM agent registry lets anyone write a
   reputation attestation with no proof a job occurred — reputation can be forged.

These don't bite hard *yet* because most agent payments are still single-job. They will bite as
agent workflows compose into multi-step DAGs. ChainPipe builds the missing primitive ahead of
that demand, so value can move across agent pipelines without manual unwinding.

## The solution (three Anchor programs)
- **`dag_escrow`** — a consumer locks one budget for a whole DAG of agent jobs. Nodes settle
  individually as dependencies complete; if a node misses its deadline, **anyone** can expire it
  and the refund **cascades atomically** to all downstream nodes and back to the consumer, in a
  single instruction. DAG validity is enforced structurally (dependencies may only reference
  lower-indexed nodes → cycles are impossible by construction).
- **`bonded_registry`** — agents stake SPL tokens for a trust tier (≥10/100/1000 USDC →
  T1/2/3); tier gates the job value an agent may claim; failure slashes stake to the wronged
  consumer (per-incident cap, 7-day unstake cooldown, open-job guard).
- **`reputation_bridge`** — per-agent EMA reputation with a replay-guarded job ledger,
  **facilitator-gated**: only `dag_escrow` (via a program-derived signer) can write reputation,
  so a track record cannot be forged. Schema mirrors 8004 for a future CPI upgrade path.

**Verifiable proof-of-delivery.** Beyond instant settlement, a node can settle *optimistically*:
the agent hosts output at a content-addressed `uri` and signs
`pipeline‖node‖jobId‖sha256(output)‖sha256(uri)`, opening a dispute window. **Anyone** can fetch
the uri, recompute the hash, and dispute a mismatch or unavailability — objective disputes are
mechanically checkable on-chain. No dispute → permissionless finalize pays the agent; a dispute
→ resolution (refund + slash, or pay).

## Why Solana
Sub-cent fees and ~400ms slots make per-execution reputation writes and micro-settlements
economically viable at agent scale; native SPL stablecoins are the payment rail; the PDA/account
model gives every pipeline, node, stake, and reputation record its own verifiable on-chain
account. This protocol is not viable on a high-fee chain.

## What's built today (verifiable links)
- **3 programs deployed + upgraded on devnet**, configs initialized + migrated:
  `dag_escrow 3FqvkzppD4ciwkGLrcNoTHUCeHwNbWtot18CkrBdXiJd`,
  `bonded_registry 26AB6S5crQAkhfx928bnWSHfpQE6wp2Sdt4afFtk7crq`,
  `reputation_bridge 6RRfs1Ho1bJ3JWXSy3xVth4BTGHWwVwum74ph2LRWWsf`.
- **52 Anchor integration tests** + 7 SDK/service unit tests, all passing; full lifecycle
  (incl. dispute + proof-of-delivery) verified **end-to-end on devnet with real transactions**.
- **Published SDK:** `@chainpipe/solana` on npm (v0.2.0).
- **Live services:** dashboard https://chainpipe.vercel.app · indexer
  https://chainpipe-indexer.fly.dev · facilitator https://chainpipe-facilitator.fly.dev
- **Repo:** https://github.com/PoulavBhowmick03/chainpipe
- **Demo video:** **[INSERT 2-MIN SCREEN RECORDING URL]**
- **Production hardening already in-program:** emergency pause, configurable + per-submission-
  snapshotted dispute window, per-incident slash cap, two-step operator transfer (the
  prerequisite for a multisig handoff), and in-place config migrations. An internal adversarial
  review found and fixed two medium issues before this submission.

## Honest current trust model (v1)
ChainPipe v1 is a **single-operator bootstrap**: one operator key (upgrade + config authority)
and one facilitator-arbiter that attests submissions and rules on *subjective* disputes.
*Objective* disputes (hash mismatch / unavailable output) are verifiable by anyone on-chain.
We do not claim full trustlessness. The path to decentralization is concrete and partly
in-program already (two-step operator transfer → Squads multisig; bonded/decentralized arbiter
for subjective disputes) — documented in `DECENTRALIZATION.md`.

## Traction
Early — devnet prototype with real transactions, a published SDK, and live infrastructure; no
external production usage yet. **[Add: any x402 work, prior shipped protocols, hackathon
results, ecosystem relationships — e.g. parallel x402 work on other chains.]**

## Use of funds & milestones (12 weeks)
Requested: **[$X — suggest $5,000 microgrant; adjust to the program tier]**

- **Weeks 1–2 — Credibility & governance.** Embed the demo video; align all public docs to the
  shipped v1 trust model; execute the Squads multisig handoff (two-step operator transfer is
  already deployed) and publish the multisig address.
- **Weeks 3–5 — Mainnet.** Deploy all three programs to mainnet-beta with **real USDC**; remove
  the devnet test-mint/faucet path; publish an accurate mainnet `DEPLOYED.md`.
- **Weeks 6–9 — Audit & first usage.** External security review focused on the cascade-refund
  math, PDA signing, and facilitator/dispute paths; ship SDK examples; run **1–2 paid external
  pipeline pilots** with real agent builders (not us).
- **Weeks 10–12 — Iterate & decentralize.** Report usage metrics; iterate the dispute/arbiter
  model toward a bonded/decentralized arbiter for subjective disputes.

## Team
**[Your name / handle]** — **[role; relevant background: Solana/Anchor, x402 work on
Mantle/Celo, prior protocols, links to GitHub/X].** Solo builder / **[team if any]**.

## Differentiation
| | per-job x402 facilitators | 8004 registry | ChainPipe |
|---|---|---|---|
| Multi-job atomicity | ❌ | n/a | ✅ DAG escrow + cascade refunds |
| Economic stake-for-trust | ❌ | ❌ | ✅ bonded registry + slashing |
| Gated reputation writes | n/a | ❌ un-gated | ✅ CPI-only via `dag_authority` |
| Verifiable proof-of-delivery | ❌ | ❌ | ✅ content-hash + dispute window |

## Links
- Repo: https://github.com/PoulavBhowmick03/chainpipe
- npm: https://www.npmjs.com/package/@chainpipe/solana
- Dashboard (devnet): https://chainpipe.vercel.app
- Demo video: **[INSERT URL]**
- License: MIT
