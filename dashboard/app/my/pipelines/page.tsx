"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { getPipelines, type PipelineRecord } from "@/lib/indexer";
import { C, usd, short, pipelineColor, pipelineLabel } from "@/lib/theme";
import { nodeStatuses, settledCount } from "@/lib/adapt";
import { SegBar } from "@/components/primitives";

export default function MyPipelinesPage() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [pipelines, setPipelines] = useState<PipelineRecord[] | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    getPipelines(`?consumer=${publicKey.toBase58()}`).then(setPipelines).catch(() => setPipelines([]));
  }, [publicKey]);

  return (
    <div className="cp-in" style={{ padding: "28px 0 80px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 24 }}>
        <div>
          <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".14em", color: C.dim, marginBottom: 6 }}>/my/pipelines</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>My pipelines</h1>
        </div>
        <Link href="/pipeline/create" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 7, border: `1px solid ${C.hi}`, background: C.hi, color: C.bg0, fontWeight: 600, fontSize: 13, textDecoration: "none" }}><span className="mono">+</span> New pipeline</Link>
      </div>

      {!publicKey ? (
        <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: 54, textAlign: "center" }}>
          <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 6 }}>Connect a wallet</div>
          <div className="mono" style={{ fontSize: 12, color: C.dim, marginBottom: 20 }}>Pipelines you&apos;ve created appear here.</div>
          <button onClick={() => setVisible(true)} style={{ padding: "9px 16px", borderRadius: 7, border: `1px solid ${C.hi}`, background: C.hi, color: C.bg0, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Connect wallet</button>
        </div>
      ) : !pipelines ? (
        <p className="mono" style={{ color: C.dim }}>Loading…</p>
      ) : pipelines.length === 0 ? (
        <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: 40, textAlign: "center" }} className="mono"><span style={{ color: C.faint, fontSize: 12 }}>No pipelines yet.</span></div>
      ) : (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
          {pipelines.map((p) => {
            const stKey = Object.keys(p.status)[0] || "active";
            return (
              <Link key={p.address} href={`/pipeline/${p.address}`} style={{ display: "grid", gridTemplateColumns: "150px 1fr 130px 110px", gap: 18, alignItems: "center", padding: 16, borderBottom: `1px solid #14181f`, textDecoration: "none", color: C.hi }}>
                <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 500, fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color: pipelineColor(stKey) }}>
                  <span style={{ width: 6, height: 6, borderRadius: 1, background: pipelineColor(stKey) }} />{pipelineLabel(stKey)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 13, color: C.tx, marginBottom: 8 }}>{short(p.address)}</div>
                  <SegBar statuses={nodeStatuses(p)} />
                </div>
                <span className="mono" style={{ fontSize: 11, color: C.dim }}>{settledCount(p)}/{p.totalNodes} settled</span>
                <span className="mono" style={{ fontWeight: 500, fontSize: 15, textAlign: "right" }}>{usd(p.totalUsdcLocked, 2)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
