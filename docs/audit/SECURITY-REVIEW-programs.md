# Security review — Anchor programs (`dag_escrow`, `bonded_registry`, `reputation_bridge`)

> AI-generated review, 2026-06-26. Reviewer read the full source of all three programs.
> **Nothing here is auto-fixed.** Each finding is something for you to confirm (ideally
> by writing the suggested PoC test) and fix yourself. Severities are the reviewer's
> judgement; treat the CRITICAL/HIGH items as "verify first, before anything else."
>
> Confidence is marked per finding: **[fact]** = directly readable in the source;
> **[inference]** = a conclusion I drew that you should confirm with a test.

Scope: `programs/dag_escrow/src/lib.rs`, `programs/bonded_registry/src/lib.rs`,
`programs/reputation_bridge/src/lib.rs`. The TS SDK, facilitator and indexer were **not**
reviewed.

---

## What's solid (so the findings below are in context)

- **CPI authorization is correctly pinned.** Every privileged CPI target in the registry
  and bridge (`slash_stake`, `increment/decrement_open_jobs`, `record_completion/failure`)
  checks `dag_authority.key() == config.dag_escrow_authority` **and** takes `dag_authority`
  as a `Signer`. Since that PDA can only be signed by `dag_escrow`, outside callers can't
  invoke these directly. (`bonded_registry` L235-238, L294-297, L306-309; `reputation_bridge`
  L157-163.) **[fact]**
- **Arithmetic.** Budget summation, fee math and refund totals use `checked_add` / `u128`
  intermediates / `saturating_*` consistently. Fee is floor-divided and `to_agent =
  allocation - fee`, so a node's payout split always sums to exactly its allocation — the
  vault drains cleanly with no dust trap. **[fact]**
- **Double-spend guards.** Node status transitions gate every payout/refund; a node can
  only leave `Claimed`/`Submitted`/`Pending` once, so no allocation is paid or refunded
  twice. `dispute_node` is correctly `consumer`-only (`has_one = consumer` + `Signer`,
  L1273-1281) — not the griefing hole it could have been. **[fact]**
- **Unstake can't dodge a slash:** `request_unstake`/`execute_unstake` both require
  `open_jobs == 0` (L178, L192). The open-jobs counter is the mechanism that keeps a
  staked agent slashable while it has work outstanding. (But see HIGH-1 / MED-1 — the
  counter's integrity is undermined by unbound accounts on the dag_escrow side.) **[fact]**

---

## CRITICAL-1 — `finalize_node` lets anyone steal the agent's payout

**Where:** `dag_escrow` `finalize_node` (L522-598) + `FinalizeNode` accounts (L1283-1325).

**What:** `finalize_node` is **permissionless** (`caller: Signer`, any key) — by design, so
an agent can be paid after the dispute window without depending on the facilitator. It pays
`to_agent` to `agent_token_account`:

```rust
to: ctx.accounts.agent_token_account.to_account_info(),   // L553
```

The struct declares that account with **no owner constraint**:

```rust
#[account(mut)]
pub agent_token_account: Box<Account<'info, TokenAccount>>,   // L1301-1302
```

The instruction verifies `node.agent == ctx.accounts.agent.key()` (L528) — but `agent` is
a separate `UncheckedAccount` used only as an identity/seed. **Nothing ties
`agent_token_account` to `node.agent`.** `transfer_checked` only enforces that the
destination's *mint* equals `stake_mint`.

**Impact [inference — confirm with PoC]:** once a node's dispute window elapses, any
attacker can call `finalize_node`, pass `agent = node.agent` (a public key) and
`agent_token_account = <attacker's own USDC account>`, and the vault pays the agent's
earnings to the attacker. The node flips to `Settled`, so the real agent is left with
nothing and no recourse. This is theft of every undisputed payout, front-runnable the
instant the window closes.

**Why it doesn't show up in normal operation:** the honest agent passes *their own* ATA, so
the happy path works and tests pass. The bug only bites when a *different* caller supplies a
*different* destination — which the permissionless design explicitly allows.

**Fix direction:** constrain the destination to the node's agent, e.g.
`associated_token::mint = stake_mint, associated_token::authority = agent` on
`agent_token_account`, or `constraint = agent_token_account.owner == agent.key()`. Same
pattern the refund paths already use for `consumer_token_account`
(`owner == pipeline.consumer`, L1349/L1399).

**Suggested PoC:** in `tests/z_dag_escrow.ts`, drive a node to `Submitted`, advance past the
window, then call `finalize_node` from a non-agent signer with that signer's ATA as
`agent_token_account`. If it succeeds and credits the attacker, the bug is real.

---

## HIGH-1 — `expire_node` doesn't bind the slash/reputation accounts to `node.agent`

**Where:** `dag_escrow` `expire_node` (L696-908) + `ExpireNode` accounts (L1375-1430).

**What:** `expire_node` is **permissionless**. When the target node `was_claimed`, it slashes
`agent_stake` and records a failure against `agent` — both supplied by the caller as
`Option<...>` accounts (L1408-1425). Unlike `complete_node`/`finalize_node`/`resolve_dispute`,
which all assert `node.agent == ctx.accounts.agent.key()`, **`expire_node` never checks that
the supplied `agent_stake.agent` or `agent` equals `node.agent`.**

**Impact [inference — confirm with PoC]:** when an overdue *claimed* node is expired, the
caller chooses *whose* stake gets slashed and *whose* reputation gets the failure. An
attacker can:
1. Slash an **arbitrary innocent agent's** real stake (funds go to the consumer, so no
   direct profit — pure griefing of a competitor), and tank that agent's EMA score; and
