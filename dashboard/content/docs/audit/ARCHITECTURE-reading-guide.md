# Escrow lifecycle — a guided reading map

> AI-generated, 2026-06-26. This is **not** a flow summary to read instead of the code — it's
> a route through `programs/dag_escrow/src/lib.rs` (with hops into the other two programs) so
> you trace each step yourself. Each stop gives a file:line anchor and a question to answer
> from the source before moving on. Resist reading ahead.

The system is three programs:
- `dag_escrow` — holds consumer budget, orchestrates the DAG, drives payouts/refunds.
- `bonded_registry` — agent stake, tiers, the `open_jobs` counter, slashing.
- `reputation_bridge` — append-only EMA reputation + per-job records.

`dag_escrow` is the only one that initiates cross-program calls; it signs them with a single
PDA, `dag_authority`. Hold that thought — it's the spine of the whole trust model.

---

## Path A — the happy path (consumer funds a pipeline, an agent gets paid)

**Stop 1 — Locking the budget.** `create_pipeline` (L142). Read L155-165 first.
- Q: what makes a cycle impossible *by construction* here, before any runtime cycle check?
  (Look at how `allowed` is computed from the node index.)
- Q: where do the consumer's tokens physically go, and who is the authority on that vault?
  (L168-180 + the `vault` account in `CreatePipeline`, L1163-1169.)

**Stop 2 — Why the nodes are created by hand.** Still in `create_pipeline`, L201-241.
- Q: these node PDAs are made with a raw `system_program::create_account` CPI signed by
  seeds, not Anchor's `init`. Why can't they be `init`? (Hint: how many are there, and are
  they known at macro-expansion time?) This is the "remaining_accounts" pattern — understand
  why it's forced here.

**Stop 3 — Claiming.** `claim_node` (L254). Read the require-block L260-277.
- Q: three gates must pass to claim. Name them and find the line for each.
- Q: `(mask & settled_mask) == mask` (L265) — why compare to `mask` rather than `!= 0`?
- Then the CPI at L298: this is the *first* cross-program call. Note the signer seeds at
  L297. **This is where `open_jobs` gets incremented** — and why an agent can't later unstake
  out from under a job. Go read `bonded_registry::increment_open_jobs` (L293) and confirm how
  it authenticates the caller.

**Stop 4 — Settling (the trusted path).** `complete_node` (L319).
- Q: who is allowed to call this? (L326-329.) Contrast with claim, which the *agent* signs.
- Q: trace the money: `allocation` splits into `to_agent` and `fee` (L339-341). Where does
  each transfer go, and what authority signs the vault → recipient transfers? (L347-380.)
- Q: after payment, three things update: node status, pipeline counters, and two more CPIs
  (L399-432). What are those two CPIs for, and which program does each hit?

At this point you've seen the core: lock → claim (→ open_jobs++) → complete (pay + open_jobs--
+ reputation). Everything else is variations on refund/dispute.

---

## Path B — the optimistic / dispute path (the part worth scrutinising)

**Stop 5 — Submit.** `submit_completion` (L447). No funds move here.
- Q: what gets *snapshotted* onto the `NodeSettlement` and why does the comment at L468 say
  that matters? (Think: what could an operator otherwise do mid-flight?)

**Stop 6 — The fork.** After submit, a node is `Submitted`. Three things can happen:
1. nobody disputes → `finalize_node` (L522), permissionless after the window;
2. consumer disputes → `dispute_node` (L498) → `resolve_dispute` (L603);
3. (deadline path is separate — see Path C).

Read `finalize_node` carefully. It's permissionless on purpose (an agent shouldn't need the
facilitator to get paid). Now the sharp question that this whole audit turned on:
- Q: `finalize_node` pays `to_agent` to `agent_token_account` (L553). Go to the `FinalizeNode`
  struct (L1283) and find the constraint that ties `agent_token_account` to `node.agent`.
  **Can you find one?** Compare with how `consumer_token_account` is constrained on the
  refund paths (L1349, L1399). See `SECURITY-REVIEW-programs.md` CRITICAL-1.

**Stop 7 — Dispute + resolve.** `dispute_node` (L498) then `resolve_dispute` (L603).
- Q: who can dispute? (L1273-1281.) Who resolves? (L604-607.)
- Q: in the `upheld` branch (L627-652), four things happen to punish the agent. List them
  and the program each touches. In the `!upheld` branch, what happens instead?

---

## Path C — refunds & cascades (the headline feature)

**Stop 8 — `expire_node` (L696).** This is the most intricate instruction; budget time.
- Q: what two node states are expirable, and what timing gate must pass? (L706-710.)
- Q: the fixpoint loop (L725-749) walks `remaining_accounts`. What set is it computing, and
  what's the termination condition? Convince yourself it can't loop forever.
- Q: which downstream node states does it expire — and why is it safe to only consider
  `Pending` ones? (Think about what it takes for a node to be `Claimed`.)
- Q: when the target `was_claimed`, the slash/reputation accounts are `Option<...>`
  (L1407-1426). Find where a missing one is rejected (L800 etc.). Then ask: is there any
  check that the supplied `agent_stake`/`agent` is the node's *actual* agent? (→ HIGH-1.)

**Stop 9 — `cancel_pipeline` (L912).** The clean-exit path.
- Q: under what condition is cancel allowed (L915-926), and how does it close the node
  accounts and return rent (L953-965)? Note this is manual account-closing, not Anchor
  `close` — read how lamports and data are handled.

---

## The cross-program trust model (tie it together)

You've now seen `dag_authority` sign four different CPIs. Go confirm the symmetry:
- Each privileged instruction in `bonded_registry` / `reputation_bridge` checks
  `dag_authority.key() == config.dag_escrow_authority` **and** takes `dag_authority: Signer`.
  Find all five sites (registry L235, L294, L306; bridge L157 via `gate`).
- Q: why are **both** checks needed? What attack does each one independently stop? (What if
  it were `Signer` but not key-checked? Key-checked but not `Signer`?) This is the single
  most important invariant in the codebase — be able to explain it cold.

When you can answer that last question without looking, you understand the architecture.
