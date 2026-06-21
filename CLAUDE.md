## PROJECT: ChainPipe

**What we are building:** A two-primitive Solana protocol that provides:
1. **DAG Pipeline Escrow** — atomic multi-job payment settlement across chains of cooperating AI agents with cascading refunds on failure
2. **Bonded Agent Registry** — staking-for-trust layer where agents put capital at risk, with facilitator-gated reputation writes via ChainPipe's own `reputation_bridge` program, **designed to be composable with** the official Solana 8004 / ATOM registry (the `record_completion` schema mirrors 8004 so a CPI upgrade path exists — this is a forward integration, not a live tie-in)

**Why it exists:** Every existing x402 facilitator (Dexter, PayAI, MCPay) settles individual job-level payments with no atomicity across pipelines. The official 8004 registry has un-gated attestation — anyone can write reputation with no proof a job occurred. ChainPipe closes both gaps.

**Repository:** `https://github.com/PoulavBhowmick03/chainpipe-solana`

**Target:** Superteam India microgrant + Solana Foundation public-goods grant

---

## RULES FOR CLAUDE CODE

1. **Never move to the next phase until the current phase's verification checklist passes completely.** If a check fails, fix it inline before continuing.
2. **Update `CLAUDE.md`** at the top of each phase's section with the current status: `[ ] TODO` → `[~] IN PROGRESS` → `[x] DONE`.
3. **Update `README.md`** after every phase that adds user-facing functionality.
4. **Update `DEPLOYED.md`** every time a program is deployed or a new tx is produced.
5. **Run `anchor test` after every change to any Rust file.** Do not accumulate broken state.
6. **Run `npm run build` or `next build` after every change to any TypeScript/Next.js file.**
7. **Commit to git at the end of every phase** with a message like `feat(phase-1): bonded_registry program complete, 12/12 tests passing`.
8. If you hit an error you cannot fix in 3 attempts, write the error and your diagnosis to `BLOCKERS.md` and continue with the next sub-task in the phase.
9. **Never hardcode private keys, RPC URLs, or wallet paths.** Use `.env` loaded via `dotenv`.
10. All Anchor programs use **Anchor v1.x** (`anchor-lang = "1.0.2"`) and **Solana v2** (platform-tools `>=1.42`). Do not add a separate `solana-program` crate dependency — use `anchor_lang::solana_program` throughout.

---

## TECH STACK

```
programs/
  bonded_registry/     — Anchor v1.x (Rust)
  dag_escrow/          — Anchor v1.x (Rust)
  reputation_bridge/   — Anchor v1.x (Rust)

sdk/                   — @chainpipe/solana (TypeScript, published to npm)
  src/
    pipeline.ts        — Pipeline builder and settlement
    stake.ts           — Stake/unstake/tier management
    reputation.ts      — ATOM reputation reads
    discovery.ts       — Bazaar query helpers
    index.ts

facilitator/           — Express + TypeScript
  src/
    server.ts
    verifier.ts        — Completion signal verification
    settler.ts         — Anchor CPI for complete_node, slash_stake, record_reputation
    scorer.ts          — Job quality scoring heuristic

indexer/               — TypeScript, Solana RPC subscriptions
  src/
    decoder.ts         — Decode pipeline + agent account states
    api.ts             — REST endpoints for dashboard

dashboard/             — Next.js 15 (App Router)
  app/
  components/
    PipelineBuilder.tsx
    AgentCard.tsx
    BazaarTable.tsx

scripts/
  e2e-devnet.mts       — Full end-to-end loop: stake → create pipeline → settle nodes → expire → cascade refund → reputation write
  seed-devnet.mts      — Seed 5 agents and 3 pipelines for demo

Anchor.toml
package.json           — workspace root
.env.example
README.md
CLAUDE.md              — this file
DEPLOYED.md
BLOCKERS.md
```

---

## PHASE STATUS TRACKER

Update these as you go:

- [x] **Phase 0** — Repo scaffold, Anchor workspace init, env setup
- [x] **Phase 1** — `bonded_registry` Anchor program + tests
- [x] **Phase 2** — `dag_escrow` Anchor program + tests
- [x] **Phase 3** — `reputation_bridge` Anchor program + tests (built before Phase 2: dag_escrow CPIs into it)
- [x] **Phase 4** — Deploy all 3 programs to devnet, populate DEPLOYED.md (SBPFv3; see BLOCKERS.md D2)
- [x] **Phase 5** — TypeScript SDK (`@chainpipe/solana`) (web3.js v1 for stack coherence; see BLOCKERS.md D4)
- [x] **Phase 6** — Facilitator service (Express) — /health + POST /complete (200) + replay (409) + POST /expire (200) all verified live on devnet via `scripts/verify-facilitator.mts`
- [x] **Phase 7** — Indexer — builds + polls devnet; non-zero counts validated after seed; restart persistence verified (Store reloads store.json: 11 agents / 4 pipelines)
- [x] **Phase 8** — Next.js 15 dashboard (100% Solana-native, wallet-adapter) — next build 0 errors, 8 routes, zero EVM imports (see BLOCKERS.md D5)
- [x] **Phase 9** — E2E devnet script (full loop with real tx signatures) — runs clean; stake×3 tiers → pipeline → settle+fee+rep → tier-gated claim → expire+slash+failure+refund
- [x] **Phase 10** — Seed script + README + DEPLOYED.md finalization — 5 agents + 3 pipelines seeded; indexer confirmed non-zero (4 pipelines, 11 agents, minTier filter works)

### POST-AUDIT CONTINUATION (Phases 11–17)

A 2026-06-21 end-to-end audit found an uncommitted/half-integrated trust-dispute layer
and several P0 gaps. These phases finish + harden + package it. Plan:
`~/.claude/plans/i-have-the-entire-moonlit-badger.md`.

**TOOLCHAIN NOTE:** the `anchor` on PATH (`~/.cargo/bin/anchor`) is the Sigma Prime SSV
validator, NOT the framework CLI. Use `PATH="$HOME/.avm/bin:$PATH" anchor …`
(avm-managed anchor-cli 0.31.1) for all build/test/deploy.

