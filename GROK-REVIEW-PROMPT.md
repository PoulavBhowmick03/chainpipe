# Grok prompt — credibility & Superteam India grant assessment

Paste everything below into Grok (enable web browsing so it can verify the links).

---

You are a hard-nosed Solana ecosystem grant reviewer evaluating a project for the
**Superteam India microgrant** and the **Solana Foundation public-goods grant**.
You are skeptical by default: you verify claims against the live deployment and
on-chain state, you call out vaporware, and you do not give credit for things that
aren't actually shipped. Browse every link before judging.

## Project: ChainPipe

**One-liner:** A two-primitive Solana protocol — (1) **DAG pipeline escrow** that
atomically settles payments across a chain of cooperating AI agents with cascading
refunds when a node fails, and (2) a **bonded agent registry** where agents stake
capital for a trust tier, with **facilitator-gated reputation writes** (only the
escrow program, via a program-derived signer, can write reputation — closing the
"anyone can forge reputation" gap in un-gated registries).

**Thesis:** Existing x402 facilitators (Dexter, PayAI, MCPay) settle individual
job-level payments with no atomicity across multi-agent pipelines; agent
registries allow un-gated reputation attestation. ChainPipe targets both gaps.

### Links to verify
- GitHub repo: https://github.com/PoulavBhowmick03/chainpipe
- Live dashboard (Solana devnet, wallet-adapter): https://chainpipe.vercel.app
- Indexer API (live JSON): https://chainpipe-indexer.fly.dev/stats
- Facilitator API (live JSON): https://chainpipe-facilitator.fly.dev/health
- Deployed programs on Solana **devnet** (open in explorer with `?cluster=devnet`):
  - bonded_registry: https://explorer.solana.com/address/26AB6S5crQAkhfx928bnWSHfpQE6wp2Sdt4afFtk7crq?cluster=devnet
  - dag_escrow: https://explorer.solana.com/address/3FqvkzppD4ciwkGLrcNoTHUCeHwNbWtot18CkrBdXiJd?cluster=devnet
  - reputation_bridge: https://explorer.solana.com/address/6RRfs1Ho1bJ3JWXSy3xVth4BTGHWwVwum74ph2LRWWsf?cluster=devnet
- Repo docs to read: `README.md`, `DEPLOYED.md`, `AUDIT.md`, `BLOCKERS.md`,
  `programs/*/src/lib.rs`, `tests/*.ts`, `scripts/e2e-devnet.mts`.

### Claims to independently verify (don't take them on faith)
1. Three Anchor programs are really deployed on devnet (check the explorer links;
   note they're upgradeable and by whom).
2. The repo has real Anchor programs + a 37-test suite that covers stake/slash,
   DAG cycle rejection, cascade refunds, and a reputation replay guard.
3. The live indexer returns non-zero real state (`/stats`), and the facilitator
   `/health` returns a slot + program IDs.
4. The reputation writes are actually CPI-gated to the escrow program's PDA.
5. **Scrutinize the "official Solana 8004 / ATOM registry" claim** — check whether
   `reputation_bridge` actually integrates with that registry or whether it's a
   standalone program with composability as a future plan. Flag any gap between
   the pitch and the code.
6. Whether there's a real agent-execution / proof-of-work layer, or whether job
   completion is trusted-facilitator-attested.
7. Trust/centralization: who controls program upgrades, the facilitator, and the
   mint; is value real (mainnet/real USDC) or devnet test tokens.

### What I want from you
Be specific and cite what you actually found at the links. Produce:

1. **Verification report** — for each claim above: Confirmed / Partially confirmed
   / Not found / Contradicted, with the evidence you saw.
2. **Technical credibility** (1–10) — code quality, scope, whether the hard parts
   (atomic cascade refunds, CPI-gated reputation, DAG validation) are real.
3. **Originality & differentiation** (1–10) — vs Dexter, PayAI, MCPay, and 8004/
   ATOM registries. Is the "atomicity across pipelines + bonded reputation" angle
   genuinely novel and useful, or incremental?
4. **Traction & proof** (1–10) — live deployment, working demo, on-chain activity,
   commit history, completeness.
5. **Public-good / ecosystem value** — does it advance Solana's agent economy?
6. **Red flags & risks** — be blunt (centralization, unaudited, devnet-only,
   any overclaiming, single-dev bus factor, etc.).
7. **Superteam India grant fit** — given Superteam India funds Solana builders in
   India with microgrants and connects to Solana Foundation grants: a **calibrated
   probability (%)** of receiving (a) a Superteam India microgrant and (b) a
   Solana Foundation public-goods grant **in the current state**, and **separately
   if the top 3 gaps you identify are fixed**.
8. **The single highest-leverage thing** to do before submitting, and a prioritized
   list of the next 5.

Score conservatively. If something isn't shipped, say so. End with a 3-sentence
verdict an actual grant committee could act on.
