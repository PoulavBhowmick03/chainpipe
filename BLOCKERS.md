# BLOCKERS & Deviations — ChainPipe

## Resolved deviations

### D1 — Anchor version: 0.31.1, not "1.0.2" (Phase 0)
**Issue:** CLAUDE.md rule 10 / Phase 0 specify `anchor-lang = "1.0.2"` and
`anchor_version = "1.0.2"`. Investigation showed this conflated the version of
**avm** (the Anchor Version Manager, which is at `1.0.2`) with the version of
**anchor-cli** itself. The actually-installed Anchor toolchain is **anchor-cli
0.31.1** (via avm), and CLAUDE.md's own Phase 5 SDK spec pins
`@coral-xyz/anchor ^0.31.0` — which only matches a 0.31.x Rust toolchain.
There is no working Anchor 1.0.2 CLI on this machine.

Additionally, the `anchor` binary on `$PATH` (`~/.cargo/bin/anchor`) is an
unrelated **SSV validator client** by Sigma Prime, not Anchor. The real CLI is
invoked via `~/.avm/bin/anchor` (avm dispatcher → 0.31.1).

**Resolution:** All program crates use `anchor-lang`/`anchor-spl` `= "0.31.1"`.
Anchor commands are run through the avm-managed binary at `~/.avm/bin/anchor`.
This satisfies CLAUDE.md's intent ("use Anchor, don't add a separate
solana-program crate; use `anchor_lang::solana_program`") while building against
the toolchain that actually exists.

---

## Open blockers

(none)
