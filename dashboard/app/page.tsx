import Link from "next/link";
import { getStats, getAgents, getPipelines, type Stats, type AgentRecord, type PipelineRecord } from "@/lib/indexer";
import { C, usd, usdC, short, tapeSeq } from "@/lib/theme";
import { repScore, agentTitle, nodeStatuses, settledCount } from "@/lib/adapt";
import { pipelineColor, pipelineLabel } from "@/lib/theme";
import { DagCanvas, type DagNode } from "@/components/DagCanvas";
import { TierBadge, OutcomeTape, SegBar } from "@/components/primitives";

export const dynamic = "force-dynamic";

const HERO: DagNode[] = [
  { id: 0, label: "0", title: "data-fetch", allocStr: "30.00", statusShort: "SETTLED", agentStr: "Bz4k…gK2", tier: 2, deps: [], status: "settled" },
  { id: 1, label: "1", title: "code-gen", allocStr: "60.00", statusShort: "CLAIMED", agentStr: "Ag1z…QvB", tier: 3, deps: [0], status: "claimed" },
  { id: 2, label: "2", title: "report-synth", allocStr: "40.00", statusShort: "PENDING", agentStr: "—", tier: 2, deps: [1], status: "pending" },
  { id: 3, label: "3", title: "image-gen", allocStr: "20.00", statusShort: "PENDING", agentStr: "—", tier: 1, deps: [0], status: "pending" },
];

