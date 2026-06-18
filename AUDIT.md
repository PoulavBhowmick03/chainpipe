# ChainPipe — Product Audit & Readiness Review

_As of the current devnet deployment. Honest assessment of what works, what's
missing, and what's required before real users can rely on it for real work._

## TL;DR

ChainPipe is a **working devnet prototype** of two real primitives — DAG pipeline
escrow with cascading refunds, and a bonded agent registry with facilitator-gated
reputation. All core on-chain flows are implemented, tested (37 program tests),
deployed, and exercised end-to-end with real transactions. The frontend, SDK,
facilitator, and indexer are live.

**It is not yet usable for real economic work.** The gaps are: it runs on devnet
with a play-money mint (no real value), there is no actual agent-execution layer
(jobs are facilitator-attested, not proven), trust is centralized (one key controls
program upgrades, the facilitator, and the mint), and several headline claims (the
"official Solana 8004 / ATOM registry" integration) are aspirational, not built.

---

## Update — P0–P2 progress (post-audit work)

Most of the audit has since been addressed in code/infra. Status:

**P0**
- ✅ Reworded the "official 8004/ATOM" claim to "composable-by-design" everywhere.
- ✅ Added `LICENSE` (MIT), `SECURITY.md` (trust model + roadmap), a mermaid
  architecture diagram, and an honest devnet/status section in the README.
- ✅ Built the **agent work console** (`/work`): browse claimable nodes, claim
  on-chain, and submit a signed completion the facilitator settles.
- ⚠️ **Upgrade authority → multisig:** documented a credible plan in
  `SECURITY.md`; creating the Squads multisig and reassigning is a **manual** step
  (Squads UI).
- ⚠️ **Demo video:** human-only (screen recording) — still outstanding.

**P1**
- ✅ Proof-of-delivery first step: `complete_node` now takes a `result_hash` the
  agent signs over; emitted in `NodeSettled`. Full dispute/oracle path documented.
- ✅ Facilitator **key rotation** via `dag_escrow::set_facilitator_authority`.
- ✅ **CI** (`.github/workflows/ci.yml`) + **unit tests** (`npm run test:units`)
  for SDK/facilitator/indexer; programs build job.
- ✅ **Durable indexer storage** (Fly volume) + **health checks** on both services.
- ✅ Faucet is **env-gated** (`FAUCET_ENABLED`) so it can be disabled off devnet.
- ⚠️ **Mainnet + real USDC, dedicated RPC, external audit:** documented plans;
  require funds/decisions/a vendor — not done.

**P2**
- ✅ **DAG graph** visualization on the pipeline page.
- ✅ More wallets surface automatically via Wallet Standard; `autoConnect` off.
- ⚠️ **On-chain skill metadata** and **richer reputation scoring**: deliberately
  deferred (on-chain skill needs an account migration that would risk bricking
  live accounts — documented as a separate change).
- ⚠️ **SDK to npm**: requires npm auth (manual).

Remaining items are **external/manual** (demo video, Squads multisig, mainnet
funds, external audit, npm publish) or deliberately-deferred risky migrations.

---

## 1. What actually works today ✅

- **3 Anchor programs on devnet** (`bonded_registry`, `dag_escrow`,
  `reputation_bridge`), SBPFv3, initialized and wired via a `dag_authority` PDA so
  only `dag_escrow` can slash stake / write reputation.
- **37/37 program tests** passing (stake/tier/slash, DAG creation + cycle
  rejection, claim/complete with fee, expire + cascade refund + slash + failure
  reputation, cancel, replay guard).
- **End-to-end devnet run** (`scripts/e2e-devnet.mts`) with real tx signatures:
  3-tier staking → pipeline → settle + fee + reputation → tier-gated claim →
  expire + slash + cascade refund.
- **Live stack:** dashboard (Vercel), indexer + facilitator (Fly.io), SDK
  (`@chainpipe/solana`).
