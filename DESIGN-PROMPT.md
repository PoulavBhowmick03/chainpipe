# Claude design prompt — ChainPipe UI

Paste into Claude (claude.ai with Artifacts on, or Claude Code). It will produce a
self-contained, runnable design you can iterate on.

---

You are a senior product designer + front-end engineer who designs award-worthy
crypto/dev-tool interfaces (think Linear, Vercel, Phantom, Jupiter, Helius). Design
an **amazing, production-credible UI for ChainPipe** and deliver it as a single
self-contained **React + Tailwind artifact** I can preview immediately, using mocked
data that matches the real data shapes below. Prioritize a clear information
hierarchy and one or two signature "wow" moments over decoration.

## What ChainPipe is (context)
ChainPipe is a Solana protocol for the **AI agent economy** with two primitives:
1. **DAG Pipeline Escrow** — a consumer locks one USDC budget for a *pipeline* of
   cooperating agents expressed as a directed acyclic graph (DAG) of *nodes*. Each
   node has an allocation, a deadline, and dependencies on other nodes. Nodes settle
   individually as their dependencies complete; if a node misses its deadline anyone
   can expire it and the refund **cascades atomically** to all downstream nodes and
   back to the consumer.
2. **Bonded Agent Registry** — agents stake USDC for a trust **tier** (T1 ≥10, T2
   ≥100, T3 ≥1000 USDC). Tier gates which nodes an agent may claim. Failure
   **slashes** stake to the wronged consumer. A facilitator-gated **reputation**
   (EMA score 0–100, settled/failed counts) is written on-chain only via the escrow
   program — so reputation can't be forged.

It's live on Solana devnet. Tone: precise, trustworthy, a little futuristic — money
and trust are at stake, so it must feel solid, not gimmicky.

## Brand / visual direction
- Dark, high-contrast, "on-chain control room." Base ink `#0b0e14`, panel `#11151f`.
- Solana accent gradient: green `#14f195` → purple `#9945ff` (use sparingly for
  emphasis, CTAs, the DAG flow, tier/score highlights).
- Status colors: pending (slate), claimed (blue), settled (green), expired (red).
- Clean system font stack; generous spacing; subtle borders (white/8–12%); soft
  glows on active/important elements only. Motion: tasteful, purposeful (flow along
  DAG edges, number count-ups, settle/expire transitions). Respect reduced-motion.
- Must be fully responsive (mobile → wide desktop); wide content scrolls inside its
  own container, the page never scrolls horizontally.

## Screens to design (these already exist as routes — redesign them)
1. **Landing `/`** — hero (the value prop in one line), a live **stats bar**
   (pipelines, active, nodes settled, USDC settled/refunded, agents staked, total
   stake), **featured agents**, **recent pipelines**, primary CTAs: Create pipeline /
   Find work / Browse bazaar. Show real numbers immediately (it's server-rendered).
2. **Bazaar `/bazaar`** — discover agents: filter by tier + min reputation, sort by
   reputation/stake/jobs, paginated table or card grid. Each agent shows tier badge,
   EMA score (as a bar/dial), stake, settled/failed.
3. **Agent profile `/agent/[pubkey]`** — tier, reputation (with a small history
   chart), stake, open jobs, settled/failed, explorer link.
4. **Pipeline builder `/pipeline/create`** — THE signature screen. A visual DAG
   editor: add/remove nodes, set allocation (USDC) + deadline (hours) + required tier,
   draw dependencies between nodes (only to earlier nodes — acyclic), live-validate
   (no cycles, total ≤ budget), show total locked + per-node breakdown, then a
   "Create pipeline" CTA (wallet-signed). Make the graph editing delightful.
5. **Pipeline detail `/pipeline/[pda]`** — the OTHER signature screen. A live
   **DAG visualization** (nodes as cards positioned by dependency depth, animated
   edges, color-coded by status), pipeline status, vault/locked/settled/refunded,
   per-node detail (agent, allocation, deadline countdown, tx links). Show the
   cascade-refund concept visually when a node expires.
6. **Find work `/work`** (agent console) — for a connected agent: their tier; a list
   of **claimable** nodes (deps settled, tier ok) with Claim; their **in-progress**
   claimed nodes with "Submit completion."
7. **My pipelines `/my/pipelines`** — the consumer's pipelines with status.
8. **My stake `/my/stake`** — onboarding flow for a fresh wallet: ① Get test USDC
   (faucet) → ② Stake & register (tier selector); for registered agents show
   stake/tier/open-jobs + add/unstake.
9. **Global**: top nav with wallet connect (Solana wallet-adapter modal), an
   "agent vs consumer" mental model that's obvious, empty/loading/error states,
   toasts for tx success with explorer links.

## Signature moments (spend your best effort here)
- The **DAG builder** and the **DAG status visualization** — these are the product's
  identity. Make graph layout, edges, and node states beautiful and legible. Show how
  an expired node cascades refunds downstream.
- The **stats bar** and **tier/reputation** visualizations — make trust legible at a
  glance (tier badges, EMA dials, slash/failure indicators).

## Data shapes to mock against (use realistic values)
```ts
type Stats = { totalPipelines:number; activePipelines:number; totalNodesSettled:number;
  totalUsdcSettled:string; totalUsdcRefunded:string; totalAgentsStaked:number; totalStakeValueUsdc:string };
type Agent = { agent:string; tier:0|1|2|3; stakeAmount:string; openJobs:number;
  totalSettled:number; totalSlashed:number;
  reputation:{ emaScore:number /*0..10000, /100 = 0..100*/; totalSettled:number; totalFailed:number } | null;
  skill?:string /* e.g. "code-gen","data-fetch","report-synthesis" */ };
type Node = { nodeIndex:number; agent:string; allocationUsdc:string; deadlineSlot:string;
  dependencyMask:string /*bitmask of dep node indices*/; requiredTier:number;
  status:{pending?:{}}|{claimed?:{}}|{settled?:{}}|{expired?:{}} };
type Pipeline = { address:string; consumer:string; totalNodes:number; totalUsdcLocked:string;
  nodesSettled:number; nodesExpired:number; status:{active?:{}}|{completed?:{}}|{partiallyRefunded?:{}}|{cancelled?:{}};
  nonce:string; nodes:Node[] };
```
USDC amounts are integer strings in 6-decimal base units (e.g. "40000000" = 40.00).
emaScore is 0–10000 (divide by 100 for 0–100). Mock ~5 agents across tiers and ~4
pipelines (one active, one completed, one partially-refunded) with a 3–4 node DAG.

## Constraints & deliverable
- It must be **implementable in the existing stack**: Next.js 15 App Router, React 18,
  Tailwind, `@solana/wallet-adapter-react` (don't invent a backend; data comes from a
  REST indexer and txs go through wallet-adapter). Public/landing/bazaar/pipeline
  pages are server-rendered for first-paint data; wallet actions are client-side.
- Deliver as **one runnable React artifact** with mocked data and Tailwind so I can
  see it now. Inline everything (no external assets/fonts/CDNs). Then list the
  Tailwind design tokens (colors, radii, spacing, typography) and a short component
  inventory so it can be ported into the real app.
- Reference (for tone/data, don't just copy): dashboard https://chainpipe.vercel.app,
  indexer https://chainpipe-indexer.fly.dev/stats.

Start by stating the design concept + a token palette in 4–6 lines, then build the
artifact: landing + bazaar + the pipeline builder + the pipeline DAG detail as the
hero screens, with the others as polished secondary views. Make it something a Solana
grant committee screenshots.
