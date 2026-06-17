# LedgerForge — Solana

**The reputation-native agent service marketplace, built for Solana.**

> This repository is the **Solana port** of LedgerForge (originally built on Mantle).
> It targets **Solana devnet** today; mainnet-beta is a post-grant step. The contracts
> are a ground-up **Anchor/Rust rewrite** (not a config change) — see
> [`MIGRATION.md`](./MIGRATION.md) for the full mapping and [`DEPLOY.md`](./DEPLOY.md)
> for the devnet runbook.

---

## What It Does

The agent economy has a trust problem. When an autonomous agent hires another agent —
for code generation, data, API access, or compute — there's no reliable way to know
which providers are trustworthy, what they charge, or whether they'll deliver. Off-chain
ratings are gameable, siloed, and carry no cryptographic weight.

LedgerForge solves this with three parts: an HTTP-native x402 payment rail that makes AI
agents first-class economic participants, an on-chain skill registry that gives every
provider a persistent identity, and reputation written on-chain after every settled job.
Every payment is escrowed, every settlement is on-chain, every score derives from
provable execution history — not self-reported ratings.

**Why Solana.** Sub-cent fees and ~400ms slots make per-execution reputation writes and
micro-settlements economically viable at agent scale. Native SPL stablecoins (USDC) are
the payment token. The account/PDA model gives each skill, job, and listing its own
verifiable on-chain account, and the high-throughput runtime suits autonomous agents
transacting continuously.

---

## Architecture

Three Anchor programs (Rust → SBF), built with `cargo build-sbf`:

| Program | Role |
|---|---|
| `skill_registry` | One PDA per skill (provider, endpoint, price, mint, local reputation). `register_skill`, `update_skill`, `record_job_completion` (facilitator-gated), `set_paused`. |
| `x402_escrow` | Per-job PDA + SPL vault. `create_job` (consumer deposits), `complete_job` (PDA-signed payout → provider, fee → operator), `refund_job`. |
| `bazaar_listings` | One PDA per listing; `create_listing` pays a one-time SPL fee to the treasury. |

> **✅ Live on devnet — and the full loop is proven on-chain.** All three programs are
> deployed + initialized, and a complete `register_skill → create_job (SPL deposit) →
> complete_job (payout + 20-bps fee) → record_job_completion (reputation)` cycle has been
> executed with published tx signatures. Program IDs, config PDAs, and the executed-flow
> transaction links are in [`DEPLOYED.md`](./DEPLOYED.md). Reproduce: `cd facilitator &&
> node scripts/e2e-devnet.mjs`. Tested: `cd solana && npm test` (10/10).

**Off-chain:** a TypeScript **facilitator** (verifies ed25519 payment proofs, releases
escrow via `complete_job`, writes reputation) and the **`@poulav/x402-solana` SDK**
(`@solana/web3.js`, ed25519-signed payment authorizations). Both `tsc`-clean.

### Trust model (honest)

A single facilitator operator (one keypair) releases escrow and writes reputation today.
Every step is verifiable on-chain (vault deposit/release, payout, reputation writes), and
skill servers verify the settlement before doing paid work — so the operator can't
fabricate access or skip a payout, though it isn't yet *prevented*. Roadmap: threshold
(M-of-N) settlement, optimistic completion with a challenge window, staked reputation.

---

## Quick Start

```bash
# Programs
cd solana && cargo build-sbf            # 3 programs → .so

# SDK
cd sdk && npm install && npm run build

# Facilitator
cd facilitator && npm install && npm run build
```

Deploy to devnet: see [`DEPLOY.md`](./DEPLOY.md) (fund a key via `solana airdrop`, then
`solana program deploy`).

### SDK usage

```bash
npm install @poulav/x402-solana
```

```typescript
import { LedgerForgeClient } from "@poulav/x402-solana";
import { Keypair } from "@solana/web3.js";

const client = new LedgerForgeClient({
  rpcUrl: "https://api.devnet.solana.com",
  keypair: Keypair.fromSecretKey(secret),
});

const result = await client.invokeSkill(skillId, { query: "top Solana protocols by TVL" });
console.log(result.output);
console.log(result.receipt.explorerUrl); // explorer.solana.com
```

The consumer signs an **ed25519** payment authorization (canonical message) — Solana's
analog to the EVM EIP-712 flow.

---

## Differentiation — the missing layer above the x402 rail

Existing x402 tooling solves **payment facilitation** and **MCP integration**. None of
them make *who to trust* an on-chain fact. That's the gap LedgerForge fills.

| | Corbits / PayAI / MCPay | **LedgerForge** |
|---|---|---|
| HTTP-402 payment rail + facilitator | ✅ | ✅ (ed25519-gated settlement) |
| MCP / agent integration | ✅ | ✅ (SDK) |
| **On-chain skill identity & discovery** | ✕ | ✅ `skill_registry` PDA per skill |
| **Post-settlement reputation accrual** | ✕ | ✅ facilitator-gated, every settled job bumps `total_jobs`/`score` |
| **Composable, oracle-free trust** | ✕ | ✅ hiring agents read reputation straight from chain state |

> Existing x402 tooling solves the payment rail and MCP integration. LedgerForge adds the
> missing **on-chain skill registry** and **facilitator-gated reputation accrual** so hiring
> agents can discover providers and accumulate verifiable track records after every settled
> job — reframing the product from "another x402 implementation" into the **reputation +
> discovery primitive that rides existing payment rails**.

**Why Solana, why now.** x402 already settles tens of millions of micropayment
transactions on Solana, with agent-to-agent payments the fastest-growing slice.
Sub-cent fees and ~400 ms slots are what make **high-frequency agent-hiring loops**
(pay → execute → write reputation, repeated continuously) economically viable here first —
per-execution reputation writes simply aren't affordable on slower/costlier chains. The
trust + discovery gap that pure payment facilitators leave open is exactly where
agent volume is already appearing, so this is infrastructure for a live market, not a
speculative one.

> Portability note: the same contract suite is also deployed + verified on **Celo mainnet**
> (prior validation of the EVM design); the Solana implementation is the focus and exploits
> Solana's fee/latency economics and x402 momentum directly.

---

## Revenue Model

1. **Facilitator settlement fee** — 0.2% (20 bps) per settled job.
2. **Listing fee** — one-time SPL fee to list in `bazaar_listings`.
3. **Priority ranking boost** — stake to boost Bazaar ranking (post-grant).
4. **Hosted facilitator subscription** — managed endpoint for high-volume SDK users.

---

## Team

| Name | Role |
|---|---|
| **Poulav Bhowmick** | Programs, facilitator, SDK |
| **Ishita** | Dashboard, agent integrations, design |
