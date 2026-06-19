# Claude Code loop prompt — finish ChainPipe's remaining pieces

Paste the section below into a fresh Claude Code session opened in this repo.

---

You are continuing work on **ChainPipe** (this repo). It's a working Solana **devnet**
prototype: 3 Anchor programs (`dag_escrow`, `bonded_registry`, `reputation_bridge`),
a TypeScript SDK, an Express facilitator + an indexer (both on Fly.io), and a Next.js
15 dashboard (Vercel). Your job is to **run an autonomous loop that closes the
remaining gaps to make it credible as production / grant-ready infrastructure** —
above all the **trust / proof-of-delivery layer**.

## Read first (don't skip)
- `AUDIT.md` — the production-readiness review: what's done, what's missing (P0–P2).
- `SECURITY.md` — trust model + decentralization roadmap.
- `BLOCKERS.md` — hard-won operational gotchas (toolchain, build, deploy). Obey them.
- `CLAUDE.md`, `DEPLOYED.md`, `README.md` — product spec, live addresses, overview.
- The programs in `programs/*/src/lib.rs`, `tests/*.ts`, `sdk/src`, `facilitator/src`,
  `indexer/src`, `dashboard/`.

## Operating rules (the loop)
1. Maintain a task list (TaskCreate/TaskUpdate). Work the phases below in order.
2. **Verify before advancing.** After any Rust change: `anchor test` must pass
   (currently 37). After any TS change: the relevant `npm run build` / `next build`
   must pass. Never accumulate broken state.
3. **Commit at the end of every phase** (`feat(...)`, `test(...)`, `docs(...)`),
   push to `main` and keep `pivot/chainpipe` in sync.
4. **Be honest.** Never mark a task done that isn't, and never claim something works
   that you haven't verified. Anything you cannot do autonomously goes in a new
   `HUMAN-TODO.md` with exact, ordered steps and what to verify afterward.
5. Update `AUDIT.md` / `SECURITY.md` / `DEPLOYED.md` as state changes.

## HARD GUARDRAILS — do NOT do these autonomously
These are irreversible / financial / outward-facing. **Prepare scripts + a runbook
and STOP for explicit human approval** — do not execute:
- Deploying to **mainnet** or moving any **real funds / real USDC**.
- Creating or transferring authority to a **Squads multisig**, or rotating any
  program upgrade authority / config operator / facilitator key to a new key.
- **Publishing to npm**, changing DNS, or anything that spends money.
- Putting the **operator/upgrade-authority private key on any server** (the
  facilitator may only ever hold its own keypair, as today).
Everything you build and test runs on **devnet**. Stage the rest behind humans.

## Toolchain / deploy facts (from BLOCKERS.md — use these, don't rediscover)
- Real Anchor is **0.31.1 via `~/.avm/bin/anchor`** (the `anchor` on PATH is an
  unrelated SSV tool). Prefix: `export PATH="$HOME/.avm/bin:$PATH"`.
- Build programs for devnet with **`cargo build-sbf --arch v3`**. CPI-dependency
  crates (`bonded_registry`, `reputation_bridge`) must be built **standalone** via
  `--manifest-path programs/<x>/Cargo.toml` (workspace feature-unification strips
  their entrypoint otherwise). Deploy/upgrade with
  `solana program deploy target/deploy/<x>.so --program-id keys/<x>.json --url devnet`.
- After a program change: rerun `anchor test`, then **copy regenerated IDLs+types**
  to `sdk/src/idl/` AND `dashboard/lib/idl/`, rebuild the SDK, and propagate signature
  changes to SDK/facilitator/dashboard.
- Dashboard deploys **standalone** to Vercel: `cd dashboard && vercel deploy --prod --yes`
  (it has its own `vercel.json`; public pages are SSR, wallet actions client-side).
- Fly apps: `chainpipe-facilitator`, `chainpipe-indexer` —
  `flyctl deploy -c fly.<x>.toml -a chainpipe-<x> --remote-only`. Facilitator keypair
  is the `FACILITATOR_KEYPAIR_JSON` secret; faucet is env-gated (`FAUCET_ENABLED`);
  indexer has a durable volume.
- Public devnet RPC **rate-limits**; throttle scripts (`E2E_THROTTLE_MS`) or use a
  dedicated RPC via `SOLANA_RPC_URL`.
- Account-layout note: adding **variants to an enum** (e.g. `NodeStatus`) is size-safe
  (status is 1 byte). Adding **fields to an existing account struct** changes its size
  and **bricks existing on-chain accounts** — avoid it, or use a **separate companion
  PDA**, or do a clean devnet redeploy + re-seed (then update IDLs/SDK/UI/DEPLOYED.md).

---

