# LedgerForge — Solana live deployments

| Component | URL / address | Host |
|---|---|---|
| **Dashboard** | https://dashboard-xi-sooty-72.vercel.app | Vercel |
| **Facilitator** | https://ledgerforge-sol-facilitator.fly.dev | fly.io (sin) |
| **Programs (devnet)** | see [`DEPLOYED.md`](./DEPLOYED.md) | Solana devnet |

- Facilitator `/health` → `{status:ok, network:solana, cluster:devnet}`; ed25519 verify + complete_job/record_job_completion settlement.
- Dashboard env: `NEXT_PUBLIC_FACILITATOR_URL`, `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`, `NEXT_PUBLIC_SOLANA_RPC`. Bazaar reads skills directly from devnet (no indexer service needed).
- Indexer service: superseded for Solana by direct RPC reads (`useSolanaSkills`) + `solana/scripts/indexer.mjs`; the legacy EVM `indexer/` is not deployed for Solana.
- Operator key set via `fly secrets set SOLANA_OPERATOR_SECRET` (devnet keypair).
