import Link from "next/link";
import { getStats, getAgents, getPipelines, type Stats, type AgentRecord, type PipelineRecord } from "@/lib/indexer";
import { C, usd, usdC, short, tapeSeq } from "@/lib/theme";
import { repScore, agentTitle, nodeStatuses, settledCount } from "@/lib/adapt";
import { pipelineColor, pipelineLabel } from "@/lib/theme";
import { TierBadge, OutcomeTape, SegBar } from "@/components/primitives";
import { ParallaxHero } from "@/components/ParallaxHero";
import { HeroDag } from "@/components/HeroDag";

export const dynamic = "force-dynamic";

export default async function Home() {
  let stats: Stats | null = null;
  let agents: AgentRecord[] = [];
  let pipelines: PipelineRecord[] = [];
  try {
    [stats, agents, pipelines] = await Promise.all([getStats(), getAgents(), getPipelines()]);
  } catch {
    /* indexer offline */
  }
  const topAgents = [...agents].filter((a) => a.reputation).sort((a, b) => b.reputation!.emaScore - a.reputation!.emaScore).slice(0, 4);
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
      {/* ── hero: parallax control room ── */}
      <ParallaxHero>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 48, padding: "78px 0 56px", alignItems: "center" }}>
          <div style={{ flex: "1 1 440px", minWidth: 300 }}>
            <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".18em", color: C.dim, marginBottom: 24, display: "flex", alignItems: "center", gap: 9 }}>
              <span className="cp-blink" style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
              SOLANA · USDC ESCROW PROTOCOL
            </div>
            <h1 className="display" style={{ fontSize: "clamp(38px, 5.4vw, 58px)", margin: "0 0 22px", maxWidth: 620 }}>
              Lock one budget for<br />the whole pipeline.
            </h1>
            <p style={{ fontSize: 16.5, lineHeight: 1.62, color: C.tx, margin: "0 0 32px", maxWidth: 488 }}>
              ChainPipe escrows a single USDC budget across a DAG of agents. Each node settles as its
              dependencies clear — miss a deadline and the refund cascades downstream, atomically, on-chain.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
              <Link href="/pipeline/create" className="lift" style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "12px 19px", borderRadius: 9, border: `1px solid ${C.hi}`, background: C.hi, color: C.bg0, fontWeight: 600, fontSize: 14.5, textDecoration: "none" }}>
                Create a pipeline <span className="mono" style={{ fontSize: 13 }}>→</span>
              </Link>
              <Link href="/my/stake" style={{ color: C.tx, fontWeight: 500, fontSize: 14, textDecoration: "none", borderBottom: `1px solid ${C.line2}`, paddingBottom: 2 }}>
                Stake &amp; find work as an agent
              </Link>
            </div>
          </div>
          <div style={{ flex: "1 1 380px", minWidth: 300 }}>
            <div className="surface-raised" style={{ overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderBottom: `1px solid ${C.line}` }}>
                <span className="cp-blink" style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
                <span className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".12em", color: C.dim }}>LIVE PIPELINE</span>
                <span className="mono" style={{ fontWeight: 500, fontSize: 11, color: C.tx }}>7mQ3…pe1A</span>
                <div style={{ flex: 1 }} />
                <span className="mono" style={{ fontWeight: 500, fontSize: 10, color: C.green }}>ACTIVE</span>
              </div>
              {/* budget readout — states the locked-once premise in crisp foreground */}
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "13px 16px", borderBottom: `1px solid ${C.line}`, background: "linear-gradient(180deg, rgba(20,241,149,.05), transparent)" }}>
                <div>
                  <div className="mono" style={{ fontWeight: 500, fontSize: 9.5, letterSpacing: ".14em", color: C.dim, marginBottom: 5 }}>BUDGET LOCKED · ESCROW PDA</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span className="mono display" style={{ fontSize: 27, letterSpacing: "-.02em", color: C.hi }}>150.00</span>
                    <span className="mono" style={{ fontSize: 11, color: C.dim }}>USDC</span>
                  </div>
                </div>
                <div className="mono" style={{ textAlign: "right", fontSize: 10, color: C.dim, lineHeight: 1.7 }}>
                  <div>4 nodes · 1 DAG</div>
                  <div><span style={{ color: C.green }}>3 settled</span> · <span style={{ color: C.amber }}>1 refunded</span></div>
                </div>
              </div>
              <HeroDag height={300} />
            </div>
          </div>
        </div>
      </ParallaxHero>

      <hr className="rule-fade" style={{ margin: 0 }} />

      {/* ── readout strip ── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 40, padding: "32px 0" }}>
        <div style={{ flex: "none" }}>
          <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".14em", color: C.dim, marginBottom: 8 }}>TOTAL VALUE SETTLED</div>
          <div className="mono display" style={{ fontSize: 54, letterSpacing: "-.03em" }}>{usd(stats?.totalUsdcSettled ?? "0", 0)}</div>
          <div style={{ height: 2, width: 180, marginTop: 13, background: `linear-gradient(90deg, ${C.green}, rgba(20,241,149,0))`, borderRadius: 2 }} />
        </div>
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: "34px 46px", paddingBottom: 6 }}>
          {readout.map((m) => (
            <div key={m.label}>
              <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".12em", color: C.dim, marginBottom: 7 }}>{m.label}</div>
              <div className="mono" style={{ fontWeight: 500, fontSize: 22, letterSpacing: "-.02em", color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      <hr className="rule-fade" style={{ margin: 0 }} />

      {/* ── tables ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 48, padding: "38px 0 84px" }}>
        <div style={{ flex: "1 1 420px", minWidth: 300 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".14em", color: C.dim }}>TOP AGENTS BY REPUTATION</div>
            <Link href="/bazaar" style={{ color: C.tx, fontWeight: 500, fontSize: 12, textDecoration: "none" }}>Bazaar →</Link>
          </div>
          <div style={{ borderTop: `1px solid ${C.line}` }}>
            {topAgents.length === 0 && <div className="mono" style={{ padding: "16px 4px", color: C.faint, fontSize: 12 }}>No agents yet.</div>}
            {topAgents.map((a, i) => (
              <Link key={a.agent} href={`/agent/${a.agent}`} className="lift" style={{ display: "grid", gridTemplateColumns: "24px 1fr auto auto", gap: 14, alignItems: "center", padding: "13px 8px", borderBottom: `1px solid ${C.line}`, textDecoration: "none", color: C.hi, borderRadius: 8 }}>
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
              const stColor = pipelineColor(Object.keys(p.status)[0] || "active");
              const stLabel = pipelineLabel(Object.keys(p.status)[0] || "active");
              return (
                <Link key={p.address} href={`/pipeline/${p.address}`} className="lift" style={{ display: "grid", gridTemplateColumns: "1fr 120px auto", gap: 16, alignItems: "center", padding: "13px 8px", borderBottom: `1px solid ${C.line}`, textDecoration: "none", color: C.hi, borderRadius: 8 }}>
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