- [x] **Phase 11** — Unblock: IDL sync (target/ → sdk + dashboard), SDK build fixed, all builds green, `anchor test` 41/41 (incl. 4 dispute tests)
- [x] **Phase 12** — Proof-of-delivery in dag_escrow — NodeSettlement uri/uri_len, submit_completion+InvalidUri, dispute_node reason_code, events; SDK encodeUri/decodeUri; `anchor test` 43/43
- [~] **Phase 13** — Facilitator dispute routes (/submit,/finalize,/resolve,/settlement) + e2e dispute+proof demo — CODE DONE, builds green; live devnet upgrade deferred to funded session (BLOCKERS D6, batched w/ P16)
- [x] **Phase 14** — Proof-of-delivery off-chain UX — SDK deliveryMessage/verifyDelivery, facilitator uri-binding + integrity check, dashboard /work upload+sign + SettlementPanel (verify/dispute/finalize); units 7/7, next build 0 errors
- [x] **Phase 15** — Production hardening — pause, configurable+snapshotted dispute window, slash cap, two-step operator transfer, realloc migrate_* across all 3 programs (Boxed ExpireNode to fix 4KB stack); anchor test 52/52
- [ ] **Phase 16** — Hardening redeploy + run migrate_* + upgrade-authority→Squads runbook + docs
- [ ] **Phase 17** — Grant packaging: honest README/CLAUDE.md, decentralization roadmap, npm publish prep

---

## PHASE 0: Repo Scaffold

**STATUS: [x] DONE** — ChainPipe Anchor workspace scaffolded at repo root (pivot
from LedgerForge). Toolchain corrected to Anchor 0.31.1 (see BLOCKERS.md D1).
`anchor build` green: 3 program `.so` + IDLs generated.

### Tasks

1. Init the repo if not already done:
   ```bash
   git init chainpipe-solana && cd chainpipe-solana
   anchor init --no-git . 
   ```

2. Remove the default generated program. We will scaffold our own.

3. Set up the monorepo `package.json` (workspace root):
   ```json
   {
     "name": "chainpipe-solana",
     "private": true,
     "workspaces": ["sdk", "facilitator", "indexer", "dashboard"],
     "scripts": {
       "test:programs": "anchor test",
       "build:sdk": "cd sdk && npm run build",
       "build:facilitator": "cd facilitator && npm run build",
       "build:dashboard": "cd dashboard && next build",
       "e2e": "npx tsx scripts/e2e-devnet.mts"
     }
   }
   ```

4. Create `.env.example`:
   ```
   ANCHOR_WALLET=~/.config/solana/id.json
   SOLANA_RPC_URL=https://api.devnet.solana.com
   FACILITATOR_KEYPAIR=./keys/facilitator.json
   OPERATOR_PUBKEY=<your_operator_pubkey>
   FEE_BPS=20
   STAKE_SLASH_BPS=1500
   COOLDOWN_SLOTS=60480
   NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
   NEXT_PUBLIC_FACILITATOR_URL=http://localhost:3001
   PORT=3001
   INDEXER_PORT=3002
   ```

5. Create `Anchor.toml`:
   ```toml
   [toolchain]
   anchor_version = "1.0.2"
   solana_version = "2.1.0"

   [features]
   resolution = true
   skip-lint = false

   [programs.devnet]
   bonded_registry = "PLACEHOLDER_BONDED_REGISTRY"
   dag_escrow = "PLACEHOLDER_DAG_ESCROW"
   reputation_bridge = "PLACEHOLDER_REPUTATION_BRIDGE"

   [registry]
   url = "https://api.apr.dev"

   [provider]
   cluster = "devnet"
   wallet = "~/.config/solana/id.json"

   [scripts]
   test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
   ```

6. Generate 3 new program keypairs and save to `keys/`:
   ```bash
   mkdir keys
   solana-keygen new --no-bip39-passphrase -o keys/bonded_registry.json
   solana-keygen new --no-bip39-passphrase -o keys/dag_escrow.json
   solana-keygen new --no-bip39-passphrase -o keys/reputation_bridge.json
   ```
   Extract the pubkeys and replace `PLACEHOLDER_*` in `Anchor.toml` and all `declare_id!()` macros.

7. Create the `programs/` directory structure:
   ```bash
   mkdir -p programs/bonded_registry/src
   mkdir -p programs/dag_escrow/src
   mkdir -p programs/reputation_bridge/src
   ```

8. Create each program's `Cargo.toml` with the correct Anchor v1.x dependency:
   ```toml
   [package]
   name = "bonded_registry"
   version = "0.1.0"
   edition = "2021"

   [lib]
   crate-type = ["cdylib", "lib"]
   name = "bonded_registry"

   [dependencies]
   anchor-lang = { version = "1.0.2", features = ["init-if-needed"] }
   anchor-spl = { version = "1.0.2", features = ["token", "associated_token"] }
   ```
   Repeat for `dag_escrow` and `reputation_bridge`.

9. Create workspace `Cargo.toml`:
   ```toml
   [workspace]
   members = [
     "programs/bonded_registry",
     "programs/dag_escrow",
     "programs/reputation_bridge"
   ]
   resolver = "2"

   [profile.release]
   overflow-checks = true
   lto = "fat"
   codegen-units = 1

   [profile.dev.package."*"]
   opt-level = 3
   ```

### Verification Checklist — Phase 0

- [x] `anchor build` completes with no errors (3 empty program stubs)
- [x] All 3 program keypairs exist in `keys/`
- [x] `Anchor.toml` has real pubkeys (not PLACEHOLDER)
- [x] `.env.example` exists
- [x] `package.json` workspace root exists
- [x] `git status` shows a clean initial commit

---

## PHASE 1: `bonded_registry` Anchor Program

