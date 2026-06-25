import Link from "next/link";
import { getStats, getAgents, getPipelines, type Stats, type AgentRecord, type PipelineRecord } from "@/lib/indexer";
import { usd, usdC, short } from "@/lib/theme";
import { repScore, agentTitle, settledCount } from "@/lib/adapt";
import { pipelineLabel } from "@/lib/theme";
import { TierBadge } from "@/components/primitives";

export const dynamic = "force-dynamic";

const statusKeyOf = (p: PipelineRecord) => Object.keys(p.status)[0] || "active";

/** Bracketed mono status chip — the broadsheet's only "badge". */
function Chip({ label, alert = false }: { label: string; alert?: boolean }) {
  return (
    <span
      className="mono"
      style={{
        display: "inline-block",
        padding: "3px 8px",
        border: `1px solid ${alert ? "#4D1518" : "#C4BDAD"}`,
        background: alert ? "#FBEFEE" : "transparent",
        color: alert ? "#4D1518" : "#6A655B",
        fontSize: 11,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        fontWeight: alert ? 700 : 500,
        whiteSpace: "nowrap",
      }}
    >
      [ {label} ]
    </span>
  );
}

export default async function Home() {
  let stats: Stats | null = null;
  let agents: AgentRecord[] = [];
  let pipelines: PipelineRecord[] = [];
  try {
    [stats, agents, pipelines] = await Promise.all([getStats(), getAgents(), getPipelines()]);
  } catch {
    /* indexer offline */
  }
  const topAgents = [...agents].filter((a) => a.reputation).sort((a, b) => b.reputation!.emaScore - a.reputation!.emaScore).slice(0, 5);
  const recent = pipelines.slice(0, 5);
  const feed = pipelines.slice(0, 4);

  const metrics = [
    { label: "Total Settled", value: usdC(stats?.totalUsdcSettled ?? "0"), sub: "USDC equivalent" },
    { label: "Active Pipelines", value: String(stats?.activePipelines ?? 0), sub: `of ${stats?.totalPipelines ?? 0} deployed` },
    { label: "Nodes Settled", value: String(stats?.totalNodesSettled ?? 0), sub: "all-time" },
    { label: "Staked Agents", value: String(stats?.totalAgentsStaked ?? 0), sub: "active participants" },
    { label: "Total Stake", value: usdC(stats?.totalStakeValueUsdc ?? "0"), sub: "bonded collateral" },
  ];

  return (
    <div className="cp-in">
      {/* ── hero: billboard + settlement feed ── */}
      <section className="pt-12 pb-16 md:pb-section-gap grid grid-cols-1 md:grid-cols-12 gap-gutter">
        <div className="md:col-span-7 flex flex-col">
          {/* One word per line, sized so the longest ("AUTONOMOUS") fits the 7-col
              slot without breaking — editorial masthead, not chopped words. */}
          <h1
            className="uppercase text-ink m-0 font-serif"
            style={{ fontWeight: 700, fontSize: "clamp(42px, 8.4vw, 112px)", lineHeight: 0.9, letterSpacing: "-0.04em" }}
          >
            {["Escrowed", "DAG", "Pipelines", "For", "Autonomous", "Agents"].map((w) => (
              <span key={w} className="block whitespace-nowrap">{w}</span>
            ))}
          </h1>
          <p className="font-serif italic text-slate text-xl leading-relaxed max-w-2xl mt-8">
            Facilitating immutable settlement paths across a DAG of staked agents. A single USDC
            budget locks once; each node settles as its dependencies clear, and a missed deadline
            cascades the refund downstream — atomically, on-chain. The authoritative registry of
            definitive state.
          </p>
          <div className="flex flex-wrap items-center gap-7 mt-10">
            <Link href="/pipeline/create" className="btn-oxblood mono no-underline" style={{ padding: "13px 22px", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 10 }}>
              Create a pipeline <span>→</span>
            </Link>
            <Link href="/work" className="font-serif text-ink no-underline" style={{ borderBottom: "1px solid #161512", paddingBottom: 2 }}>
              Stake &amp; find work as an agent
            </Link>
          </div>
        </div>

        {/* settlement feed */}
        <div className="md:col-span-5 flex flex-col md:border-l border-mist md:pl-gutter mt-12 md:mt-0">
          <div className="masthead-rule w-full mb-4" />
          <h2 className="font-serif text-[28px] font-semibold uppercase tracking-tight mb-6">01 / Settlement Feed</h2>
          <div className="flex flex-col gap-4">
            {feed.length === 0 && <div className="mono text-[12px] text-slate-dim">Awaiting on-chain activity…</div>}
            {feed.map((p) => {
              const k = statusKeyOf(p);
              const alert = k === "partiallyRefunded" || k === "cancelled";
              return (
                <Link key={p.address} href={`/pipeline/${p.address}`} className="pb-4 border-b border-mist no-underline block group">
                  <div className="flex justify-between mono text-[12px] text-slate uppercase mb-1">
                    <span>{short(p.address)}</span>
                    <span>{settledCount(p)}/{p.totalNodes} nodes</span>
                  </div>
                  <div className="font-serif text-[15px] text-ink group-hover:text-oxblood-deep transition-colors">
                    Pipeline budget locked across {p.totalNodes}-node DAG
                  </div>
                  <div className="mono text-[12px] mt-2" style={{ color: alert ? "#4D1518" : "#6B1F23" }}>
                    {alert ? "Refund cascaded" : "Locked"}: {usd(p.totalUsdcLocked, 2)} USDC
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── instrument strip ── */}
      <section className="border-y border-mist flex flex-wrap md:flex-nowrap -mx-4 md:-mx-16">
        {metrics.map((m, i) => (
          <div
            key={m.label}
            className={`w-1/2 md:w-1/5 p-6 flex flex-col justify-between min-h-[140px] border-b md:border-b-0 border-mist ${i < metrics.length - 1 ? "md:border-r" : ""}`}
          >
            <span className="mono text-[12px] text-slate uppercase tracking-widest">{m.label}</span>
            <div>
              <div className="mono text-4xl text-ink tracking-tight mb-1">{m.value}</div>
              <div className="font-serif text-xs italic text-slate">{m.sub}</div>
            </div>
          </div>
        ))}
      </section>

      {/* ── ledgers ── */}
      <section className="py-16 md:py-section-gap grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-16">
        {/* top agents */}
        <div>
          <div className="masthead-rule w-full mb-4" />
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="font-serif text-[32px] font-semibold uppercase tracking-tight">02 / Top Agents</h2>
            <Link href="/bazaar" className="mono text-[12px] uppercase tracking-wider text-slate hover:text-oxblood-deep no-underline">Bazaar →</Link>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-y border-mist">
                <th className="py-3 font-serif text-[13px] font-semibold uppercase tracking-wider">Agent Identity</th>
                <th className="py-3 text-right font-serif text-[13px] font-semibold uppercase tracking-wider">Reputation</th>
                <th className="py-3 text-right font-serif text-[13px] font-semibold uppercase tracking-wider">Stake</th>
                <th className="py-3 text-right font-serif text-[13px] font-semibold uppercase tracking-wider">Tier</th>
              </tr>
            </thead>
            <tbody>
              {topAgents.length === 0 && (
                <tr><td colSpan={4} className="py-4 mono text-[12px] text-slate-dim">No agents registered yet.</td></tr>
              )}
              {topAgents.map((a) => (
                <tr key={a.agent} className="border-b border-mist hover:bg-paper-dim transition-colors">
                  <td className="py-4">
                    <Link href={`/agent/${a.agent}`} className="no-underline flex flex-col sm:flex-row sm:items-baseline gap-x-3">
                      <span className="mono text-[13px] text-slate-dim w-24 shrink-0">{short(a.agent)}</span>
                      <span className="font-serif text-[15px] text-ink hover:text-oxblood-deep transition-colors">{agentTitle(a)}</span>
                    </Link>
                  </td>
                  <td className="py-4 text-right mono text-[14px] text-oxblood-deep">{repScore(a)}%</td>
                  <td className="py-4 text-right mono text-[14px] text-ink">{usdC(a.stakeAmount)}</td>
                  <td className="py-4 text-right"><div className="inline-flex justify-end"><TierBadge tier={a.tier} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* recent pipelines */}
        <div>
          <div className="masthead-rule w-full mb-4" />
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="font-serif text-[32px] font-semibold uppercase tracking-tight">03 / Recent Pipelines</h2>
            <Link href="/my/pipelines" className="mono text-[12px] uppercase tracking-wider text-slate hover:text-oxblood-deep no-underline">All →</Link>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-y border-mist">
                <th className="py-3 font-serif text-[13px] font-semibold uppercase tracking-wider">Address</th>
                <th className="py-3 text-right font-serif text-[13px] font-semibold uppercase tracking-wider">Nodes</th>
                <th className="py-3 text-right font-serif text-[13px] font-semibold uppercase tracking-wider">Locked</th>
                <th className="py-3 text-right font-serif text-[13px] font-semibold uppercase tracking-wider">State</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr><td colSpan={4} className="py-4 mono text-[12px] text-slate-dim">No pipelines yet.</td></tr>
              )}
              {recent.map((p) => {
                const k = statusKeyOf(p);
                const alert = k === "partiallyRefunded" || k === "cancelled";
                return (
                  <tr key={p.address} className="border-b border-mist hover:bg-paper-dim transition-colors">
                    <td className="py-4">
                      <Link href={`/pipeline/${p.address}`} className="mono text-[14px] text-ink hover:text-oxblood-deep transition-colors no-underline">{short(p.address)}</Link>
                    </td>
                    <td className="py-4 text-right mono text-[14px] text-ink">{settledCount(p)}/{p.totalNodes}</td>
                    <td className="py-4 text-right mono text-[14px] text-ink">{usd(p.totalUsdcLocked, 2)}</td>
                    <td className="py-4 text-right"><Chip label={pipelineLabel(k)} alert={alert} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