2. Leave the **real** node-agent's `open_jobs` counter permanently incremented (the
   `decrement_open_jobs` CPI hit the wrong agent), which **locks the real agent's stake
   forever** — `request_unstake` requires `open_jobs == 0` (L178).

`slash_stake`'s `has_one = stake_mint` (L543) means the victim must have staked the same
mint, but for a single shared mint (USDC) that's every agent.

**Fix direction:** in the `was_claimed` branch, require `agent_stake.agent == node.agent`
and `agent.key() == node.agent` before the slash / failure CPIs.

---

## MEDIUM-1 — `finalize_node` decrements the wrong agent's `open_jobs`

**Where:** `dag_escrow` `finalize_node` (L586-589) + `FinalizeNode` (L1310-1311).

Same root cause as HIGH-1 but on the permissionless finalize path: `agent_stake` is not
constrained to `node.agent`, so a `finalize_node` caller can pass any agent's stake. The
`decrement_open_jobs(settled=true)` CPI then decrements/credits the wrong agent and leaves
the real agent's `open_jobs` stuck — an unstake DoS — and inflates a stranger's
`total_settled`. No funds move incorrectly (that's CRITICAL-1's separate problem), so this
is MEDIUM. Fix: `require!(agent_stake.agent == node.agent)`. **[inference]**

> Note: `complete_node` (L402-413) and `resolve_dispute` (L635-636) share the same missing
> `agent_stake.agent == node.agent` bind, but both are **facilitator-only** (trusted in v1),
> so the exposure is much smaller. Still worth fixing as defense-in-depth.

---

## MEDIUM-2 — `expire_node` cascade can be silently truncated

**Where:** `dag_escrow` `expire_node` cascade loop (L724-749).

The transitive-expiry set is built from whatever node accounts the caller puts in
`remaining_accounts`. There's no check that *all* downstream-dependent pending nodes are
present. A caller can omit some, so those nodes aren't expired and their allocations aren't
refunded in this tx (`refund_total` only covers the subset). **[fact]**

**Impact [inference]:** not fund-loss — each omitted node can still be expired later once
*its own* `deadline_slot` passes — but it defeats the "atomic cascade refund in one
instruction" guarantee the README advertises, and strands the consumer's funds until each
downstream deadline elapses. Consider documenting the caller's obligation to pass the full
downstream set, or validating completeness against `total_nodes`/`settled_mask`.

---

## LOW / informational

- **L-1 [fact]** `expire_node` status update (L781-789) has a dead `if/else` — both branches
  assign `PartiallyRefunded`. Harmless, but it signals the terminal-status logic wasn't
  finished; decide whether a fully-expired-from-root pipeline deserves a distinct status.
- **L-2 [inference]** `expire_node`'s cascade `try_deserialize`s `remaining_accounts` and
  checks `node.pipeline == pipeline_key`, but doesn't verify program ownership of those
  accounts. Cross-pipeline is blocked and writes to non-owned accounts are dropped by the
  runtime, so I don't see an exploit — but an explicit owner check is cheap defense-in-depth.
- **L-3 [fact]** `complete_node` / `resolve_dispute` also pay `agent_token_account` with no
  owner constraint (L1223-1224, L1346). Both are facilitator/arbiter-only, so low risk, but
  it's the same class as CRITICAL-1 — fix all of them together.
- **Info** Two settlement paths coexist: `complete_node` pays instantly with **no** dispute
  window, while `submit_completion`→`finalize_node` is the optimistic/disputable path. The
  proof-of-delivery/dispute protection only applies if the facilitator chooses the latter.
  By design (facilitator trusted in v1), but worth stating explicitly in the trust model.
- **Info** `migrate_*` instructions authenticate the operator by reading raw bytes
  `data[8..40]` (e.g. `bonded_registry` L80). Correct given `operator` is the first field,
  but fragile to layout changes — the comment acknowledges it.

---

## Suggested triage order

1. **CRITICAL-1** — write the PoC, confirm, fix the `agent_token_account` binding. This is
   live-on-devnet play money today, but it's the same code you'd ship to mainnet.
2. **HIGH-1 / MED-1** — add the `agent_stake.agent == node.agent` (and `agent`) binds to the
   permissionless paths.
3. **MED-2**, then the LOWs.

The common thread in the top three: **permissionless instructions that don't pin
caller-supplied token/stake/identity accounts to the on-chain `node.agent`.** Worth a grep
across every instruction for "does each caller-supplied account get tied back to state?"
