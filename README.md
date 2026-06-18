# ChainPipe

**Atomic multi-agent pipeline escrow and bonded trust on Solana.**

> Live on **Solana devnet**. Three Anchor programs + a TypeScript SDK + an x402-style
> facilitator + an indexer + a Next.js 15 dashboard. See [`DEPLOYED.md`](./DEPLOYED.md)
> for live program IDs and [`BLOCKERS.md`](./BLOCKERS.md) for build/deploy notes.

---

## What

Two primitives that close the two hardest gaps in the agent economy:

1. **DAG Pipeline Escrow** (`dag_escrow`) — a consumer locks one budget for a whole
   pipeline of cooperating agents expressed as a DAG. Nodes settle individually as
   their dependencies complete; if a node misses its deadline, anyone can expire it and
   the refund **cascades atomically** to every downstream node and back to the consumer —
   in a single instruction.
2. **Bonded Agent Registry** (`bonded_registry`) — agents stake SPL tokens for a trust
   tier (≥10 / ≥100 / ≥1000 USDC → Tier 1/2/3). Tier gates the work an agent may claim.
   Failure slashes stake to the wronged consumer.

A third program, **`reputation_bridge`**, records per-agent reputation (an EMA score with
a replay-guarded job ledger) and is **facilitator-gated**: only `dag_escrow`, via a
program-derived signer (`[b"dag_authority"]`), can write reputation — so no one can forge
a track record without a real settled job.

## Why Solana

Sub-cent fees and ~400 ms slots make per-execution reputation writes and micro-settlements
economically viable at agent scale. Native SPL stablecoins are the payment token, and the
account/PDA model gives every pipeline, node, stake, and reputation record its own
verifiable on-chain account.

## Architecture

```
            stake / slash / open-jobs (CPI)              record_completion / record_failure (CPI)
 bonded_registry  ◀───────────────────────  dag_escrow  ───────────────────────▶  reputation_bridge
   (tier, vault)         signed by               (DAG escrow,          signed by        (EMA, JobRecord
                      dag_authority PDA          cascade refunds)    dag_authority PDA    replay guard)
```

- `sdk/` — `@chainpipe/solana`: pipeline / stake / reputation / discovery helpers (+ IDLs).
- `facilitator/` — Express service: verifies on-chain state, settles/expires nodes, scores jobs.
- `indexer/` — polls devnet, decodes accounts, serves REST + JSON persistence.
- `dashboard/` — Next.js 15, wallet-adapter, 100% Solana-native (zero EVM).
- `scripts/` — `initialize-programs`, `e2e-devnet`, `seed-devnet`.

## Deployed programs (Solana devnet)

| Program | Address |
|---------|---------|
| reputation_bridge | `6RRfs1Ho1bJ3JWXSy3xVth4BTGHWwVwum74ph2LRWWsf` |
| bonded_registry | `26AB6S5crQAkhfx928bnWSHfpQE6wp2Sdt4afFtk7crq` |
| dag_escrow | `3FqvkzppD4ciwkGLrcNoTHUCeHwNbWtot18CkrBdXiJd` |

Full config PDAs and tx signatures in [`DEPLOYED.md`](./DEPLOYED.md).

## Quick start

```bash
# Toolchain: Anchor 0.31.1 (via avm), Solana CLI, Node 20+
npm install

# Build + test all three programs against a local validator (37 tests)
anchor test

# Run the full lifecycle on devnet (real transactions)
npx tsx scripts/e2e-devnet.mts

# Seed demo state (5 agents, 3 pipelines), then run the services + UI
npx tsx scripts/seed-devnet.mts
npm --workspace @chainpipe/indexer start     # :3002
npm --workspace @chainpipe/facilitator start # :3001
npm --workspace @chainpipe/dashboard run dev  # :3000
```

> Build programs with `cargo build-sbf --arch v3` and deploy with
> `solana program deploy ... --program-id keys/<prog>.json` — CPI-dependency crates must
> be built standalone (`--manifest-path`). See [`BLOCKERS.md`](./BLOCKERS.md) D2.

## SDK

```ts
import {
  stakeAndRegister, createPipeline, claimNode, getAgentReputation, DEVNET_ADDRESSES,
} from "@chainpipe/solana";

// Stake to register at a tier
await stakeAndRegister(connection, agent, 100_000_000n, usdcMint, DEVNET_ADDRESSES);

// Lock a 2-node pipeline (node 1 depends on node 0)
await createPipeline(connection, consumer, [
  { allocationUsdc: 40_000_000n, deadlineSlotsFromNow: 9000n, dependencyMask: 0n, requiredTier: 1 },
  { allocationUsdc: 35_000_000n, deadlineSlotsFromNow: 9000n, dependencyMask: 0b001n, requiredTier: 1 },
], DEVNET_ADDRESSES);

// Read reputation
const rep = await getAgentReputation(connection, agentPubkey, DEVNET_ADDRESSES);
```

## Differentiation

| | Per-job x402 facilitators | Official 8004 registry | **ChainPipe** |
|---|---|---|---|
| Multi-job atomicity | ❌ per-job only | n/a | ✅ DAG escrow + cascade refunds |
| Economic stake-for-trust | ❌ | ❌ | ✅ bonded registry + slashing |
| Gated reputation writes | n/a | ❌ un-gated attestation | ✅ CPI-only via `dag_authority` |

## License

MIT
