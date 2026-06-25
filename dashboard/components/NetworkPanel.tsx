"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStats, getPipelines, getAgents, type Stats, type PipelineRecord, type AgentRecord } from "@/lib/indexer";
import { C, usd, usdC, short, tapeSeq } from "@/lib/theme";
import { pipelineColor, pipelineLabel } from "@/lib/theme";
import { agentTitle, nodeStatuses } from "@/lib/adapt";
import { SegBar, OutcomeTape, TierBadge } from "@/components/primitives";

/**
 * Live read-only "control room" of real network activity — used to anchor sparse /
 * disconnected pages with genuine on-chain data instead of dead black space.
 */
export function NetworkPanel({ title = "LIVE ON THE NETWORK", mt = 26 }: { title?: string; mt?: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pipes, setPipes] = useState<PipelineRecord[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
    getPipelines().then((p) => setPipes(p.slice(0, 4))).catch(() => {});
    getAgents().then((a) => setAgents([...a].filter((x) => x.reputation).sort((x, y) => y.reputation!.emaScore - x.reputation!.emaScore).slice(0, 4))).catch(() => {});
  }, []);

  const readout = [
    { label: "SETTLED", value: usd(stats?.totalUsdcSettled ?? "0", 0), color: C.green },
    { label: "PIPELINES", value: String(stats?.totalPipelines ?? 0), color: C.hi },
    { label: "AGENTS", value: String(stats?.totalAgentsStaked ?? 0), color: C.hi },
    { label: "STAKED", value: usdC(stats?.totalStakeValueUsdc ?? "0"), color: C.tx },
  ];

  return (
    <div style={{ marginTop: mt }}>
      <div className="mono" style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 500, fontSize: 10, letterSpacing: ".14em", color: C.dim, marginBottom: 14 }}>
        <span className="cp-blink" style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />{title}
      </div>
      <div className="surface" style={{ display: "flex", flexWrap: "wrap", padding: 0, overflow: "hidden", marginBottom: 14 }}>
        {readout.map((m, i) => (
          <div key={m.label} style={{ flex: "1 1 120px", padding: "14px 16px", borderRight: i < readout.length - 1 ? `1px solid ${C.line}` : "none" }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: ".1em", color: C.dim, marginBottom: 6 }}>{m.label}</div>
            <div className="mono" style={{ fontWeight: 600, fontSize: 20, letterSpacing: "-.02em", color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <div className="surface scroll-x" style={{ flex: "1 1 320px", minWidth: 280, padding: 0, overflow: "hidden" }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".1em", color: C.dim, padding: "11px 14px", borderBottom: `1px solid ${C.line}` }}>RECENT PIPELINES</div>
          {pipes.length === 0 && <div className="mono" style={{ padding: 14, fontSize: 11, color: C.faint }}>—</div>}
          {pipes.map((p) => {
            const k = Object.keys(p.status)[0] || "active";
            return (
              <Link key={p.address} href={`/pipeline/${p.address}`} className="lift" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "11px 14px", borderBottom: `1px solid ${C.line}`, textDecoration: "none", color: C.hi }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 1, background: pipelineColor(k) }} />
                    <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: pipelineColor(k) }}>{pipelineLabel(k)}</span>
                    <span className="mono" style={{ fontSize: 11, color: C.tx }}>{short(p.address)}</span>
                  </div>
                  <SegBar statuses={nodeStatuses(p)} />
                </div>
                <span className="mono" style={{ fontSize: 13, fontWeight: 500, textAlign: "right" }}>{usd(p.totalUsdcLocked, 2)}</span>
              </Link>
            );
          })}
        </div>
        <div className="surface" style={{ flex: "1 1 320px", minWidth: 280, padding: 0, overflow: "hidden" }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".1em", color: C.dim, padding: "11px 14px", borderBottom: `1px solid ${C.line}` }}>TOP AGENTS</div>
          {agents.length === 0 && <div className="mono" style={{ padding: 14, fontSize: 11, color: C.faint }}>—</div>}
          {agents.map((a) => (
            <Link key={a.agent} href={`/agent/${a.agent}`} className="lift" style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center", padding: "11px 14px", borderBottom: `1px solid ${C.line}`, textDecoration: "none", color: C.hi }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{agentTitle(a)}</div>
                <div className="mono" style={{ fontSize: 10, color: C.dim }}>{short(a.agent)}</div>
              </div>
              <OutcomeTape seq={tapeSeq(a.reputation?.totalSettled ?? 0, a.reputation?.totalFailed ?? 0, 14)} width={64} height={12} />
              <TierBadge tier={a.tier} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
