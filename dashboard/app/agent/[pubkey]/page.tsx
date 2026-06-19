"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getAgent, type AgentRecord } from "@/lib/indexer";
import { C, usdC, short, tapeSeq } from "@/lib/theme";
import { agentTitle } from "@/lib/adapt";
import { explorerAddr } from "@/lib/chainpipe";
import { TierBadge, OutcomeTape, Gauge } from "@/components/primitives";

export default function AgentPage() {
  const { pubkey } = useParams<{ pubkey: string }>();
  const [a, setA] = useState<AgentRecord | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!pubkey) return;
    getAgent(pubkey).then(setA).catch(() => setErr(true));
  }, [pubkey]);

  if (err) return <p className="mono" style={{ color: C.dim, padding: "28px 0" }}>Agent not found or indexer offline.</p>;
  if (!a) return <p className="mono" style={{ color: C.dim, padding: "28px 0" }}>Loading…</p>;

  const score = a.reputation ? a.reputation.emaScore / 100 : 0;
  const settled = a.reputation?.totalSettled ?? 0;
  const failed = a.reputation?.totalFailed ?? 0;
  const stats = [
    { label: "STAKE", value: usdC(a.stakeAmount), color: C.hi },
    { label: "SETTLED", value: String(settled), color: C.green },
    { label: "FAILED", value: String(failed), color: C.red },
    { label: "SLASHED", value: String(a.totalSlashed ?? 0), color: C.amber },
  ];

  return (
    <div className="cp-in" style={{ padding: "28px 0 80px" }}>
      <Link href="/bazaar" className="mono" style={{ color: C.dim, fontWeight: 500, fontSize: 12, textDecoration: "none", display: "inline-block", marginBottom: 22 }}>← bazaar</Link>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 30 }}>
        <span className="mono" style={{ width: 50, height: 50, border: `1px solid ${C.line2}`, borderRadius: 9, background: C.panel, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 19, color: C.hi, flex: "none" }}>{agentTitle(a)[0]?.toUpperCase()}</span>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 21, fontWeight: 600, margin: 0 }}>{agentTitle(a)}</h1>
            <TierBadge tier={a.tier} />
          </div>
          <div className="mono" style={{ fontSize: 12, color: C.dim, marginTop: 4, wordBreak: "break-all" }}>{a.agent}</div>
        </div>
        <div style={{ flex: 1 }} />
        <a href={explorerAddr(a.address)} target="_blank" rel="noreferrer" className="mono" style={{ padding: "8px 13px", borderRadius: 7, border: `1px solid ${C.line}`, background: C.bg, color: C.tx, fontWeight: 500, fontSize: 12, textDecoration: "none" }}>explorer ↗</a>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "stretch" }}>
        <div style={{ flex: "1 1 380px", minWidth: 300, border: `1px solid ${C.line}`, borderRadius: 10, padding: 22 }}>
          <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".14em", color: C.dim, marginBottom: 14 }}>TRUST SCORE · EMA</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 18, marginBottom: 20 }}>
            <div className="mono" style={{ fontWeight: 600, fontSize: 60, letterSpacing: "-.03em", lineHeight: 0.9 }}>{a.reputation ? score.toFixed(1) : "—"}</div>
            <div style={{ paddingBottom: 8 }} className="mono"><div style={{ fontSize: 12, color: C.dim }}>of 100</div></div>
          </div>
          <Gauge score={score} />
          <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".14em", color: C.dim, margin: "26px 0 12px" }}>OUTCOME TAPE · LAST 28 JOBS</div>
          <OutcomeTape seq={tapeSeq(settled, failed, 28)} width="100%" height={26} />
          <div className="mono" style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 11 }}>
            <span style={{ color: C.green }}>■ {settled} settled</span>
            <span style={{ color: C.red }}>■ {failed} failed</span>
          </div>
        </div>

        <div style={{ flex: "1 1 280px", minWidth: 260, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
            {stats.map((s) => (
              <div key={s.label} style={{ padding: 16, borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
                <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".1em", color: C.dim, marginBottom: 7 }}>{s.label}</div>
                <div className="mono" style={{ fontWeight: 500, fontSize: 19, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 10, padding: 16 }}>
            <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".1em", color: C.dim, marginBottom: 12 }}>OPEN JOBS · {a.openJobs}</div>
            <div className="mono" style={{ fontSize: 12, color: C.faint }}>{a.openJobs === 0 ? "No open jobs." : `${a.openJobs} node(s) in progress.`}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
