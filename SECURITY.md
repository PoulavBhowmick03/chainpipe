# Security & Trust Model — ChainPipe

ChainPipe is currently a **devnet prototype**. This document is an honest account
of the trust assumptions and the plan to reduce them. Nothing here should be
treated as production-grade until the roadmap items are complete and the programs
are audited.

## Current trust assumptions (devnet)

| Surface | Today | Risk | Plan |
|---------|-------|------|------|
| Program upgrade authority | Single key (`5cpc…`), **mutable** on all 3 programs | Operator can upgrade/replace program logic | Move to a **Squads multisig**; publish the multisig address; eventually consider freezing |
| Facilitator | Single keypair (`DoNf…`) gates every `complete_node`/`expire_node` | If leaked, attacker can settle claimed nodes | Add `set_facilitator_authority` rotation (done); move key to KMS; longer-term bond/decentralize the role |
| Stake / payment mint | Devnet **test mint**, authority on the facilitator | Infinite test tokens (no real value) | Mainnet uses **real USDC**; faucet removed/disabled (`FAUCET_ENABLED=false`) |
| Job completion | Facilitator-**attested** (checks on-chain state, not output) | A fast-but-wrong agent can be paid | Add result-hash commitment (done) → dispute window / attestation / oracle |
| RPC | Public devnet RPC | Rate limits, no SLA | Dedicated RPC (Helius/Triton) before any real volume |
| Audit | None | Unreviewed program logic | Internal review pass complete; external audit before mainnet |

## Reducing single-key control (recommended order)

1. Create a Squads multisig (2-of-3) for the operator role.
2. `solana program set-upgrade-authority <program> --new-upgrade-authority <multisig>`
   for all three programs (reversible while still authority-held).
3. Transfer the registry/pipeline/bridge **config `operator`** to the multisig via
   the operator-only setters.
4. Rotate the **facilitator authority** to a fresh key held off the public server
   (KMS), using `dag_escrow::set_facilitator_authority`.
5. Document all addresses in `DEPLOYED.md`.

## Proof-of-delivery roadmap

`complete_node` now records a **`result_hash`** committed by the agent's signed
completion. This is the first step; full delivery assurance needs one of:
- a **dispute window** during which the consumer can challenge and trigger a
  slash + refund;
- an **attestation/oracle** that verifies the output off-chain;
- **optimistic settlement** with staked challenges.

## Reporting

This is a prototype with no bug bounty yet. For now, open a GitHub issue or contact
the maintainer. Do not deploy with real funds until the roadmap above is complete
and the programs are audited.
