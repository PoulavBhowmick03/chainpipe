# AGENTS.md — LedgerForge build guide

> Authoritative reference for any agent/contributor working in this repo. LedgerForge is a
> reputation-native marketplace for AI-agent skills on **Solana**. See
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the design and [`DEPLOYED.md`](./DEPLOYED.md)
> for live program IDs + tx signatures.

## Repo layout

| Path | What |
|---|---|
| `solana/programs/` | Anchor programs: `skill_registry`, `x402_escrow`, `bazaar_listings` |
| `solana/scripts/`, `solana/tests/` | indexer script + integration tests (`npm test`) |
| `facilitator/` | x402 facilitator (ed25519 verify → `complete_job` → reputation). fly.io |
| `sdk/` | `@poulav/x402-solana` TypeScript SDK |
| `dashboard/` | Next.js Bazaar + wallet-adapter + ed25519 payment. Vercel |
| `agents/` | Solana skill server (`skills-server`) + SDK example agent (`scout`) |

## Build & test

```bash
# Programs (requires agave/solana-cli >= 4.0; build for the arch devnet enables)
cd solana && cargo build-sbf --arch v3 && npm test       # integration tests vs devnet

# SDK / facilitator / agents
cd sdk && npm install && npm run build
cd facilitator && npm install && npm run build
cd agents && npm install && npm run build

# Dashboard
cd dashboard && npm install && npm run build              # next build, 8 routes
```

## Run

```bash
cd agents && npm run skills-server      # Solana skill server (:3005)
cd facilitator && npm run dev           # x402 facilitator (:3001)
cd dashboard && npm run dev             # Bazaar (:3000)
node facilitator/scripts/e2e-devnet.mjs # full register→deposit→settle→reputation loop
node facilitator/scripts/seed-devnet.mjs# seed the Bazaar with skills + settled jobs
```

## Deploy

- **Programs → devnet:** see [`DEPLOY.md`](./DEPLOY.md) (`solana program deploy` + init).
- **Facilitator → fly.io:** `cd facilitator && fly deploy` (operator key via `fly secrets`).
- **Dashboard → Vercel:** `cd dashboard && vercel --prod`.

Live URLs are in [`DEPLOYMENTS.md`](./DEPLOYMENTS.md).

## Conventions

- Payments: consumer signs an **ed25519** authorization over the canonical message; the
  facilitator (single operator, v1) settles via `complete_job` and writes reputation.
- Tokens: SPL (USDC). Escrow funds sit in a job-PDA-owned vault.
- Reputation is usage-derived (every settled job bumps `total_jobs`/`score` on the `Skill` PDA).
