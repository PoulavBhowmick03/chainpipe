# Security & Trust Model — ChainPipe

ChainPipe is currently a **devnet prototype**. This document is an honest account
of the trust assumptions and the plan to reduce them. Nothing here should be
treated as production-grade until the roadmap items are complete and the programs
are audited.

## Current trust assumptions (devnet)

| Surface | Today | Risk | Mitigation status |
|---------|-------|------|-------------------|
| Program upgrade authority | Single key (`5cpc…`), **mutable** on all 3 programs | Operator can upgrade/replace program logic | Runbook below moves it to a **Squads multisig**; two-step in-program operator transfer is built. Human step (create + co-sign multisig). |
| Config operator | Single key per config | Operator can pause / set params / rotate authorities | **Two-step `propose_operator`/`accept_operator`** built on all 3 programs → hand to multisig without fat-finger risk |
| Emergency stop | **`paused` flag + `set_paused`** (operator) | — | Built: pauses value-in/payout paths (`create_pipeline`, `claim_node`, `complete_node`, `submit_completion`, `finalize_node`); refund/dispute paths (`expire_node`, `dispute_node`, `resolve_dispute`, `cancel_pipeline`) stay open so consumer funds can never be trapped |
| Facilitator | Single keypair (`DoNf…`) gates `complete_node`/`submit_completion`/`resolve_dispute` | If leaked, attacker can settle/submit/arbitrate | `set_facilitator_authority` rotation built; move key to KMS; longer-term bond/decentralize the role |
| Dispute arbiter | Facilitator authority (v1, centralized) resolves disputed nodes | Arbiter can rule unfairly on subjective disputes | **Objective disputes** (hash mismatch / unavailable) are mechanically checkable by anyone; **subjective** ones need the v2 decentralized arbiter (roadmap) |
| Slashing | `slash_bps` per incident, now bounded by `max_slash_bps` (default 100%, operator-tightenable) | Over-slashing | **Per-incident cap** built (`set_max_slash_bps`) |
| Job completion | Agent signs a **uri-bound delivery proof**; consumer can re-verify the hash and dispute | A fast-but-wrong agent must survive the dispute window | **Proof-of-delivery + dispute window built** (see below) |
| Stake / payment mint | Devnet **test mint**, authority on the facilitator | Infinite test tokens (no real value) | Mainnet uses **real USDC**; faucet disabled (`FAUCET_ENABLED=false`) |
| RPC | Public devnet RPC | Rate limits, no SLA | Dedicated RPC (Helius/Triton) before any real volume |
| Audit | None | Unreviewed program logic | Internal review pass complete; external audit before mainnet |

## Live operator controls (Phase 15)

All operator-only and gated by `has_one = operator` on the config PDA:

- `set_paused(bool)` — emergency stop / resume (`dag_escrow`).
- `set_dispute_window(slots)` — bounded `[MIN_DISPUTE_SLOTS, MAX_DISPUTE_SLOTS]`; the
  value is **snapshotted onto each `NodeSettlement` at submit time**, so changing it can
  never shorten an in-flight node's window out from under a consumer (`dag_escrow`).
- `set_max_slash_bps(bps)` — per-incident slash ceiling, caller-independent (`bonded_registry`).
- `set_facilitator_authority(pubkey)` — rotate the settlement/arbiter key (`dag_escrow`).
- `set_dag_escrow_authority(pubkey)` — rotate the CPI signer (`bonded_registry`, `reputation_bridge`).
- `propose_operator(pubkey)` + `accept_operator()` — two-step ownership transfer (all 3).

## Proof-of-delivery (built)

The optimistic-settlement path makes agent delivery **objectively verifiable**:

1. The agent hosts its output at a content-addressed `uri` (IPFS CID / Arweave id / https).
2. It computes `result_hash = sha256(output)` and ed25519-signs the canonical
   `deliveryMessage = pipeline ‖ nodeIndex ‖ jobId ‖ resultHash ‖ sha256(uri)` — binding the
   signature to **both** the output hash and the retrieval pointer (no swap, no replay).
3. The facilitator `submit_completion`s; `uri` + `result_hash` go on-chain in `NodeSettlement`
   and a dispute window opens. No funds move yet.
4. **Anyone** (consumer, third party) can fetch the `uri`, recompute `sha256`, and compare to
   the on-chain `result_hash`. A mismatch — or an unresolvable `uri` — is objective grounds
   to `dispute_node` within the window.
5. No dispute → `finalize_node` pays the agent (acceptance-by-timeout). A dispute → the
   arbiter `resolve_dispute`s: upheld → refund consumer + slash agent + record failure;
   rejected → settle + pay agent.

**Honestly trustless:** integrity (output can't be swapped), availability-as-a-condition,
authorship (signature binds output to the agent key). **Still trusted (v1):** subjective
"is it good enough" rulings, decided by the facilitator-arbiter. The v2 roadmap replaces
that single arbiter with a decentralized committee/oracle. See `DECENTRALIZATION.md`.

## Runbook — reduce single-key control (devnet → multisig)

Do this **after** the final program upgrade + `migrate_*` (so future upgrades execute as
Squads transactions, not before). Program IDs:

```
dag_escrow         3FqvkzppD4ciwkGLrcNoTHUCeHwNbWtot18CkrBdXiJd
bonded_registry    26AB6S5crQAkhfx928bnWSHfpQE6wp2Sdt4afFtk7crq
reputation_bridge  6RRfs1Ho1bJ3JWXSy3xVth4BTGHWwVwum74ph2LRWWsf
```

1. **Create a Squads 2-of-3 multisig**; note its authority address `<MULTISIG>`. *(human)*
2. **Run the one-time config migrations** (grows live config PDAs to the hardened layout):
   ```bash
   npx tsx scripts/migrate-configs.mts        # migrate_pipeline_config / _registry_config / _bridge_config
   ```
3. **Transfer upgrade authority** to the multisig (reversible while still held):
   ```bash
   for P in 3FqvkzppD4ciwkGLrcNoTHUCeHwNbWtot18CkrBdXiJd \
            26AB6S5crQAkhfx928bnWSHfpQE6wp2Sdt4afFtk7crq \
            6RRfs1Ho1bJ3JWXSy3xVth4BTGHWwVwum74ph2LRWWsf; do
     solana program set-upgrade-authority "$P" --new-upgrade-authority <MULTISIG> --url devnet
   done
   solana program show <each> --url devnet      # verify Authority == <MULTISIG>
   ```
4. **Transfer each config `operator`** to the multisig via the two-step flow: current
   operator `propose_operator(<MULTISIG>)` on all 3, then the multisig co-signs
   `accept_operator()` (proves key control). *(co-sign = human)*
5. **Rotate the facilitator authority** to a KMS-held key via
   `dag_escrow::set_facilitator_authority`.
6. **Record** `<MULTISIG>`, the migration tx sigs, and realloc'd config sizes in `DEPLOYED.md`.
7. *(optional, irreversible)* `solana program set-upgrade-authority <P> --final` to freeze upgrades.

## Reporting

This is a prototype with no bug bounty yet. For now, open a GitHub issue or contact
the maintainer. Do not deploy with real funds until the roadmap above is complete
and the programs are audited.