**STATUS: [x] DONE** — 12/12 tests passing (`tests/bonded_registry.ts`). Note:
slash/open-job CPI auth is gated on `config.dag_escrow_authority` (a stored
Pubkey set by the operator to dag_escrow's signer PDA), and `initialize` takes
that authority as a 3rd arg — a small extension of the spec needed to make the
caller-auth check testable in isolation.

### What it does

- Agents stake SPL tokens (USDC or SOL) into a per-agent vault PDA
- Stake amount → tier (Tier 1: ≥10 USDC, Tier 2: ≥100 USDC, Tier 3: ≥1000 USDC)
- Tier determines max job value the agent can claim in `dag_escrow`
- Slashing: `slash_stake(agent, job_id, slash_bps)` transfers penalty to consumer
- Unstake: 7-day cooldown enforced (COOLDOWN_SLOTS), reverts if open jobs exist
- Config PDA owned by operator with fee authority

### Account Structure

```rust
// Config PDA: seeds = [b"config"]
pub struct RegistryConfig {
    pub operator: Pubkey,
    pub slash_bps: u16,         // e.g. 1500 = 15%
    pub cooldown_slots: u64,    // e.g. 60480 ≈ 7 days at 400ms/slot
    pub bump: u8,
}

// AgentStake PDA: seeds = [b"agent_stake", agent_pubkey]
pub struct AgentStake {
    pub agent: Pubkey,
    pub stake_mint: Pubkey,
    pub stake_amount: u64,
    pub tier: u8,               // 0 = unregistered, 1/2/3
    pub open_jobs: u32,         // incremented by dag_escrow on job claim
    pub total_settled: u32,
    pub total_slashed: u32,
    pub unstake_requested_at: i64,  // 0 = no request
    pub bump: u8,
}
```

### Instructions

```rust
// 1. Initialize config (operator only, one-time)
pub fn initialize(ctx: Context<Initialize>, slash_bps: u16, cooldown_slots: u64) -> Result<()>

// 2. Stake tokens and register
// - Transfers stake_amount from agent's ATA to vault PDA (ATA owned by AgentStake PDA)
// - Computes and stores tier
// - Emits StakeRegistered event
pub fn stake_and_register(ctx: Context<StakeAndRegister>, stake_amount: u64) -> Result<()>

// 3. Increase stake (upgrades tier)
pub fn add_stake(ctx: Context<AddStake>, additional_amount: u64) -> Result<()>

// 4. Request unstake (starts cooldown, reverts if open_jobs > 0)
pub fn request_unstake(ctx: Context<RequestUnstake>) -> Result<()>

// 5. Execute unstake (callable after cooldown, transfers vault back to agent ATA)
pub fn execute_unstake(ctx: Context<ExecuteUnstake>) -> Result<()>

// 6. Slash stake (CPI-callable by dag_escrow program only, verified by signer seed)
// - Transfers slash_bps% of stake to consumer
// - Decrements stake_amount, recomputes tier
// - Emits StakeSlashed event
pub fn slash_stake(ctx: Context<SlashStake>, job_id: [u8; 32], slash_bps: u16) -> Result<()>

// 7. Increment open_jobs (CPI from dag_escrow on job claim)
pub fn increment_open_jobs(ctx: Context<IncrementOpenJobs>) -> Result<()>

// 8. Decrement open_jobs (CPI from dag_escrow on settle or expire)
pub fn decrement_open_jobs(ctx: Context<DecrementOpenJobs>) -> Result<()>
```

### Error Codes

```rust
#[error_code]
pub enum RegistryError {
    #[msg("Stake amount below minimum for any tier")]
    StakeTooLow,
    #[msg("Agent has open jobs, cannot unstake")]
    HasOpenJobs,
    #[msg("Cooldown period not elapsed")]
    CooldownNotElapsed,
    #[msg("Unstake not requested")]
    UnstakeNotRequested,
    #[msg("Slash BPS exceeds 100%")]
    InvalidSlashBps,
    #[msg("Unauthorized: caller is not dag_escrow program")]
    UnauthorizedCaller,
    #[msg("Agent is not registered")]
    AgentNotRegistered,
}
```

### Tests Required — `tests/bonded_registry.ts`

Write full integration tests. Every test must use a real localnet transaction and assert on-chain state after each instruction.

```
✓ initializes registry config with correct operator, slash_bps, cooldown_slots
✓ stakes USDC and assigns Tier 1 (10 USDC)
✓ stakes USDC and assigns Tier 2 (100 USDC)
✓ stakes USDC and assigns Tier 3 (1000 USDC)
✓ add_stake upgrades from Tier 1 to Tier 2 correctly
✓ request_unstake fails when open_jobs > 0
✓ execute_unstake fails before cooldown elapses
✓ execute_unstake succeeds after cooldown and transfers full stake back
✓ slash_stake transfers correct bps amount to consumer
✓ slash_stake downgrades tier if stake falls below threshold
✓ slash_stake fails with UnauthorizedCaller if not signed by dag_escrow
✓ agent cannot stake below minimum (< 10 USDC)
```

All 12 tests must pass before moving to Phase 2.

---

## PHASE 2: `dag_escrow` Anchor Program

**STATUS: [x] DONE** — 16/16 tests passing (37 total across all programs).
Node accounts are created via signed system CPI in `create_pipeline`
(remaining_accounts). DAG validity is enforced by requiring backward-only
dependency edges (mask bits < node index) — a topological constraint that makes
cycles impossible. `pipeline.settled_mask` tracks settled nodes so claim-time
dependency checks need no extra accounts. expire_node cascades over downstream
node accounts (remaining_accounts) and uses Optional accounts for the
slash/reputation path (present only when the expired node was Claimed). CPIs to
bonded_registry + reputation_bridge are signed by the `[b"dag_authority"]` PDA.

### What it does

- Consumer creates a pipeline as a DAG of nodes, each with payment allocation, deadline, and dependency bitmask
- Total USDC for the pipeline locks into a single vault PDA at creation
- Nodes settle individually as upstream dependencies complete
- If a node deadline expires, anyone can call `expire_node` — refund cascades to all downstream dependents and back to consumer
- Agent claims a node (requires tier check via CPI to `bonded_registry`)
- Fee: 20 bps collected at each node settlement to operator treasury

### Account Structure

```rust
// PipelineConfig PDA: seeds = [b"pipeline_config"]
pub struct PipelineConfig {
    pub operator: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
}

// Pipeline PDA: seeds = [b"pipeline", consumer_pubkey, pipeline_nonce]
pub struct Pipeline {
    pub consumer: Pubkey,
    pub total_nodes: u8,
    pub total_usdc_locked: u64,
    pub nodes_settled: u8,
    pub nodes_expired: u8,
    pub status: PipelineStatus,  // Active | Completed | PartiallyRefunded
    pub nonce: u64,
    pub bump: u8,
}

// PipelineNode PDA: seeds = [b"node", pipeline_pubkey, node_index]
pub struct PipelineNode {
    pub pipeline: Pubkey,
    pub node_index: u8,
    pub agent: Pubkey,           // zero if unclaimed
    pub allocation_usdc: u64,
    pub deadline_slot: u64,
    pub dependency_mask: u64,    // bitmask of node indices that must settle first
    pub status: NodeStatus,      // Pending | Claimed | Settled | Expired
    pub settled_at_slot: u64,
    pub job_id: [u8; 32],        // hash set at claim time, used for reputation write
    pub bump: u8,
}
```

```rust
pub enum PipelineStatus { Active, Completed, PartiallyRefunded }
pub enum NodeStatus { Pending, Claimed, Settled, Expired }
```

### Instructions

```rust
// 1. Initialize pipeline config (operator only)
pub fn initialize(ctx: Context<Initialize>, fee_bps: u16) -> Result<()>

// 2. Create pipeline
// - Validates node count (max 16), dependency masks (no cycles, valid indices)
// - Transfers total_usdc from consumer to vault PDA
// - Creates Pipeline + N PipelineNode accounts
// - Emits PipelineCreated
pub fn create_pipeline(
    ctx: Context<CreatePipeline>,
    node_configs: Vec<NodeConfig>,  // allocation, deadline_slots_from_now, dependency_mask
    nonce: u64,
) -> Result<()>

// 3. Claim node (agent)
// - Checks all dependencies are Settled
// - Checks agent stake tier via CPI to bonded_registry (tier >= required_tier)
// - Sets node.agent, generates job_id, sets status Claimed
// - CPI to bonded_registry: increment_open_jobs
// - Emits NodeClaimed
pub fn claim_node(ctx: Context<ClaimNode>, node_index: u8) -> Result<()>

// 4. Complete node (facilitator only, verified by facilitator_authority in PipelineConfig)
// - Marks node Settled
// - Transfers allocation - fee to agent's ATA
// - Transfers fee to operator treasury ATA
// - CPI to bonded_registry: decrement_open_jobs
// - CPI to reputation_bridge: record_completion(agent, job_id, score_delta)
// - Emits NodeSettled
pub fn complete_node(ctx: Context<CompleteNode>, node_index: u8, score_delta: i16) -> Result<()>

// 5. Expire node (permissionless, callable by anyone after deadline passes)
// - Verifies current slot > node.deadline_slot
// - Marks node Expired
// - Marks all downstream nodes (that depend on this) Expired recursively
// - Returns all expired allocations to consumer in single transfer
// - CPI to bonded_registry: decrement_open_jobs (if node was Claimed)
// - CPI to bonded_registry: slash_stake (if node was Claimed, slash_bps from config)
// - CPI to reputation_bridge: record_failure(agent, job_id)
// - Emits NodeExpired with refund_amount
pub fn expire_node(ctx: Context<ExpireNode>, node_index: u8) -> Result<()>

// 6. Cancel pipeline (consumer only, only if no nodes are Claimed or Settled)
// - Returns full vault to consumer
// - Closes all PipelineNode accounts
// - Emits PipelineCancelled
pub fn cancel_pipeline(ctx: Context<CancelPipeline>) -> Result<()>
```

### Critical Correctness Requirements

- **Cycle detection at create_pipeline:** Validate that the dependency_mask graph has no cycles (topological sort check). Reject with `InvalidDAG` if any cycle detected.
- **Replay guard:** `job_id` is `hash(pipeline_pubkey || node_index || agent_pubkey || clock.slot)`. The reputation_bridge checks this is not reused.
- **Atomic cascade on expire:** The entire refund cascade (expired node + all downstream) must execute in a single instruction. Do not spread across multiple instructions — partial state is dangerous.
- **Tier requirement per node:** The `NodeConfig` struct includes a `required_tier: u8` field. `claim_node` CPIs to `bonded_registry` to verify the claiming agent's current tier meets this. Fails with `TierInsufficient` if not.
- **Vault is a PDA-owned ATA:** The vault account for USDC is a token account owned by the Pipeline PDA, not the program itself. Use `anchor_spl::token::transfer_checked` for all moves.

### Tests Required — `tests/dag_escrow.ts`

```
✓ creates pipeline config with fee_bps = 20
✓ creates a 3-node linear pipeline, locks correct USDC in vault
✓ rejects pipeline creation with cyclic dependency mask
✓ rejects pipeline with node count > 16
✓ agent claims node 0 (no dependencies)
✓ agent cannot claim node 1 if node 0 is not Settled
✓ agent cannot claim node 0 if tier is insufficient
✓ facilitator completes node 0, correct USDC to agent and fee to operator
✓ node 0 settlement unlocks node 1 for claim
✓ expire_node: node 1 expires, refund cascades to consumer including downstream node 2
✓ slash_stake CPI fires when Claimed node expires
✓ cancel_pipeline refunds full vault when no nodes active
✓ reputation_bridge CPI fires on complete_node
✓ reputation_bridge failure_record CPI fires on expire_node
✓ full 3-node pipeline settles, pipeline.status = Completed
✓ replay: job_id cannot be reused in reputation_bridge
```

All 16 tests must pass before moving to Phase 3.

---

## PHASE 3: `reputation_bridge` Anchor Program

**STATUS: [x] DONE** — 9/9 tests passing. EMA is additive:
`new = clamp(old + alpha_bps·delta/10000, 0, 10000)`, neutral start 5000,
failure delta -5000 (matches CLAUDE.md E2E numbers 5000→4000). Auth gated on
`bridge_config.dag_escrow_authority` (set to dag_escrow's PDA), same pattern as
bonded_registry. Built before Phase 2 because dag_escrow CPIs into it.

### What it does

- Facilitator-gated reputation writes — only callable by the `dag_escrow` program via CPI (enforced by signer seed check)
- Stores a per-agent reputation record on-chain (EMA score, settled jobs, failed jobs)
- Designed to be composable with the official 8004 ATOM interface: the `record_completion` instruction mirrors the 8004 schema so an upgrade path exists to write directly to QuantuLabs' registry once they expose a CPI interface

### Account Structure

```rust
// BridgeConfig PDA: seeds = [b"bridge_config"]
pub struct BridgeConfig {
    pub operator: Pubkey,
    pub dag_escrow_program: Pubkey,   // only this program can call record_*
    pub ema_alpha_bps: u16,           // EMA smoothing factor e.g. 2000 = 0.20
    pub bump: u8,
}

// AgentReputation PDA: seeds = [b"reputation", agent_pubkey]
pub struct AgentReputation {
    pub agent: Pubkey,
    pub ema_score: u32,          // 0–10000 (two decimal places of 0–100)
    pub total_settled: u32,
    pub total_failed: u32,
    pub last_job_id: [u8; 32],
    pub last_updated_slot: u64,
    pub bump: u8,
}

// JobRecord PDA: seeds = [b"job_record", job_id]
// Proves a job_id has been recorded — used as replay guard
pub struct JobRecord {
    pub job_id: [u8; 32],
    pub agent: Pubkey,
    pub outcome: JobOutcome,    // Settled | Failed
    pub score_delta: i16,
    pub recorded_at_slot: u64,
    pub bump: u8,
}
```

### Instructions

```rust
// 1. Initialize bridge config
pub fn initialize(
    ctx: Context<Initialize>,
    dag_escrow_program: Pubkey,
    ema_alpha_bps: u16,
) -> Result<()>

// 2. Record completion (CPI from dag_escrow only)
// - Verifies caller is dag_escrow_program via signer seed check
// - Verifies job_id not already in JobRecord (replay guard)
// - Creates JobRecord
// - Updates AgentReputation EMA: new_ema = alpha * score_delta + (1-alpha) * old_ema
// - Increments total_settled
// - Emits ReputationUpdated
pub fn record_completion(
    ctx: Context<RecordCompletion>,
    job_id: [u8; 32],
    score_delta: i16,
) -> Result<()>

// 3. Record failure (CPI from dag_escrow only)
// - Same caller verification + replay guard
// - Applies negative delta to EMA
// - Increments total_failed
// - Emits ReputationPenalized
pub fn record_failure(ctx: Context<RecordFailure>, job_id: [u8; 32]) -> Result<()>

// 4. Get reputation (read-only, no state change)
// Just a view — callers read the AgentReputation account directly
```

### Caller Verification Pattern

The `dag_escrow` program signs CPI calls with a program-derived signer:

```rust
// In dag_escrow: CPI to reputation_bridge with PDA signer
let seeds = &[b"dag_authority", &[dag_authority_bump]];
let signer = &[&seeds[..]];
CpiContext::new_with_signer(reputation_bridge_program, accounts, signer)

// In reputation_bridge: verify the CPI signer matches dag_escrow's authority PDA
let expected = Pubkey::create_program_address(
    &[b"dag_authority", &[bump]],
    &ctx.accounts.bridge_config.dag_escrow_program,
)?;
require!(ctx.accounts.dag_authority.key() == expected, BridgeError::UnauthorizedCaller);
```

### Tests Required — `tests/reputation_bridge.ts`

```
✓ initializes bridge config with dag_escrow_program address
✓ record_completion updates EMA correctly for first job (initial EMA = 5000)
✓ record_completion with score_delta = 100 increases EMA by correct alpha-weighted amount
✓ record_completion increments total_settled
✓ record_failure decreases EMA, increments total_failed
✓ record_completion fails with UnauthorizedCaller if not called from dag_escrow CPI
✓ replay: same job_id cannot be recorded twice (JobRecord already exists)
✓ ema_score cannot exceed 10000 (clamped)
✓ ema_score cannot go below 0 (clamped)
```

All 9 tests must pass before Phase 4.

---

## PHASE 4: Deploy All Programs to Devnet

### Tasks

1. Fund the deploy wallet with devnet SOL:
   ```bash
   solana airdrop 5 --url devnet
   ```

2. Build programs:
   ```bash
   anchor build
   ```

3. Deploy in dependency order (reputation_bridge first, then bonded_registry, then dag_escrow):
   ```bash
   anchor deploy --program-name reputation_bridge --provider.cluster devnet
   anchor deploy --program-name bonded_registry --provider.cluster devnet
   anchor deploy --program-name dag_escrow --provider.cluster devnet
   ```

4. Initialize all 3 programs on-chain:
   ```bash
   npx tsx scripts/initialize-programs.mts
   ```
   This script creates the config PDAs for all 3 programs and prints tx signatures.

5. Create `DEPLOYED.md`:
   ```markdown
   # Deployed Contracts — ChainPipe (Solana Devnet)

   All programs deployed and initialized on Solana devnet.

   ## Program IDs

   | Program | Address | Explorer |
   |---------|---------|----------|
   | reputation_bridge | <pubkey> | https://explorer.solana.com/address/<pubkey>?cluster=devnet |
   | bonded_registry | <pubkey> | https://explorer.solana.com/address/<pubkey>?cluster=devnet |
   | dag_escrow | <pubkey> | https://explorer.solana.com/address/<pubkey>?cluster=devnet |

   ## Config PDAs

   | Account | Address | Init Tx |
   |---------|---------|---------|
   | BridgeConfig | <pubkey> | <tx_sig> |
   | RegistryConfig | <pubkey> | <tx_sig> |
   | PipelineConfig | <pubkey> | <tx_sig> |

   ## Settings

   - Fee BPS: 20 (0.20%)
   - Slash BPS: 1500 (15%)
   - Cooldown Slots: 60480 (~7 days)
   - EMA Alpha BPS: 2000 (α = 0.20)
   - Tier 1 minimum: 10_000_000 (10 USDC, 6 decimals)
   - Tier 2 minimum: 100_000_000 (100 USDC)
   - Tier 3 minimum: 1_000_000_000 (1000 USDC)
   ```

### Verification Checklist — Phase 4

- [x] All 3 programs appear on explorer.solana.com with `?cluster=devnet`
- [x] All 3 config PDAs exist on-chain with correct values
- [x] `DEPLOYED.md` has real addresses and tx signatures (not placeholders)
- [x] `Anchor.toml` `[programs.devnet]` section has real program IDs

---

## PHASE 5: TypeScript SDK (`@chainpipe/solana`)

### Structure

```
sdk/
  src/
    pipeline.ts      — createPipeline, claimNode, getNodeStatus
    stake.ts         — stakeAndRegister, addStake, requestUnstake, executeUnstake
    reputation.ts    — getAgentReputation, getJobRecord
    discovery.ts     — getRegisteredAgents, getPipelinesByConsumer, filterByTier
    idl/             — Copy generated IDL JSONs from target/idl/ after anchor build
    index.ts         — Re-export everything
  package.json
  tsconfig.json
```

### Key Design Constraints

- Use `@coral-xyz/anchor` v0.31+ (matches Anchor v1.x IDL format)
- Use `@solana/web3.js` v2 (`@solana/web3.js@2`) — the new functional API, not the legacy class-based one
- ed25519 signing for off-chain messages (tweetnacl, same as LedgerForge Solana pattern you already know)
- All program addresses read from a `ChainPipeAddresses` config object passed to each function — no hardcoded addresses
- Every function returns `{ tx: TransactionSignature, accounts: Record<string, PublicKey> }` for easy debugging

### Key Functions to Implement

```typescript
// pipeline.ts
export async function createPipeline(
  connection: Connection,
  consumer: Keypair,
  nodes: NodeConfig[],
  addresses: ChainPipeAddresses,
  nonce?: bigint,
): Promise<{ signature: string; pipelinePda: PublicKey; nodePdas: PublicKey[] }>

export async function claimNode(
  connection: Connection,
  agent: Keypair,
  pipelinePda: PublicKey,
  nodeIndex: number,
  addresses: ChainPipeAddresses,
): Promise<{ signature: string; jobId: Uint8Array }>

export async function expireNode(
  connection: Connection,
  caller: Keypair,
  pipelinePda: PublicKey,
  nodeIndex: number,
  addresses: ChainPipeAddresses,
): Promise<{ signature: string; refundAmount: bigint }>

export async function getPipeline(
  connection: Connection,
  pipelinePda: PublicKey,
  addresses: ChainPipeAddresses,
): Promise<Pipeline & { nodes: PipelineNode[] }>

// stake.ts
export async function stakeAndRegister(
  connection: Connection,
  agent: Keypair,
  stakeAmount: bigint,
  stakeMint: PublicKey,
  addresses: ChainPipeAddresses,
): Promise<{ signature: string; agentStakePda: PublicKey; tier: number }>

export async function getAgentStake(
  connection: Connection,
  agentPubkey: PublicKey,
  addresses: ChainPipeAddresses,
): Promise<AgentStake | null>

// reputation.ts
export async function getAgentReputation(
  connection: Connection,
  agentPubkey: PublicKey,
  addresses: ChainPipeAddresses,
): Promise<AgentReputation | null>

// discovery.ts
export async function getAgentsByTier(
  connection: Connection,
  minTier: number,
  addresses: ChainPipeAddresses,
): Promise<Array<AgentStake & { reputation: AgentReputation | null }>>
```

### Package.json for SDK

```json
{
  "name": "@chainpipe/solana",
  "version": "0.1.0",
  "description": "SDK for ChainPipe — atomic multi-agent pipeline escrow and bonded trust on Solana",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@coral-xyz/anchor": "^0.31.0",
    "@solana/web3.js": "^2.0.0",
    "tweetnacl": "^1.0.3"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

### Verification Checklist — Phase 5

- [x] `cd sdk && npm run build` completes with no TypeScript errors
- [x] All exported functions are typed correctly (no `any`)
- [x] IDL JSON files from `target/idl/` are copied into `sdk/src/idl/`
- [x] `sdk/dist/` exists and `index.js` + `index.d.ts` are present

---

## PHASE 6: Facilitator Service

### What it does

The facilitator is the trusted off-chain component that:
1. Accepts completion signals from agents (POST /complete)
2. Verifies the completion is legitimate (checks job_id matches, agent matches, deadline not passed)
3. Calls `dag_escrow::complete_node` on-chain with a score
4. Handles slash via `dag_escrow::expire_node` for timed-out jobs

It is a lightweight Express server. It does NOT verify the quality of agent output — that is out of scope. It verifies on-chain state only (node is Claimed, agent matches, deadline not passed). Score is computed by a simple heuristic (time taken vs deadline → score 6000–9000).

### Structure

```
facilitator/
  src/
    server.ts         — Express routes
    verifier.ts       — On-chain state verification
    settler.ts        — Anchor instruction calls (complete_node, expire_node)
    scorer.ts         — Score heuristic
    replay.ts         — In-memory nonce set (restart-safe: also checks JobRecord on-chain)
  .env                — FACILITATOR_KEYPAIR path, RPC URL, program IDs
```

### Routes

```
POST /complete
  body: { pipelinePda: string, nodeIndex: number, agentSignature: string }
  - Verify agentSignature is valid ed25519 over (pipelinePda + nodeIndex + jobId)
  - Verify on-chain: node status is Claimed, node.agent matches recovered pubkey, deadline not passed
  - Compute score_delta from time elapsed vs deadline
  - Call dag_escrow::complete_node
  - Return: { signature: string, scoreDelta: number, newEmaScore: number }

POST /expire
  body: { pipelinePda: string, nodeIndex: number }
  - Verify on-chain: node deadline has passed
  - Call dag_escrow::expire_node
  - Return: { signature: string, refundAmount: string, slashedAgent: string | null }

GET /pipeline/:pipelinePda
  - Returns full pipeline state including all nodes (reads from chain, not indexer)
  - Return: { pipeline: Pipeline, nodes: PipelineNode[] }

GET /agent/:agentPubkey
  - Returns AgentStake + AgentReputation for a given agent
  - Return: { stake: AgentStake | null, reputation: AgentReputation | null }

GET /health
  - Returns { status: "ok", slot: number, programs: { bonded_registry: string, dag_escrow: string, reputation_bridge: string } }
```

### Security Requirements

- Facilitator keypair loaded from file, never from env var string
- All on-chain reads use `commitment: "confirmed"`
- Replay: check in-memory nonce set + verify JobRecord PDA does not exist before calling complete_node
- Rate limit: 10 requests/minute per agent pubkey (use `express-rate-limit`)
- CORS: restrict to dashboard origin in production

### Verification Checklist — Phase 6

- [x] `cd facilitator && npm run build` passes with no TypeScript errors
- [x] `GET /health` returns 200 with real slot number on devnet
- [x] `POST /complete` on a seeded node returns valid tx signature
- [x] `POST /expire` on an expired node returns refund amount
- [x] Replay protection: calling `POST /complete` twice with same job_id returns 409

---

## PHASE 7: Indexer

### What it does

Polls Solana devnet for `dag_escrow` and `bonded_registry` program account changes, decodes them, stores in an in-memory store (JSON file for persistence across restarts), and exposes REST endpoints for the dashboard.

### Structure

```
indexer/
  src/
    decoder.ts        — Decode Pipeline, PipelineNode, AgentStake account data using IDL
    poller.ts         — getProgramAccounts with memcmp filters, runs every 5s
    store.ts          — In-memory store with JSON file persistence (data/store.json)
    api.ts            — Express REST endpoints
```

### Routes

```
GET /pipelines
  Query params: consumer (optional pubkey), status (optional: active|completed|partial)
  Returns: Pipeline[] with embedded nodes array

GET /pipelines/:pipelinePda
  Returns: single Pipeline with nodes

GET /agents
  Query params: minTier (1|2|3), minScore (0-10000)
  Returns: Array<AgentStake & { reputation: AgentReputation | null }>

GET /agents/:agentPubkey
  Returns: AgentStake + AgentReputation

GET /stats
  Returns: {
    totalPipelines: number,
    activePipelines: number,
    totalNodesSettled: number,
    totalUsdcSettled: string,
    totalUsdcRefunded: string,
    totalAgentsStaked: number,
    totalStakeValueUsdc: string,
  }
```

### Verification Checklist — Phase 7

- [x] Indexer starts, polls devnet, populates store with existing seeded accounts
- [x] `GET /stats` returns non-zero counts after seeding
- [x] `GET /agents?minTier=2` returns only Tier 2+ agents
- [x] Data persists across indexer restart (JSON file)

---

## PHASE 8: Dashboard (Next.js 15)

### Stack

- Next.js 15 (App Router)
- `@solana/wallet-adapter-react` + `@solana/wallet-adapter-react-ui` (Phantom, Solflare, Backpack)
- `@solana/wallet-adapter-wallets`
- Tailwind CSS
- shadcn/ui components
- All Solana interactions via `@chainpipe/solana` SDK (import from local `sdk/dist`)
- All data fetched from indexer REST API (`NEXT_PUBLIC_INDEXER_URL`)
- All transaction calls use wallet adapter `sendTransaction` — NO private keys in browser

### Pages

```
/                    — Landing: stats bar + featured agents + recent pipelines
/bazaar              — Agent discovery: filterable by tier, score, skill tag
/agent/[pubkey]      — Agent profile: stake info, EMA chart, settled job history
/pipeline/create     — Pipeline builder UI: add nodes, set allocations, deadlines, deps
/pipeline/[pda]      — Pipeline detail: DAG visualization, node statuses, tx links
/my/pipelines        — Consumer's pipelines (wallet connected)
/my/stake            — Agent staking dashboard (stake, add, request unstake)
```

### Critical Constraints

- **Zero EVM code.** No ethers.js, no viem, no window.ethereum, no EIP-712. If you see any of these, remove them.
- **ed25519 only.** Agent completion signing via `wallet.signMessage` (Uint8Array), decoded with tweetnacl.
- **All explorer links** use `https://explorer.solana.com/tx/<sig>?cluster=devnet`
- **Wallet adapter** used for all transactions, never a keypair in browser
- **Loading states** for every data fetch — no layout shift on empty state
- **`next build` must pass with 0 errors before this phase is complete**

### Key Components

```tsx
// PipelineBuilder.tsx
// - Add/remove nodes
// - Set allocation (USDC input)
// - Set deadline (hours from now, converted to slots)
// - Set dependencies (checkboxes per upstream node)
// - Validates: no cycles, total allocation ≤ input amount
// - On submit: calls createPipeline from SDK via wallet adapter

// AgentCard.tsx
// - Shows tier badge (Tier 1/2/3)
// - EMA score as progress bar (0–100)
// - Total settled / failed counts
// - Stake amount + cooldown status
// - Explorer link to AgentStake PDA

// BazaarTable.tsx
// - Fetches from indexer GET /agents
// - Sortable by score, stake, settled count
// - Filter by minTier, minScore
// - Paginated (20 per page)

// NodeStatusBadge.tsx
// - Color-coded: Pending (gray), Claimed (blue), Settled (green), Expired (red)
// - Shows agent pubkey if claimed, tx link if settled
```

### Verification Checklist — Phase 8

- [x] `cd dashboard && next build` passes with 0 errors, 0 TypeScript errors
- [x] No EVM imports anywhere in `dashboard/` (grep for ethers|viem|window.ethereum|EIP-712)
- [~] Wallet adapter connects on `/bazaar` and `/my/stake` (wired + builds; live Phantom/Solflare connect is a manual browser step)
- [x] `GET /` loads with real stats from indexer (not hardcoded)
- [~] Pipeline builder creates a real devnet transaction on submit (same SDK `createPipeline` path proven live in e2e + facilitator verify; the in-browser wallet click is manual)
- [x] All explorer links open correct devnet tx/address

---

## PHASE 9: E2E Devnet Script

### File: `scripts/e2e-devnet.mts`

This script proves the entire product works end-to-end on devnet with real transactions. It is the primary artifact for the demo video and grant submission.

```typescript
/**
 * ChainPipe E2E Devnet Script
 *
 * Demonstrates the full lifecycle:
 * 1. Stake 3 agents at Tier 1, Tier 2, Tier 3
 * 2. Create a 3-node linear pipeline (100 USDC locked)
 * 3. Agent A claims and completes Node 0 → settlement + rep write
 * 4. Agent B claims Node 1 → lets it expire → cascade refund + slash
 * 5. Agent C claims and completes Node 2 (after pipeline retries Node 1 with new agent)
 * 6. Verify final state: pipeline Completed, all rep scores updated, all explorer links
 *
 * Usage: npx tsx scripts/e2e-devnet.mts
 */
```

Required output format — every step must print:
```
[1/12] Staking Agent A (Tier 1: 10 USDC)
  ✓ Tx: https://explorer.solana.com/tx/<sig>?cluster=devnet
  ✓ AgentStake PDA: <pubkey>
  ✓ Tier: 1
  ✓ Stake: 10.00 USDC

[2/12] Staking Agent B (Tier 2: 100 USDC)
  ...

[5/12] Creating 3-node pipeline (100 USDC total)
  ✓ Tx: https://explorer.solana.com/tx/<sig>?cluster=devnet
  ✓ Pipeline PDA: <pubkey>
  ✓ Vault: <pubkey> (100.00 USDC locked)
  ✓ Node 0: 40 USDC, deadline 30min, no deps
  ✓ Node 1: 35 USDC, deadline 30min, depends on Node 0
  ✓ Node 2: 25 USDC, deadline 60min, depends on Node 1

[6/12] Agent A claims + completes Node 0
  ✓ Claim Tx: https://explorer.solana.com/tx/<sig>?cluster=devnet
  ✓ Complete Tx: https://explorer.solana.com/tx/<sig>?cluster=devnet
  ✓ Agent A received: 39.92 USDC (40 - 20bps fee)
  ✓ Operator fee: 0.08 USDC
  ✓ Agent A EMA score: 7200 → 7360

... (all 12 steps)

FINAL STATE:
  Pipeline: <pda> — Completed (partial refund)
  Agent A: settled=1, failed=0, ema=7360
  Agent B: settled=0, failed=1, ema=4000, slashed 1.05 USDC
  Agent C: settled=1, failed=0, ema=6600
  Consumer refunded: 35.00 USDC (Node 1 expired cascade)
  Total protocol fees collected: 0.13 USDC
```

### Verification Checklist — Phase 9

- [x] Script runs to completion with no errors
- [x] All 12 tx signatures are valid on devnet explorer
- [x] Pipeline final status is correct (Completed or PartiallyRefunded)
- [x] Reputation scores updated correctly on-chain
- [x] Slash amount appears in consumer's wallet
- [x] Output is clean enough to use as demo script for a screen recording

---

## PHASE 10: Seed Script + Final Documentation

### Seed Script: `scripts/seed-devnet.mts`

Creates realistic demo state on devnet:
- 5 agents staked at various tiers with existing reputation history
- 3 pipelines in various states (1 active, 1 completed, 1 partially refunded)
- Uses realistic skill tags: "code-gen", "data-fetch", "report-synthesis", "api-proxy", "nlp-summarization"

Output: `DEPLOYED.md` updated with seeded account addresses.

### README.md Final Structure

```markdown
# ChainPipe

Atomic multi-agent pipeline escrow and bonded trust on Solana.

## What

Two Anchor programs that solve the two hardest unsolved problems
in the agent economy:
1. Money gets stuck when multi-agent pipelines fail
2. There is no economic consequence for bad agents

## Why Solana

[Solana-specific rationale with fee/latency numbers]

## Architecture

[3-layer diagram: bonded_registry ← dag_escrow → reputation_bridge]

## Demo

[Embed 2-minute demo video URL]

## Deployed Programs (Solana Devnet)

[Table from DEPLOYED.md]

## Quick Start

[npm install + env setup + run e2e script steps]

## SDK

[npm install @chainpipe/solana, 3-line usage example for each core function]

## Differentiation

[Table: ChainPipe vs AgenC vs Clawork vs 8004 registry]

## Grant Application

[Link to Superteam application]

## License

MIT
```

### CLAUDE.md Final Status Check

All phases must show `[x] DONE`. If any show `[ ]` or `[~]`, continue working.

### Final Verification Checklist — Phase 10

- [x] All 10 phases show `[x] DONE` in CLAUDE.md phase tracker
- [x] `anchor test` passes (all 37 tests across 3 programs)
- [x] `cd sdk && npm run build` passes
- [x] `cd facilitator && npm run build` passes
- [x] `cd dashboard && next build` passes
- [x] `npx tsx scripts/e2e-devnet.mts` runs to completion with all explorer links valid
- [~] README has demo video URL embedded (record this last) — human-only: needs a screen recording; README/scripts are ready to record against
- [x] DEPLOYED.md has all real addresses, config PDAs, and seeded account addresses
- [x] BLOCKERS.md exists (even if empty) documenting any issues hit
- [x] `git log --oneline` shows one commit per phase minimum
- [x] No hardcoded private keys, RPC URLs, or wallet paths anywhere in committed code
- [x] `grep -r "ethers\|viem\|window.ethereum\|EIP-712" dashboard/` returns no results

---

## PHASE EXECUTOR PROMPT

Use this as your first message to Claude Code after placing this file as `CLAUDE.md`:

```
Read CLAUDE.md completely. Then:

1. Check the PHASE STATUS TRACKER to find the first phase that is not marked [x] DONE.
2. Execute that phase completely — all tasks, all code, all verification checks.
3. When all verification checks in that phase pass, mark it [x] DONE in CLAUDE.md.
4. Commit the phase to git with the message format specified.
5. Immediately begin the next phase without waiting for input.
6. Continue until all 10 phases are marked [x] DONE.

If you hit a build error or test failure:
- Attempt to fix it up to 3 times
- If still failing after 3 attempts, write the exact error and your diagnosis to BLOCKERS.md
- Continue with the next sub-task in the current phase

Never stop between phases. Never ask for confirmation between phases. Run until CLAUDE.md shows all [x] DONE.

Do not skip verification checklists. Do not mark a phase DONE unless every checklist item passes.

Start now.
```