export default async function Home() {
  let stats: Stats | null = null;
  let agents: AgentRecord[] = [];
  let pipelines: PipelineRecord[] = [];
  try {
    [stats, agents, pipelines] = await Promise.all([getStats(), getAgents(), getPipelines()]);
  } catch {
    /* indexer offline */
  }
  const topAgents = [...agents].filter((a) => a.reputation).sort((a, b) => (b.reputation!.emaScore) - (a.reputation!.emaScore)).slice(0, 4);
  const recent = pipelines.slice(0, 5);

  const readout: { label: string; value: string; color: string }[] = [
    { label: "PIPELINES", value: String(stats?.totalPipelines ?? 0), color: C.hi },
    { label: "ACTIVE", value: String(stats?.activePipelines ?? 0), color: C.green },
    { label: "NODES SETTLED", value: String(stats?.totalNodesSettled ?? 0), color: C.hi },
    { label: "REFUNDED", value: usd(stats?.totalUsdcRefunded ?? "0", 0), color: C.amber },
    { label: "AGENTS", value: String(stats?.totalAgentsStaked ?? 0), color: C.hi },
    { label: "TOTAL STAKE", value: usdC(stats?.totalStakeValueUsdc ?? "0"), color: C.tx },
  ];

  return (
    <div className="cp-in">
      {/* hero */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 48, padding: "62px 0 44px", borderBottom: `1px solid ${C.line}`, alignItems: "center" }}>
        <div style={{ flex: "1 1 440px", minWidth: 300 }}>
          <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".16em", color: C.dim, marginBottom: 22 }}>SOLANA · USDC ESCROW PROTOCOL</div>
          <h1 style={{ fontSize: 46, lineHeight: 1.05, letterSpacing: "-.035em", fontWeight: 600, margin: "0 0 20px", maxWidth: 560 }}>Lock one budget for the whole pipeline.</h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: C.tx, margin: "0 0 30px", maxWidth: 480 }}>
            ChainPipe escrows a single USDC budget across a DAG of agents. Each node settles as its dependencies clear — miss a deadline and the refund cascades downstream, atomically, on-chain.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <Link href="/pipeline/create" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 18px", borderRadius: 8, border: `1px solid ${C.hi}`, background: C.hi, color: C.bg0, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
              Create a pipeline <span className="mono">→</span>
            </Link>
            <Link href="/my/stake" style={{ color: C.tx, fontWeight: 500, fontSize: 14, textDecoration: "none", borderBottom: `1px solid ${C.line2}`, paddingBottom: 2 }}>Stake &amp; find work as an agent</Link>
          </div>
        </div>
        <div style={{ flex: "1 1 380px", minWidth: 300 }}>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, background: C.bg, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderBottom: `1px solid ${C.line}` }}>
              <span className="cp-blink" style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
              <span className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".12em", color: C.dim }}>LIVE PIPELINE</span>
              <span className="mono" style={{ fontWeight: 500, fontSize: 11, color: C.tx }}>7mQ3…pe1A</span>
              <div style={{ flex: 1 }} />
              <span className="mono" style={{ fontWeight: 500, fontSize: 10, color: C.green }}>ACTIVE</span>
            </div>
            <DagCanvas nodes={HERO} height={300} />
          </div>
        </div>
      </div>

      {/* stats: one hero figure + inline secondary */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 40, padding: "30px 0", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ flex: "none" }}>
          <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".14em", color: C.dim, marginBottom: 8 }}>TOTAL VALUE SETTLED</div>
          <div className="mono" style={{ fontWeight: 600, fontSize: 52, letterSpacing: "-.03em", lineHeight: 1 }}>{usd(stats?.totalUsdcSettled ?? "0", 0)}</div>
          <div style={{ height: 2, width: 180, marginTop: 12, background: "linear-gradient(90deg,#14f195,#9945ff)", borderRadius: 2 }} />
        </div>
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: "34px 44px", paddingBottom: 6 }}>
          {readout.map((m) => (
            <div key={m.label}>
              <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".12em", color: C.dim, marginBottom: 7 }}>{m.label}</div>
              <div className="mono" style={{ fontWeight: 500, fontSize: 22, letterSpacing: "-.02em", color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* tables */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 48, padding: "38px 0 80px" }}>
        <div style={{ flex: "1 1 420px", minWidth: 300 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".14em", color: C.dim }}>TOP AGENTS BY REPUTATION</div>
            <Link href="/bazaar" style={{ color: C.tx, fontWeight: 500, fontSize: 12, textDecoration: "none" }}>Bazaar →</Link>
          </div>
          <div style={{ borderTop: `1px solid ${C.line}` }}>
            {topAgents.length === 0 && <div className="mono" style={{ padding: "16px 4px", color: C.faint, fontSize: 12 }}>No agents yet.</div>}
            {topAgents.map((a, i) => (
              <Link key={a.agent} href={`/agent/${a.agent}`} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto auto", gap: 14, alignItems: "center", padding: "13px 4px", borderBottom: `1px solid ${C.line}`, textDecoration: "none", color: C.hi }}>
                <span className="mono" style={{ fontWeight: 500, fontSize: 11, color: C.faint }}>{String(i + 1).padStart(2, "0")}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                  <span className="mono" style={{ width: 30, height: 30, border: `1px solid ${C.line2}`, borderRadius: 6, background: C.panel, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 12, color: C.tx, flex: "none" }}>{agentTitle(a)[0]?.toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{agentTitle(a)}</div>
                    <div className="mono" style={{ fontSize: 11, color: C.dim, lineHeight: 1.25 }}>{short(a.agent)}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <OutcomeTape seq={tapeSeq(a.reputation?.totalSettled ?? 0, a.reputation?.totalFailed ?? 0, 20)} width={84} height={14} />
                  <span className="mono" style={{ fontWeight: 500, fontSize: 15, width: 46, textAlign: "right" }}>{repScore(a)}</span>
                </div>
                <TierBadge tier={a.tier} />
              </Link>
            ))}
          </div>
        </div>

        <div style={{ flex: "1 1 420px", minWidth: 300 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".14em", color: C.dim }}>RECENT PIPELINES</div>
            <Link href="/my/pipelines" style={{ color: C.tx, fontWeight: 500, fontSize: 12, textDecoration: "none" }}>All →</Link>
          </div>
          <div style={{ borderTop: `1px solid ${C.line}` }}>
            {recent.length === 0 && <div className="mono" style={{ padding: "16px 4px", color: C.faint, fontSize: 12 }}>No pipelines yet.</div>}
            {recent.map((p) => {
              const stColor = pipelineColor((Object.keys(p.status)[0] || "active"));
              const stLabel = pipelineLabel(Object.keys(p.status)[0] || "active");
              return (
                <Link key={p.address} href={`/pipeline/${p.address}`} style={{ display: "grid", gridTemplateColumns: "1fr 120px auto", gap: 16, alignItems: "center", padding: "13px 4px", borderBottom: `1px solid ${C.line}`, textDecoration: "none", color: C.hi }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 1, background: stColor }} />
                      <span className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: stColor }}>{stLabel}</span>
                      <span className="mono" style={{ fontSize: 12, color: C.tx }}>{short(p.address)}</span>
                    </div>
                    <SegBar statuses={nodeStatuses(p)} />
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: C.dim }}>{settledCount(p)}/{p.totalNodes} settled</div>
                  <div className="mono" style={{ fontWeight: 500, fontSize: 14, textAlign: "right" }}>{usd(p.totalUsdcLocked, 2)}</div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