## PHASE 1 — Trust / proof-of-delivery layer (the headline gap)
Today `complete_node` is facilitator-attested and only emits an agent-signed
`result_hash`; payment ≠ proof of delivery. Implement **optimistic settlement with a
dispute window** so consumers aren't trusting the facilitator blindly:

- `submit_completion(node, result_hash)` (replaces immediate settle): facilitator-
  gated; marks node **`Submitted`**, stores `result_hash` + `submitted_at_slot`, starts
  a dispute window of `DISPUTE_SLOTS` (config). No payout yet.
- `dispute_node(node, reason_hash)`: callable by the **consumer** within the window;
  marks **`Disputed`**.
- `finalize_node(node)`: permissionless after the window with no dispute → pays agent
  (minus fee) + operator fee, marks **`Settled`**, records completion reputation.
- `resolve_dispute(node, upheld)`: arbiter path (for v1, the operator/facilitator —
  document this clearly as a centralized v1 with a decentralized-arbitration roadmap).
  Upheld → refund consumer + slash agent + failure reputation; rejected → finalize.
- Keep `NodeStatus` size-safe by only **adding enum variants** (`Submitted`,
  `Disputed`). For the extra per-node data (`result_hash`, `submitted_at_slot`,
  `disputed`), prefer a **companion `NodeSettlement` PDA** created at submit time so
  existing accounts don't break — OR do a clean devnet redeploy + re-seed if simpler;
  whichever you choose, keep IDLs/SDK/facilitator/dashboard in lockstep.
- Tests: window expiry → finalize pays; dispute within window → resolve refunds+slashes;
  dispute after window rejected; reputation/replay still hold. Keep the suite green.
- Propagate to the **facilitator** (`/complete` → submit; a `/finalize` route or a
  small finalizer loop) and the **dashboard** `/work` + pipeline detail (show
  Submitted/dispute-window countdown/Disputed; consumer "dispute" action).
- Redeploy programs (devnet, v3), facilitator (Fly), dashboard (Vercel). Update
  `SECURITY.md` proof-of-delivery section + `AUDIT.md`.

## PHASE 2 — Decentralization prep (PREPARE ONLY — guardrail)
- Write `scripts/transfer-authority.md` runbook + a `scripts/set-upgrade-authority.sh`
  that, given a multisig address as an argument, runs `solana program
  set-upgrade-authority` for all three programs and the config-operator setters —
  but **do not run it**. Document exactly what to verify on the explorer after.
- Add a `set_operator` instruction to each program's config if missing (so operator
  can be moved to a multisig). Test it. (Adding an instruction is safe.)
- Add facilitator-key rotation docs (the on-chain `set_facilitator_authority` already
  exists). Record everything in `HUMAN-TODO.md` (create Squads, run the script, verify).

## PHASE 3 — Mainnet readiness (PREPARE ONLY — guardrail)
- Parametrize all scripts/services for cluster + mint via env (`SOLANA_RPC_URL`,
  `CHAINPIPE_USDC_MINT`); default mainnet USDC mint documented. Ensure `FAUCET_ENABLED`
  defaults **off** for non-devnet.
- Write `scripts/mainnet-deploy.md`: build (v3), fund, deploy in dependency order,
  init configs, set real-USDC mint, verify on explorer, gate faucet. **Do not deploy.**
- Add a dedicated-RPC note. Put the go/no-go + cost in `HUMAN-TODO.md`.

## PHASE 4 — Hardening
- Tests for SDK / facilitator / indexer beyond the current units (cover pdas, the
  faucet, scorer, serialize, the new dispute flow client paths). Wire into CI.
- Harden `expire_node` cascade (verify the full node set on-chain / bound it; add a
  test for a malicious partial `remaining_accounts`).
- Add error tracking / structured logs to the Fly services + a `/ready` check.
- Optional, migration-safe: on-chain agent **skill** via a companion `AgentProfile`
  PDA + a `set_skill` instruction; surface in bazaar/indexer. Richer reputation
  scoring (quality + decay) in the scorer.

## PHASE 5 — Docs & demo
- Update `AUDIT.md` checklist to reflect everything now done; keep the honest register.
- Write `scripts/DEMO.md`: a tight 2–3 min walkthrough script (faucet → stake →
  build pipeline → claim → submit → dispute/finalize → cascade) for the human to
  record. (You can't record video — leave it in `HUMAN-TODO.md`.)
- Finalize `HUMAN-TODO.md`: video, Squads multisig, mainnet+real-USDC, external audit,
  npm publish, one external test run — each with exact steps.

## Definition of done
All 5 phases committed and (for devnet) deployed + verified; `anchor test` + all builds
green; `AUDIT.md`/`SECURITY.md`/`DEPLOYED.md` current; `HUMAN-TODO.md` lists every
remaining human/financial/irreversible step with precise instructions. Then summarize
what changed, what's live on devnet, and exactly what the human must do next.
