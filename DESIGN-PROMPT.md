# Claude design prompt — ChainPipe UI (production / designer-grade)

Paste into Claude with Artifacts on. Goal: a UI that looks like a real design team
shipped it — not a generic AI dark-dashboard.

---

You are the founding designer at a top-tier crypto product studio. Your work looks
like Linear, Vercel, Stripe, Phantom, Jupiter, Highlight, Family, and a Bloomberg
terminal — never like a generic AI dashboard. Design the **ChainPipe** interface to a
**production, portfolio-grade** standard and deliver it as a runnable **React +
Tailwind artifact** with mocked data.

## Read this first: the current version is generic. Do NOT repeat these AI tells.
I will reject the design if it does any of these:
- A green→purple gradient on every button/heading. **The Solana gradient is a
  garnish, not the theme.** Use one restrained accent; let the gradient appear once,
  maybe, in a single hero moment.
- A row of 6–8 identical evenly-spaced stat cards. Financial dashboards have
  **hierarchy** — one or two hero numbers, the rest secondary/inline.
- Donut/ring progress for "reputation." Find a more legible, more original
  representation of a 0–100 trust score.
- Centered hero with a big two-line headline and two pill buttons. Overdone.
- Glassmorphism, neon glows on everything, rounded-2xl on every box, emoji as icons,
  faux-3D, generic "web3" purple haze backgrounds.
- Everything the same density, same border, same radius, same spacing. No rhythm.

If your draft looks like a Tailwind UI template with crypto words in it, start over.

## Make a real art-direction decision (state it, then commit)
Pick ONE strong concept and execute it ruthlessly. Examples (choose or better one):
- **"On-chain control room"** — terminal/instrument aesthetic: tight grid, hairline
  rules, tabular monospace numerics, dense data, restrained color, status as the
  only color. Trust through precision.
- **"Editorial fintech"** — large confident typography, lots of negative space,
  serif/grotesk pairing, magazine-like layout, money rendered beautifully.
- **"Engineering tool"** — Linear-grade: crisp, fast, opinionated, keyboard-first,
  every pixel intentional.
Whatever you choose, the DAG is the soul of the product — design it like a signature
data-visualization, not a row of cards.

## Craft requirements (this is what separates designer from AI)
- **Typography:** a real type system. Pick a distinctive pairing (e.g. a grotesk like
  Inter Tight / Geist / Söhne-feel for UI + a true monospace like Berkeley
  Mono/JetBrains for addresses & numbers). Define a type scale, line-height, and
  **tracking**; use **tabular/lining figures** for all money and metrics so columns
  align. Big numbers should feel engineered, not bold-by-default.
- **Color discipline:** a near-monochrome dark base with 1 accent + a precise status
  palette (pending/claimed/settled/expired). Color carries meaning only. Define exact
  hex tokens and contrast (WCAG AA). No background gradients-for-mood.
- **Grid & layout:** an intentional, sometimes asymmetric grid. Vary density: dense
  data tables vs. breathing hero. Use hairline dividers and alignment over boxes-in-
  boxes. Show you understand optical spacing.
- **Depth:** earn it — one elevation system, subtle shadows or borders (not both),
  maybe a faint grain or 1px gridline texture. Glow only on the one thing that matters.
- **Motion (describe + implement what's cheap):** purposeful only — value flowing
  along DAG edges on settle, number count-ups, a node's state transition, refund
  cascading visibly downstream on expire. Honor `prefers-reduced-motion`.
- **Components are bespoke, not borrowed:** a real tier badge system, a reputation
  representation you invented, a node card that reads at a glance, a wallet/identity
  chip, status pills with intent. Empty/loading/error states designed, not default.
- **Voice:** copy that's confident and specific ("Lock one budget for the whole
  pipeline. Refunds cascade on failure."), not buzzword soup.

## The product (so the design is real, not decorative)
ChainPipe (Solana, devnet): consumers lock one USDC budget for a **pipeline** = a DAG
of agent **nodes** (allocation, deadline, deps, required tier). Nodes settle as deps
complete; an expired node **cascades refunds** to downstream nodes + the consumer.
Agents **stake** USDC for a trust **tier** (T1≥10 / T2≥100 / T3≥1000); failure
**slashes** stake; on-chain **reputation** (EMA 0–100, settled/failed) is written only
by the escrow program (un-forgeable). Two personas: **consumer** (builds pipelines)
and **agent** (stakes, claims & completes nodes).

### Screens (redesign all; make 1,2,5 the heroes)
1. Landing `/` — value prop, **live stats** (hierarchy!), featured agents, recent
   pipelines, clear consumer-vs-agent entry.
2. Pipeline builder `/pipeline/create` — visual DAG editor: add nodes, set
   allocation/deadline/tier, draw deps to earlier nodes only (acyclic), live-validate,
   budget meter, wallet-signed create. **Signature screen.**
3. Pipeline detail `/pipeline/[pda]` — **live DAG visualization**, status, vault math,
   per-node detail + deadline countdowns + tx links, cascade-refund made visible.
   **Signature screen.**
4. Bazaar `/bazaar` — filterable/sortable agent discovery (tier, reputation, jobs).
5. Agent profile `/agent/[pubkey]` — tier, reputation w/ history, stake, track record.
6. Find work `/work` — agent console: claimable nodes (Claim) + in-progress (Submit).
7. My stake `/my/stake` — fresh-wallet onboarding (faucet → stake & register, tier
   picker) and manage stake.
8. Global — top nav + Solana wallet connect, tx toasts w/ explorer links, real states.

### Data shapes (mock realistic values; money is 6-dp integer strings, ema 0–10000)
```ts
Stats{ totalPipelines, activePipelines, totalNodesSettled, totalUsdcSettled,
       totalUsdcRefunded, totalAgentsStaked, totalStakeValueUsdc }
Agent{ agent, tier:0|1|2|3, stakeAmount, openJobs, totalSettled, totalSlashed,
       reputation:{emaScore /*0..10000*/, totalSettled, totalFailed}|null, skill? }
Node{ nodeIndex, agent, allocationUsdc, deadlineSlot, dependencyMask, requiredTier,
      status: "pending"|"claimed"|"settled"|"expired" }
Pipeline{ address, consumer, totalNodes, totalUsdcLocked, nodesSettled, nodesExpired,
          status:"active"|"completed"|"partiallyRefunded"|"cancelled", nodes:Node[] }
```
Mock ~6 agents across tiers + skills (code-gen, data-fetch, report-synthesis,
image-gen, audio-transcribe), and ~4 pipelines incl. one partially-refunded with a
3–4 node DAG so the cascade shows.

## Constraints & deliverable
- Implementable in: **Next.js 15 App Router, React 18, Tailwind, wallet-adapter**.
  Public pages server-rendered for first paint; wallet actions client-side. No
  invented backend (REST indexer + on-chain txs). Fonts: if a CDN font is blocked in
  the artifact, fall back gracefully but specify the intended typefaces.
- Fully responsive; page never scrolls horizontally; wide tables/graphs scroll in
  their own container. WCAG AA contrast. Respect reduced-motion.
- **Deliver:** first, 4–6 lines stating your art-direction concept + the exact design
  tokens (typefaces, type scale, color hex, radii, spacing, elevation). Then a single
  runnable React+Tailwind artifact, everything inlined, focused on **landing + the
  pipeline builder + the pipeline DAG detail at very high fidelity**, with the other
  screens as polished secondary views. Then a short component inventory for porting.

Hold yourself to: "would this win on a design-portfolio site, and would a Solana grant
committee screenshot it?" If not, push the concept harder. Show craft, restraint, and
a point of view — not features in boxes.
