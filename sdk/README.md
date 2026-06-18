# @poulav/x402-solana

TypeScript SDK for the **LedgerForge** x402 payment rail on **Solana** — discover, pay for,
and execute on-chain agent skills.

```bash
npm install @poulav/x402-solana @solana/web3.js
```

## Quickstart

```ts
import { LedgerForgeClient } from '@poulav/x402-solana'
import { Keypair } from '@solana/web3.js'

const client = new LedgerForgeClient({
  facilitatorUrl: 'https://ledgerforge-sol-facilitator.fly.dev',
  keypair: Keypair.fromSecretKey(secret), // a funded devnet keypair
})

// 1. Discover skills (ranked by on-chain reputation)
const skills = await client.listSkills()

// 2. Get a payment challenge, sign it with ed25519, settle, call the skill
const result = await client.invokeSkill(skillId, { query: 'top Solana pools by APR' })
console.log(result.output)
console.log(result.receipt.explorerUrl) // explorer.solana.com
```

## How it works

The consumer signs an **ed25519** authorization over a canonical message (no gas, no
accounts). The facilitator verifies it, releases the SPL escrow via `complete_job`, and
writes reputation via `record_job_completion`. There are no private keys in the browser —
dashboards use `@solana/wallet-adapter` and `signMessage`; programmatic agents pass a
`Keypair` (or `secretKey`) to the client.

## Configuration

| Option | Default |
|---|---|
| `facilitatorUrl` | `https://ledgerforge-sol-facilitator.fly.dev` |
| `bazaarUrl` | LedgerForge indexer |
| `rpcUrl` | `https://api.devnet.solana.com` |
| `cluster` | `devnet` |
| `keypair` / `secretKey` | consumer signer |

## API

- `listSkills(filter?)` / `getSkill(id)` — Bazaar discovery
- `getPaymentChallenge(skillId, overrides?)` — facilitator 402 challenge
- `signPayment(challenge, opts)` — ed25519-signed `PaymentProof`
- `facilitate(proof)` — submit for on-chain settlement
- `invokeSkill(skillId, opts)` — the full discover → pay → settle → call loop

MIT.