- **Self-serve onboarding:** any wallet can faucet test USDC and `stake_and_register`
  from `/my/stake`; verified with a fresh real wallet reaching Tier 1.

---

## 2. Blockers before real users can _use it for real work_ (P0)

These are the things that make the difference between "a demo" and "a product
someone trusts with value."

1. **No real economic layer.** Everything runs on **devnet with a custom test
   mint** the facilitator can print infinitely. There is no real USDC, no mainnet,
   no real money at stake. Until mainnet + real USDC, "putting capital at risk"
   and "settlement" are simulated.
2. **No agent-execution / proof-of-work layer.** The protocol settles _payment_
   and _reputation_, but `complete_node` is **facilitator-attested** — the
   facilitator only checks on-chain state (node Claimed, deadline not passed) and
   a trivial timeliness `scoreDelta`. It does **not** verify that the agent did
   the work or that the output is correct. For "good work," ChainPipe needs to
   connect to actual agent endpoints (e.g. x402/MCP services) and a verification
   story (attestation, output hashing, dispute window, oracle, or staked
   challenge). Today a malicious-but-fast agent gets paid.
3. **Centralized trust.** A single key (`5cpc…`) is the **upgrade authority on all
   three programs** (mutable — can be changed/rugged), the operator, and (until
   reassigned) the mint authority; the **facilitator is a single trusted keypair**
   that gates every settlement. Real users must trust this one entity completely.
   → Migrate to a multisig (Squads), set/relinquish upgrade authority, and design
   a path to decentralize or bond the facilitator.
4. **Agent workflow is incomplete in the UI.** The dashboard supports **staking**
   and **creating pipelines**, but there is **no UI for an agent to claim a node**
   or for completion/expiry — those only exist in the SDK/scripts/facilitator. A
   real agent operator can't run the full loop from the app.

---

## 3. Security & smart-contract gaps (P0/P1)

- **Unaudited programs.** No third-party or internal security audit. Needs at
  minimum: a self-review pass, fuzzing of the DAG cascade math, and ideally an
  external audit before mainnet.
- **Mutable upgrade authority on a single hot key** (see above) — the #1 trust
  red flag a reviewer will spot on the explorer.
- **`expire_node` cascade is O(nodes²)** over `remaining_accounts` and trusts the
  caller to pass all node accounts; a caller passing a subset could under-expire
  the cascade. Worth hardening (derive/verify the full set on-chain, or bound it).
- **Facilitator authority = single keypair** with no rotation story; if leaked,
  an attacker can settle arbitrary claimed nodes.
- **Faucet mints unlimited test tokens** (devnet-only, rate-limited 6/min) — must
  be removed/gated for any non-devnet deployment.
- **No replay/auth on read endpoints** (fine) but **`/complete` and `/expire`**
  rely solely on on-chain state + an ed25519 signature; no per-agent rate limit
  keyed to the agent (only IP).

## 4. Testing & quality gaps (P1)

- **Only the 3 Anchor programs have tests** (`tests/*.ts`). **No automated tests**
  for the SDK, facilitator, or indexer (verification was done via one-off scripts).
- **No CI** (`.github/` absent) — nothing runs `anchor test` / builds on push.
- **No `LICENSE` file** though README states MIT.
- **No monitoring/alerting/error tracking** on the Fly services.

## 5. Infra / ops gaps (P1/P2)

- **Indexer storage is ephemeral** on Fly (re-polls on restart; brief data gap).
  Attach a volume or move to a DB for durability.
- **Single region (iad), single machine** each; no health-check-driven restarts
  beyond Fly defaults; cold-start risk if auto-stop is ever enabled.
- **Indexer uses public devnet RPC** (rate-limited) — needs a dedicated RPC
  (Helius/Triton) for reliability at any real volume.
- **Secrets:** facilitator keypair + mint authority live on the Fly machine
  (devnet-acceptable; mainnet needs an HSM/KMS or a different settlement model).

## 6. Product / economic-design gaps (P1)

