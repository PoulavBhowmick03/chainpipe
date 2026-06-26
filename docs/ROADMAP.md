# ChainPipe — what's left to build

> Working roadmap, 2026-06-26. Sequenced toward three milestones rather than listed flat.
> Grounded in [`DECENTRALIZATION.md`](../DECENTRALIZATION.md) (phases A–D) and
> [`PRODUCT.md §12`](./PRODUCT.md) (buckets A/B/C) — read those for the detailed rationale;
> this doc is the **priority order and the gating dependencies**.
>
> **Just shipped (this session):** the `finalize_node` payout-theft fix + `expire_node`
> mis-slash fix are on `main` and deployed. That clears the one true fund-safety blocker that
> stood in front of Milestone 2.

## State of play

Working devnet prototype: all core flows, optimistic-settlement dispute layer,
proof-of-delivery, and the hardening pass (pause, tunable dispute window, slash cap, two-step
operator transfer) are implemented and tested (52 tests). Value is play-money; trust is a
single facilitator-arbiter + single operator key. The architecture is built so
decentralization is a key/authority migration, not a rewrite.

---

## Milestone 1 — "Demo-ready" (days)

Goal: a recording-quality, end-to-end run that never embarrasses you on camera.

1. **Regression tests for the two fixes just shipped.** Write the substitution PoCs from
   `docs/audit/TEST-GAPS-programs.md` (finalize to a non-agent ATA, expire with a mismatched
   stake) and confirm they now fail closed. *Gating:* you don't demo a security fix you can't
   prove. **← do this first.**
2. **A keeper for the demo.** `expire_node`/`finalize_node` are permissionless but someone must
   call them. For the video a manual button is fine, but a tiny keeper loop (sweep
   overdue/finalizable nodes) makes the "cascade refund happens automatically" beat land
   without you clicking. (Also a real Milestone-2 item — see below.)
3. **Seed a clean demo state.** `scripts/seed-devnet.mts` exists; pre-build the exact pipeline
   the script walks (one happy path + one deadline-miss cascade) so the recording is
   deterministic.
4. **Delete dead UI** (`ParallaxHero.tsx`, `HeroDag.tsx`) and fix the misleading
   `PartiallyRefunded` status label (`dag_escrow` ~L784: redundant `if/else`, and it flips on
   *any* expiry mid-run) — it's on screen during the cascade beat, so it's worth getting right.

## Milestone 2 — "Grant / audit submittable" (weeks)

Goal: a credible external reviewer can't poke an obvious hole.

5. **External audit** (OtterSec / Neodyme). *Gating for any mainnet/real-funds step.* Everything
   below can run in parallel with the audit engagement.
6. **Operator → Squads 2-of-3 multisig.** In-program two-step transfer already exists; the ops
   handoff is pending: create the multisig, run `scripts/migrate-configs.mts`, move upgrade +
   each config `operator` authority. Removes the single-key operator. (DECENTRALIZATION Phase A.)
7. **Harden the arbiter.** Move `facilitator_authority` to a KMS/HSM key; **bond** the
   facilitator (stake it, slashable for dishonest rulings); split "submit" from "arbitrate."
   (Phase B.) This is the highest-trust remaining role — prioritize the KMS move even before
   bonding.
8. **Indexer durability.** Single JSON file + 5 s polling + no event log is a demo-only design;
   the job-spec layer depends on it being up. Move to a real datastore + event streaming, and a
   dedicated RPC (Helius/Triton) before any real volume.
9. **Clear the remaining audit-doc LOWs and the two `tsc` type errors** so a strict type-check
   and a re-review pass come back clean.

## Milestone 3 — "Mainnet / real value" (after audit)

Goal: real USDC, trust-minimized enough to mean it.

10. **Mainnet path.** Real USDC mint, faucet **disabled** (`FAUCET_ENABLED=false`), the
    real-token path exercised end-to-end (currently untested).
11. **Decentralized arbitration for subjective disputes** — bonded k-of-n committee, an oracle,
    or a staked-challenge game. Objective disputes (hash mismatch, unavailability) already need
    no arbiter. (Phase C.)
12. **Credible neutrality** — timelocked governance or frozen (`--final`) upgrades; compose
    `reputation_bridge` with the Solana 8004 / ATOM registry once it exposes a CPI interface
    (the `record_completion` schema already mirrors it). (Phase D.)

---

## Dependency graph (what blocks what)

```
[1 regression tests] ─┐
                      ├─▶ Milestone 1 (demo) ──▶ [demo video]
[2 keeper] [3 seed] [4 polish] ┘
[5 audit] ──────────────────────────────────▶ blocks ▶ [10 mainnet]
[6 multisig] [7 arbiter KMS] ─ parallel w/ audit ─▶ Milestone 2
[8 indexer] [9 type errors] ─ parallel ────────────▶ Milestone 2
[11 decentralized arbitration] [12 neutrality] ── after [5] ──▶ Milestone 3
```

## The one-line version for a pitch

> "Core protocol works and is hardened; the path from here is an **incremental
> key-authority migration plus an audit**, not a rewrite — multisig handoff and bonded-arbiter
> hooks already exist in-program."

## Open product questions (your call, not derivable from code)

- **Disable legacy `complete_node`?** It bypasses proof-of-delivery. Keeping it is a trust
  hole; removing it forces every settlement through the dispute window. Decide before mainnet.
- **Keeper: protocol-run or incentivized third-party?** A permissionless keeper-reward (small
  cut of the fee for whoever calls `finalize`/`expire`) would decentralize liveness — but it's
  a tokenomics decision, not a code one.
- **Target buyer for v1 real-value:** which concrete agent-pipeline use case do you lead the
  go-to-market with? That choice should drive which demo pipeline you hard-code in Milestone 1.
