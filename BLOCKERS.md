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

### D2 — Devnet deploy: SBPFv3 + standalone CPI-dep builds (Phase 4)
**Issue A (SBPF version):** `anchor build` / default `cargo build-sbf` emit SBPFv0
(`e_flags=0`). Devnet has activated SIMD-0178/0189/0377 (SBPFv3
deployment+execution) and deprecated v0 deployment, so v0 deploys fail with
"Detected sbpf_version ... not enabled". v1 produced a local "Entrypoint out of
bounds" with this CLI. **Fix:** build with `cargo build-sbf --arch v3`.

**Issue B (empty CPI-dependency .so):** Building the whole workspace at once
unifies Cargo features. Because `dag_escrow` depends on `bonded_registry` and
`reputation_bridge` with `features=["cpi"]` (→ `no-entrypoint`), the standalone
`.so` for those two crates is emitted WITHOUT an entrypoint (~544 bytes) and
fails to deploy ("invalid file header"). **Fix:** build each CPI-dependency
program with its own `--manifest-path` so feature unification doesn't strip the
entrypoint. `dag_escrow` (the leaf) builds fine in either mode.

**Issue C (stray buffers):** Failed deploys leave buffer accounts holding SOL.
Recover with `solana program show --buffers --url devnet` + `solana program
close <buffer> --url devnet`.

### D3 — `BN` import under ESM/tsx (Phase 4)
`import { BN } from "@coral-xyz/anchor"` is not a valid ESM named export and
`anchor.BN` was undefined at runtime. Import from `bn.js` directly:
`import BN from "bn.js"`.

### D4 — SDK uses @solana/web3.js v1, not v2 (Phase 5)
CLAUDE.md Phase 5 suggested `@solana/web3.js@2` (functional API). Anchor 0.31's
IDL client and the rest of the stack (facilitator, indexer, wallet-adapter) are
built on web3.js v1, and the Phase 5 function signatures themselves use v1 types
(`Connection`, `Keypair`, `TransactionSignature`). Using v2 would fracture the
codebase. The SDK therefore standardizes on web3.js v1 + @coral-xyz/anchor 0.31
for a coherent, working stack. Addresses remain configurable via
`ChainPipeAddresses` (the IDL `address` is overridden at construction).

### D5 — Dashboard React/types version pinning (Phase 8)
`next build` initially failed two ways: (1) `react-dom/client` not found because a
transitive `react-dom@16.14.0` hoisted to the workspace root next to `next`;
(2) `ConnectionProvider cannot be used as a JSX component` because several
`@solana/wallet-adapter*` packages bundle a nested `@types/react@19`
(`ReactNode | Promise<ReactNode>`) that clashes with the dashboard's React 18.
**Fix:** root `overrides` pin `react`/`react-dom`/`@types/react`/`@types/react-dom`
to 18.x, and the nested `@types/react@19` copies under
`node_modules/@solana*/.../node_modules/@types/react` are removed so resolution
falls back to the single root `@types/react@18`. Also alias `pino-pretty: false`
in `next.config.mjs` (optional logger pulled by a Solana transitive dep). If a
future `npm install` reintroduces nested `@types/react@19`, re-remove them.

## Open blockers

(none)