- **Reputation scoring is a stub** (`scoreDelta` = timeliness only, 200–1000).
  No quality signal, no consumer rating, no decay beyond the EMA.
- **No skill/capability metadata on-chain.** "Skill tags" (`code-gen`, etc.) are
  off-chain labels in the seed script only; the bazaar can't truly filter by
  capability. Discovery is tier/score only.
- **Tier→max-job-value enforcement is partial.** `required_tier` gates claims, but
  there's no on-chain cap tying a tier to a maximum node allocation as the pitch
  describes.
- **7-day unstake cooldown** makes the unstake path untestable on devnet without
  waiting (the test suite uses a 20-slot cooldown; production config is real).
- **No fee/treasury accounting UI**, no analytics for operators.

## 7. Docs / credibility gaps (P0 for grants)

- **The "official Solana 8004 / ATOM registry" integration is NOT implemented.**
  `reputation_bridge` is ChainPipe's **own** standalone program; the 8004/ATOM
  composability is an _upgrade path_ (a single code comment), not working code. The
  pitch (CLAUDE.md / README) implies a live tie-in. **A grant reviewer who checks
  will see the discrepancy.** Either build the CPI to QuantuLabs' registry or
  reword the claim to "designed to be composable with."
- **No demo video** (the README has a placeholder; "record this last").
- **No architecture diagram asset, no whitepaper/spec**, no comparison evidence
  (the differentiation table vs Dexter/PayAI/MCPay/8004 is asserted, not cited).
- **README quick-start references `anchor test` / scripts** but doesn't document
  the live URLs prominently or the faucet→stake user path.

---

## 8. Prioritized "what's left" checklist

### P0 — required for credible real-user testing / grant submission
- [ ] Record a 2–3 min demo video of the live flow (faucet → stake → create
      pipeline → settle/expire) and embed in README.
- [ ] Fix the **8004/ATOM claim**: either implement the registry CPI or reword to
      "composable-by-design," everywhere it appears.
- [ ] Add a **LICENSE** file (MIT) + a short architecture diagram.
- [ ] Move program **upgrade authority to a Squads multisig** (or document a
      credible plan); surface this in the README for trust.
- [ ] Build the **agent claim → complete UI** so the full loop is usable from the app.
- [ ] Write the honest "devnet / trust model / roadmap" section so reviewers
      aren't surprised.

### P1 — required before mainnet / real value
- [ ] Mainnet deploy plan with **real USDC**; remove the faucet.
- [ ] A **proof-of-work / verification** design (attestation, dispute window, or
      oracle) so settlement reflects real delivery.
- [ ] **Decentralize / bond the facilitator** (or at least multisig + rotation).
- [ ] Tests for SDK/facilitator/indexer + **CI** (GitHub Actions running
      `anchor test` and builds).
- [ ] **Dedicated RPC** + durable indexer storage + monitoring.
- [ ] Security review/audit of the programs (esp. the expire cascade).

### P2 — polish & growth
- [ ] On-chain skill/capability metadata + richer bazaar filtering.
- [ ] Better reputation scoring (quality + consumer ratings + decay).
- [ ] DAG **graph** visualization (currently a list).
- [ ] More wallets, mobile-adapter UX, analytics, operator dashboards.
- [ ] SDK published to npm with docs/examples.

---

## 9. Honest one-paragraph verdict

ChainPipe is a **well-executed, genuinely-working devnet prototype** of two
non-trivial primitives, with real programs, real tests, and a real deployed stack
— which already puts it ahead of most grant submissions at the demo stage. To be
something real users _rely on_, it needs (1) a real value layer (mainnet + USDC),
(2) a proof-of-work/verification story so payment ≠ blind trust in the facilitator,
(3) decentralized/multisig trust instead of one hot key, and (4) the headline
claims (8004 registry) to match the code. None of these are blockers to a strong
grant application as a _public-good prototype with a clear roadmap_ — but they are
blockers to "real users doing real work."
