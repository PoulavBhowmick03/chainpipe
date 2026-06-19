"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getPipeline, type PipelineRecord } from "@/lib/indexer";
import { statusKey } from "@/lib/format";
import { C, usd, short, statusColor, pipelineColor, pipelineLabel } from "@/lib/theme";
import { toDagNodes } from "@/lib/adapt";
import { explorerAddr } from "@/lib/chainpipe";
import { DagCanvas } from "@/components/DagCanvas";
import { StatusTag } from "@/components/primitives";

export default function PipelinePage() {
  const { pda } = useParams<{ pda: string }>();
  const [p, setP] = useState<PipelineRecord | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!pda) return;
    getPipeline(pda).then(setP).catch(() => setErr(true));
  }, [pda]);

  if (err) return <p className="mono" style={{ color: C.dim, padding: "28px 0" }}>Pipeline not found or indexer offline.</p>;
  if (!p) return <p className="mono" style={{ color: C.dim, padding: "28px 0" }}>Loading…</p>;

  const stKey = Object.keys(p.status)[0] || "active";
  const num = (s: string) => Number(s) / 1e6;
  const settledAmt = p.nodes.filter((n) => statusKey(n.status) === "settled").reduce((a, n) => a + num(n.allocationUsdc), 0);
  const refundAmt = p.nodes.filter((n) => ["expired", "refunded"].includes(statusKey(n.status))).reduce((a, n) => a + num(n.allocationUsdc), 0);
  const inEscrow = num(p.totalUsdcLocked) - settledAmt - refundAmt;
  const resolved = p.nodes.every((n) => ["settled", "expired", "refunded"].includes(statusKey(n.status)));
  const fmt = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const vault = [
    { label: "IN ESCROW", value: fmt(inEscrow), color: C.dim },
    { label: "SETTLED", value: fmt(settledAmt), color: C.green },
    { label: "REFUNDED", value: fmt(refundAmt), color: C.amber },
  ];

  return (
    <div className="cp-in" style={{ padding: "28px 0 80px" }}>
      <Link href="/my/pipelines" className="mono" style={{ color: C.dim, fontWeight: 500, fontSize: 12, textDecoration: "none", display: "inline-block", marginBottom: 18 }}>← pipelines</Link>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginBottom: 6 }}>
        <StatusTag status={stKey === "active" ? "claimed" : stKey === "completed" ? "settled" : stKey === "partiallyRefunded" ? "refunded" : "pending"} label={pipelineLabel(stKey)} />
        <h1 className="mono" style={{ fontWeight: 600, fontSize: 19, margin: 0, letterSpacing: "-.01em" }}>{short(p.address)}</h1>
        <a href={explorerAddr(p.address)} target="_blank" rel="noreferrer" className="mono" style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.line}`, background: C.bg, color: C.tx, fontWeight: 500, fontSize: 11, textDecoration: "none" }}>explorer ↗</a>
      </div>
      <div className="mono" style={{ fontSize: 12, color: C.faint, marginBottom: 22 }}>consumer {short(p.consumer)} · nonce {p.nonce}</div>

      <div style={{ display: "flex", flexWrap: "wrap", border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ flex: "1 1 200px", padding: 18, borderRight: `1px solid ${C.line}` }}>
          <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".12em", color: C.dim, marginBottom: 9 }}>TOTAL LOCKED</div>
          <div className="mono" style={{ fontWeight: 600, fontSize: 30, letterSpacing: "-.02em" }}>{usd(p.totalUsdcLocked, 2)}</div>
        </div>
        {vault.map((v) => (
          <div key={v.label} style={{ flex: "1 1 130px", padding: 18, borderRight: `1px solid ${C.line}` }}>
            <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".1em", color: C.dim, marginBottom: 9 }}>{v.label}</div>
            <div className="mono" style={{ fontWeight: 500, fontSize: 22, color: v.color }}>{v.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "stretch" }}>
        <div style={{ flex: "3 1 460px", minWidth: 300, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 14px", borderBottom: `1px solid ${C.line}`, background: C.bg, flexWrap: "wrap" }}>
            <span className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".1em", color: C.dim }}>DEPENDENCY GRAPH</span>
            <div style={{ flex: 1 }} />
            <div className="mono" style={{ display: "flex", gap: 13, fontSize: 10, color: C.dim }}>
              {[["pending", C.dim], ["claimed", C.blue], ["settled", C.green], ["expired", C.red]].map(([l, c]) => (
                <span key={l as string} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 1, background: c as string }} />{l}</span>
              ))}
            </div>
          </div>
          <DagCanvas nodes={toDagNodes(p.nodes)} height={300} />
        </div>

        <div style={{ flex: "1 1 300px", minWidth: 280, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ border: `1px solid #2a2018`, borderRadius: 10, padding: 15, background: "#120d07" }}>
            <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".1em", color: C.amber, marginBottom: 8 }}>CASCADE REFUND</div>
            <div style={{ fontSize: 12, color: C.tx, lineHeight: 1.55 }}>
              {resolved ? "All nodes resolved. The escrow is fully settled or refunded." : "If a claimed or pending node misses its deadline, anyone can expire it — the refund cascades atomically to every downstream node and back to the consumer."}
            </div>
          </div>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
            {p.nodes.map((n) => {
              const st = statusKey(n.status);
              const assigned = n.agent && n.agent !== "11111111111111111111111111111111";
              return (
                <div key={n.nodeIndex} style={{ padding: "13px 15px", borderBottom: `1px solid #14181f`, borderLeft: `2px solid ${statusColor(st)}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>N{n.nodeIndex} · node {n.nodeIndex}</span>
                    <span className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color: statusColor(st) }}>{st}</span>
                  </div>
                  <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.dim }}>
                    <span>{assigned ? short(n.agent) : "unassigned"}</span>
                    <span><span style={{ color: C.tx }}>{usd(n.allocationUsdc, 0)}</span> · T{n.requiredTier}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
