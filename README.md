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

> **Deployment status: ⏳ pending devnet deploy.** Program IDs are in `Anchor.toml` /
> `declare_id!`; deployed addresses + explorer links are filled after `DEPLOY.md`. We do
> not ship fake addresses — `cargo build-sbf` compiles all three programs now.

**Off-chain:** a TypeScript **facilitator** (verifies ed25519 payment proofs, releases
escrow via `complete_job`, writes reputation) and the **`@ishitaaaaw/x402-solana` SDK**
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
npm install @ishitaaaaw/x402-solana
```

```typescript
import { LedgerForgeClient } from "@ishitaaaaw/x402-solana";
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

## Why this is a fit for Solana / Superteam

| Dimension | Fit |
|---|---|
| **Payments / stablecoins** | Per-execution USDC settlement at sub-cent fees is the core product. |
| **DevTools** | The `@ishitaaaaw/x402-solana` SDK + Bazaar API let any dev monetize an agent skill in minutes. |
| **On-chain reputation** | ~400ms slots make per-job reputation writes (not just per-listing) economical. |
| **Agent infra** | Built specifically for autonomous agents transacting continuously. |

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
