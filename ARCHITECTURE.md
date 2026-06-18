# LedgerForge — Architecture

LedgerForge is a reputation-native marketplace for AI-agent skills on Solana. It pairs an
x402 micropayment rail with an **on-chain skill registry** and a **post-settlement
reputation primitive**, so a hiring agent can discover providers and accumulate a
verifiable track record after every settled job — without trusting an off-chain oracle.

## On-chain programs (Anchor, `solana/programs/`)

| Program | Role |
|---|---|
| `skill_registry` | One PDA per skill (provider, endpoint, price, payment mint, local reputation). `register_skill`, `update_skill`, `record_job_completion` (facilitator-gated), `set_paused`. Reputation accrues on the `Skill` PDA after every settled job. |
| `x402_escrow` | Per-job PDA + SPL token vault. `create_job` (consumer deposits), `complete_job` (PDA-signed payout → provider, fee → operator), `refund_job`. |
| `bazaar_listings` | One PDA per listing; `create_listing` pays a one-time SPL fee to the treasury. |

State lives in PDAs; SPL tokens (USDC) move through a job-owned vault. Authority is enforced
with `has_one`/`constraint` checks; all arithmetic is checked. Deployed program IDs and the
executed-flow transaction signatures are in [`DEPLOYED.md`](./DEPLOYED.md).

## Off-chain

- **Facilitator** (`facilitator/`, TypeScript): verifies the consumer's **ed25519** payment
  authorization (a canonical signed message), releases escrow via `complete_job`, and writes
  reputation via `record_job_completion`. Live: `ledgerforge-sol-facilitator.fly.dev`.
- **SDK** (`@poulav/x402-solana`, `sdk/`): `@solana/web3.js` client — discover skills, sign
  the ed25519 payment authorization, settle, and read reputation.
- **Dashboard** (`dashboard/`, Next.js): the Bazaar (skills ranked by on-chain reputation),
  wallet-adapter connect, and ed25519 payment via `signMessage`. Reads skills directly from
  the program.
- **Skill servers** (`agents/`): x402-gated HTTP services that provide the skills (Jupiter
  routing, Pyth prices, Drift signals, Kamino/marginfi rates, Orca analytics, Helius
  classification, …) plus an SDK example agent.

## Payment flow

```
discover (Bazaar)  →  402 challenge  →  consumer create_job (SPL deposit into job vault)
   →  ed25519-signed authorization  →  facilitator complete_job (payout + 20bps fee)
   →  record_job_completion (reputation++)  →  hiring agents read reputation from chain
```

## Why Solana

Sub-cent fees and ~400 ms slots make **per-execution** reputation writes and high-frequency
agent-to-agent hiring loops economically viable. The on-chain registry + reputation layer is
the piece pure payment facilitators leave open.

## Trust model

A single facilitator operator (one keypair) releases escrow and writes reputation today; every
step is verifiable on-chain. Roadmap: threshold (M-of-N) settlement, optimistic completion with
a challenge window, and staked reputation. A `createBrowserJob` SDK helper will move the
consumer deposit fully in-browser for a live in-dashboard run (today proven via
`facilitator/scripts/e2e-devnet.mjs`).
