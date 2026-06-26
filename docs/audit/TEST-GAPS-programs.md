# Test-gap analysis — Anchor programs

> AI-generated, 2026-06-26. Maps the existing 52 tests against the program instructions and
> lists concrete untested cases. **You write the tests** — this is the list of holes, with a
> one-line sketch each, ordered by risk. The highest-risk gaps line up 1:1 with the findings
> in `SECURITY-REVIEW-programs.md`.

## Coverage today (what the suite already proves)

- **`dag_escrow`** (`tests/z_dag_escrow.ts`, 26 cases): create/lock, cyclic-DAG reject,
  node-count>16 reject, claim gating (deps + tier), complete + fee split, reputation CPI on
  complete, expire + cascade refund, slash + failure CPI on claimed-expire, cancel, full
  3-node completion, job_id replay reject, submit→dispute→resolve (upheld true *and* false),
  finalize happy + finalize-too-early, dispute-window bounds/snapshot, pause gating,
  two-step operator transfer.
- **`bonded_registry`** (15): tiers 1/2/3, add_stake upgrade, unstake open-jobs guard,
  cooldown, slash bps + tier-downgrade, **unauthorized-caller reject**, below-min reject,
  migrate idempotency, max-slash cap, operator transfer.
- **`reputation_bridge`** (11) + a units file.

The shape is **happy-path + a handful of negatives**. The negatives that exist are about
*state* (wrong status, deps not met, window open). The class that's missing is *malicious
account substitution* — exactly where the security findings live.

## Critical gaps (write these first — they correspond to live findings)

1. **`finalize_node` with a non-agent destination ATA** (→ CRITICAL-1). Drive a node to
   `Submitted`, advance past the window, call `finalize_node` from any signer passing
   *their own* ATA as `agentTokenAccount` (keep `agent = node.agent`). **Expected once
   fixed:** reject. **Today:** I believe it pays the attacker — this test is the PoC that
   confirms the bug. Every existing finalize test passes `getAssociatedTokenAddressSync(mint,
   agent)`, so this path has never been exercised.

2. **`expire_node` with a mismatched `agent_stake`/`agent`** (→ HIGH-1). Agent A claims a
   node; let it go overdue; call `expire_node` supplying agent **B's** stake/vault/identity.
   **Expected once fixed:** reject. **Today:** B is slashed and A's `open_jobs` stays stuck.
   Assert on both: B's stake unchanged and A's `open_jobs == 0` after a correct expire.

3. **`finalize_node` with a mismatched `agent_stake`** (→ MED-1). Same idea, decrement path:
   confirm the real agent's `open_jobs` returns to 0 and a stranger's counter is untouched.

## High-value functional gaps (correctness, not necessarily exploitable)

4. **`expire_node` with a truncated `remaining_accounts`** (→ MED-2). Build a pipeline where
   node 0 has two downstream dependents; expire node 0 but pass only one dependent. Assert
   what actually happens to `refund_total` and the omitted node's status — pin the behaviour
   so a future change can't silently regress it.

5. **Unstake-after-slash-to-zero.** Slash an agent to 0 stake (tier→0 via `tier_for_lenient`),
   then exercise `request_unstake`/`execute_unstake`. Does a tier-0 agent with a live stake
   account behave sanely? `request_unstake` requires `tier > 0` (L177) — so a fully-slashed
   agent may be unable to reclaim dust. Worth a test to document the intended behaviour.

6. **Multi-level cascade depth.** Existing cascade test is one level (node1→node2). Add a
   3+ level chain (0←1←2←3) and confirm the fixpoint loop expires the whole tail in one tx.

7. **`complete_node` vs the dispute path.** No test asserts that `complete_node` pays
   *without* any dispute window. Add one that documents this is intentional (it's the trust
   assumption the README leans on).

8. **Fee = 0 and fee at max (10000 bps).** Fee math has a `if fee > 0` branch (L365) that's
   never hit with `fee == 0`. Add a config with `fee_bps = 0` and one near the ceiling.

9. **`MAX_NODES` boundary (exactly 16).** Tests reject >16 but don't prove 16 *works*,
   including a 16-node cascade (closest to the `1u64 << i` / mask limits).

## Lower-priority gaps

- `dispute_node` by a **non-consumer** signer → expect reject (guards the `has_one`).
- `dispute_node` **after** the window → expect `DisputeWindowClosed`.
- `resolve_dispute` on a node that isn't `Disputed` → expect reject.
- `migrate_*` on a genuinely old (smaller) account — current tests only prove the
  already-migrated reject, not the actual grow path.
- `init_if_needed` on `agent_reputation`: second job for the same agent updates (not
  re-inits) the EMA — assert `ema_score` carries across two jobs.
- Pause semantics: confirm `finalize_node` is blocked while paused (L534) but refund/expire
  paths stay open (the documented invariant that consumer funds can't be trapped).

## Note on running these

The dag_escrow suite waits on real slot progression for the dispute window
(`tests/z_dag_escrow.ts:606`), so it needs a validator where slots advance. The substitution
PoCs (gaps 1-3) don't need timing beyond what finalize already requires.
