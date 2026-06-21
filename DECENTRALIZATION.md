# Decentralization Roadmap — ChainPipe

ChainPipe's value (atomic escrow, economic slashing, gated reputation, verifiable
proof-of-delivery) holds **even with a centralized operator** — every settlement, slash,
and reputation write is an immutable on-chain record. But two roles are centralized in v1.
This document is an honest map from where we are to a trust-minimized protocol.

## What is already trustless (v1, today)

- **Escrow custody** — pipeline funds live in a PDA-owned vault; only the `dag_escrow`
  program (via the `[b"pipeline"]` signer) can move them. The operator cannot drain a vault.
- **Atomic cascade refunds** — a missed deadline lets _anyone_ permissionlessly `expire_node`;
  the refund cascades to every downstream node in one instruction.
- **Delivery integrity / availability / authorship** — proof-of-delivery binds an agent's
  signature to `sha256(output)` + `sha256(uri)`; anyone can re-verify the hash and dispute a
  mismatch or an unavailable artifact. The operator cannot fake or swap a delivery.
- **Reputation provenance** — only `dag_escrow`'s `dag_authority` PDA can write reputation,
  with a per-job replay guard. No forged track records.
- **Permissionless finalize** — after the dispute window, `finalize_node` is callable by anyone.

## What is still trusted (v1)

| Role                                                | Power                                                                 | Why it's centralized today                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Operator** (config `operator`, upgrade authority) | Pause, set params, rotate authorities, upgrade programs               | Single key for fast iteration on devnet                                                 |
| **Facilitator-arbiter** (`facilitator_authority`)   | `submit_completion`, and `resolve_dispute` on **subjective** disputes | A single off-chain service attests submissions and rules on "is the output good enough" |

Objective disputes (hash mismatch, unavailability) need **no** trusted arbiter — they're
mechanically checkable. Only _subjective quality_ rulings rest with the facilitator in v1.

## Roadmap

### Phase A — Multi-party operator (built in-program; ops pending)

- ✅ Two-step `propose_operator` / `accept_operator` on all three programs.
- ✅ Emergency `pause`, configurable dispute window, per-incident slash cap.
- ⏳ Move upgrade authority **and** each config `operator` to a **Squads 2-of-3 multisig**
  (runbook in [`SECURITY.md`](./SECURITY.md)). Removes the single-key operator.
- ⏳ Optional timelock on the multisig so parameter changes are announced before they land.

### Phase B — Harden the arbiter role

- Rotate `facilitator_authority` to a **KMS / HSM-held** key off the public server.
- **Bond the facilitator**: require the arbiter to stake into `bonded_registry`, slashable by
  governance if it rules dishonestly — aligning incentives before full decentralization.
- Split "submit" (any bonded facilitator) from "arbitrate" (a separate committee), so no one
  party both attests and judges.

### Phase C — Decentralized arbitration (subjective disputes)

- Replace the single arbiter on `resolve_dispute` with one of:
  - a **committee multisig** of independent, bonded arbiters (k-of-n);
  - an **oracle** (e.g. Switchboard) attesting an off-chain verification result;
  - a **staked-challenge / schelling-point** game where jurors stake on the honest outcome.
- Objective disputes remain auto-resolvable on-chain and never reach arbitration.

### Phase D — Credible neutrality

- External audit (OtterSec / Neodyme / etc.) before mainnet.
- Consider `--final` (frozen) program upgrades, or a long-timelocked governance, once the
  design is stable.
- Compose `reputation_bridge` with the official Solana 8004 / ATOM registry once it exposes a
  CPI interface (the `record_completion` schema already mirrors it).

## Honest framing for reviewers

ChainPipe v1 is a **facilitator-operated protocol with on-chain proof, escrow, and slashing**
— not a fully trustless network. The architecture is built so decentralization is an
**incremental key/authority migration**, not a rewrite: the multisig handoff and bonded-arbiter
hooks already exist in-program. We do not claim more than we ship.
