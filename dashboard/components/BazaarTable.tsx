"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAgents, type AgentRecord } from "@/lib/indexer";
import { C, usdC, short, tapeSeq } from "@/lib/theme";
import { repScore, agentTitle } from "@/lib/adapt";
import { TierBadge, OutcomeTape } from "@/components/primitives";

type SortKey = "rep" | "stake" | "jobs";
const GRID = "1.7fr 96px 1.5fr 110px 70px 96px";

export function BazaarTable({ initialAgents }: { initialAgents?: AgentRecord[] }) {
  const [agents, setAgents] = useState<AgentRecord[] | null>(initialAgents ?? null);
  const [tier, setTier] = useState(0);
  const [minRep, setMinRep] = useState(0);
  const [sort, setSort] = useState<SortKey>("rep");
  const [dir, setDir] = useState(-1);

  useEffect(() => {
    getAgents().then(setAgents).catch(() => setAgents(initialAgents ?? []));
  }, [initialAgents]);

  const rows = useMemo(() => {
    const list = (agents ?? []).filter((a) => a.reputation).filter((a) => (tier === 0 || a.tier === tier) && (a.reputation!.emaScore / 100) >= minRep);
    const key = (a: AgentRecord) => (sort === "rep" ? a.reputation!.emaScore : sort === "stake" ? Number(a.stakeAmount) : a.reputation!.totalSettled);
    return list.sort((a, b) => (key(a) - key(b)) * dir);
  }, [agents, tier, minRep, sort, dir]);

  const setSortKey = (k: SortKey) => { if (sort === k) setDir(-dir); else { setSort(k); setDir(-1); } };
  const arrow = (k: SortKey) => (sort === k ? (dir < 0 ? " ↓" : " ↑") : "");
  const hdr = (k: SortKey, align: "left" | "right") => ({ textAlign: align, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-geist-mono)", fontWeight: 500, fontSize: 10, letterSpacing: ".08em", color: sort === k ? C.hi : C.dim } as React.CSSProperties);

  const tierBtn = (v: number, l: string) => (
    <button key={v} onClick={() => setTier(v)} className="mono" style={{ padding: "5px 11px", borderRadius: 6, fontWeight: 500, fontSize: 12, cursor: "pointer", border: `1px solid ${tier === v ? C.line2 : C.line}`, background: tier === v ? C.raised : "transparent", color: tier === v ? C.hi : C.dim }}>{l}</button>
  );

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", padding: "14px 16px", border: `1px solid ${C.line}`, borderRadius: 9, background: C.bg, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".1em", color: C.dim }}>TIER</span>
          <div style={{ display: "flex", gap: 4 }}>{[[0, "All"], [1, "T1"], [2, "T2"], [3, "T3"]].map(([v, l]) => tierBtn(v as number, l as string))}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 220 }}>
          <span className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".1em", color: C.dim, whiteSpace: "nowrap" }}>MIN REP</span>
          <input type="range" min={0} max={100} value={minRep} onChange={(e) => setMinRep(Number(e.target.value))} style={{ flex: 1 }} />
          <span className="mono" style={{ fontWeight: 500, fontSize: 13, width: 26 }}>{minRep}</span>
        </div>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 12, color: C.dim }}>{rows.length} agents</span>
      </div>

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 9, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 14, padding: "11px 16px", borderBottom: `1px solid ${C.line}`, background: C.bg }}>
          <span className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".08em", color: C.dim }}>AGENT</span>
          <span className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".08em", color: C.dim }}>TIER</span>
          <button onClick={() => setSortKey("rep")} style={hdr("rep", "left")}>REPUTATION{arrow("rep")}</button>
          <button onClick={() => setSortKey("stake")} style={hdr("stake", "right")}>STAKE{arrow("stake")}</button>
          <button onClick={() => setSortKey("jobs")} style={hdr("jobs", "right")}>JOBS{arrow("jobs")}</button>
          <span className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".08em", color: C.dim, textAlign: "right" }}>RECORD</span>
        </div>
        {!agents && <div className="mono" style={{ padding: 20, color: C.dim, fontSize: 12 }}>Loading…</div>}
        {agents && rows.length === 0 && <div className="mono" style={{ padding: 20, color: C.faint, fontSize: 12 }}>No agents match.</div>}
        {rows.map((a) => (
          <Link key={a.agent} href={`/agent/${a.agent}`} style={{ display: "grid", gridTemplateColumns: GRID, gap: 14, alignItems: "center", padding: "14px 16px", borderBottom: `1px solid #14181f`, textDecoration: "none", color: C.hi }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
              <span className="mono" style={{ width: 32, height: 32, border: `1px solid ${C.line2}`, borderRadius: 6, background: C.panel, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 13, color: C.tx, flex: "none" }}>{agentTitle(a)[0]?.toUpperCase()}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{agentTitle(a)}</div>
                <div className="mono" style={{ fontSize: 11, color: C.dim, lineHeight: 1.25 }}>{short(a.agent)}</div>
              </div>
            </div>
            <TierBadge tier={a.tier} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="mono" style={{ fontWeight: 500, fontSize: 17, width: 48 }}>{repScore(a)}</span>
              <OutcomeTape seq={tapeSeq(a.reputation?.totalSettled ?? 0, a.reputation?.totalFailed ?? 0, 20)} width={84} height={14} />
            </div>
            <span className="mono" style={{ fontWeight: 500, fontSize: 14, textAlign: "right" }}>{usdC(a.stakeAmount)}</span>
            <span className="mono" style={{ fontSize: 13, textAlign: "right", color: C.tx }}>{a.openJobs}</span>
            <span className="mono" style={{ fontSize: 12, textAlign: "right" }}>
              <span style={{ color: C.green }}>{a.reputation?.totalSettled ?? 0}</span>
              <span style={{ color: C.faint }}> / </span>
              <span style={{ color: (a.reputation?.totalFailed ?? 0) > 20 ? C.red : C.dim }}>{a.reputation?.totalFailed ?? 0}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
