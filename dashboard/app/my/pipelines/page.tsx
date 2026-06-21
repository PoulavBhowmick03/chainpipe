"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { getPipelines, type PipelineRecord } from "@/lib/indexer";
import { C, usd, usdC, short, pipelineColor, pipelineLabel } from "@/lib/theme";
import { statusKey } from "@/lib/format";
import { nodeStatuses, settledCount } from "@/lib/adapt";
import { SegBar, StatStrip } from "@/components/primitives";
import { NetworkPanel } from "@/components/NetworkPanel";

const num = (s: string) => Number(s) / 1e6;
const amtOf = (p: PipelineRecord, kinds: string[]) =>
  p.nodes.filter((n) => kinds.includes(statusKey(n.status))).reduce((a, n) => a + num(n.allocationUsdc), 0);

export default function MyPipelinesPage() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [pipelines, setPipelines] = useState<PipelineRecord[] | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    getPipelines(`?consumer=${publicKey.toBase58()}`).then(setPipelines).catch(() => setPipelines([]));
  }, [publicKey]);

  const summary = pipelines && pipelines.length > 0 ? [
    { label: "PIPELINES", value: String(pipelines.length) },
    { label: "ACTIVE", value: String(pipelines.filter((p) => (Object.keys(p.status)[0] || "active") === "active").length), color: C.green },
    { label: "LOCKED", value: usdC(pipelines.reduce((a, p) => a + Number(p.totalUsdcLocked), 0).toString()) },
    { label: "SETTLED", value: usdC((pipelines.reduce((a, p) => a + amtOf(p, ["settled"]), 0) * 1e6).toString()), color: C.green },
  ] : null;

  return (
    <div className="cp-in" style={{ padding: "28px 0 80px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 24 }}>
        <div>
          <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".14em", color: C.dim, marginBottom: 6 }}>/my/pipelines</div>
          <h1 className="display" style={{ fontSize: 24, margin: 0 }}>My pipelines</h1>
        </div>
        <Link href="/pipeline/create" className="lift" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 7, border: `1px solid ${C.hi}`, background: C.hi, color: C.bg0, fontWeight: 600, fontSize: 13, textDecoration: "none" }}><span className="mono" style={{ color: C.green }}>+</span> New pipeline</Link>
      </div>

      {summary && (
        <div className="surface" style={{ padding: "16px 0", marginBottom: 18 }}>
          <StatStrip items={summary} />
        </div>
      )}

      {!publicKey ? (
        <div>
          <div className="surface" style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 6 }}>Connect a wallet</div>
            <div className="mono" style={{ fontSize: 12, color: C.dim, marginBottom: 20 }}>Your pipelines appear here. Meanwhile, here&apos;s what&apos;s live across the network.</div>
            <button onClick={() => setVisible(true)} className="lift" style={{ padding: "9px 16px", borderRadius: 7, border: `1px solid ${C.hi}`, background: C.hi, color: C.bg0, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Connect wallet</button>
          </div>
          <NetworkPanel />
        </div>
      ) : !pipelines ? (
        <div className="surface" style={{ padding: 40, textAlign: "center" }}><span className="mono cp-blink" style={{ color: C.dim, fontSize: 12 }}>Loading your pipelines…</span></div>
      ) : pipelines.length === 0 ? (
        <div className="surface" style={{ padding: 44, textAlign: "center" }}>
          <div className="mono" style={{ color: C.faint, fontSize: 12, marginBottom: 16 }}>No pipelines yet — lock a budget across a DAG of agents to begin.</div>
          <Link href="/pipeline/create" className="mono" style={{ color: C.green, fontSize: 12, textDecoration: "none" }}>Create your first pipeline →</Link>
        </div>
      ) : (
        <div className="surface scroll-x" style={{ padding: 0 }}>
          {pipelines.map((p) => {
            const stKey = Object.keys(p.status)[0] || "active";
            const settledAmt = amtOf(p, ["settled"]);
            const refundAmt = amtOf(p, ["expired", "refunded"]);
            return (
              <Link key={p.address} href={`/pipeline/${p.address}`} className="lift" style={{ display: "grid", gridTemplateColumns: "140px 1fr 116px 150px 120px", gap: 18, alignItems: "center", padding: "15px 16px", borderBottom: `1px solid #14181f`, textDecoration: "none", color: C.hi, minWidth: 700 }}>
                <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 500, fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color: pipelineColor(stKey) }}>
                  <span style={{ width: 6, height: 6, borderRadius: 1, background: pipelineColor(stKey), boxShadow: `0 0 6px ${pipelineColor(stKey)}88` }} />{pipelineLabel(stKey)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 13, color: C.tx, marginBottom: 8 }}>{short(p.address)}</div>
                  <SegBar statuses={nodeStatuses(p)} />
                </div>
                <span className="mono" style={{ fontSize: 11, color: C.dim }}>{settledCount(p)}/{p.totalNodes} settled</span>
                <span className="mono" style={{ fontSize: 12, textAlign: "right" }}>
                  <span style={{ color: C.green }}>{settledAmt ? usdC((settledAmt * 1e6).toString()) : "—"}</span>
                  <span style={{ color: C.faint }}> · </span>
                  <span style={{ color: refundAmt ? C.amber : C.faint }}>{refundAmt ? usdC((refundAmt * 1e6).toString()) : "—"}</span>
                </span>
                <span className="mono" style={{ fontWeight: 500, fontSize: 15, textAlign: "right" }}>{usd(p.totalUsdcLocked, 2)}</span>
              </Link>
            );
          })}
          <div className="mono" style={{ display: "grid", gridTemplateColumns: "140px 1fr 116px 150px 120px", gap: 18, padding: "8px 16px", fontSize: 9, letterSpacing: ".08em", color: C.faint, borderTop: `1px solid ${C.line}`, minWidth: 700 }}>
            <span>STATUS</span><span>PIPELINE · HEALTH</span><span>NODES</span><span style={{ textAlign: "right" }}>SETTLED · REFUNDED</span><span style={{ textAlign: "right" }}>LOCKED</span>
          </div>
        </div>
      )}
    </div>
  );
}
