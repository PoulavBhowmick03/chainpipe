"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { getPipelines, type PipelineRecord } from "@/lib/indexer";
import { usd, usdC, short, pipelineLabel } from "@/lib/theme";
import { statusKey } from "@/lib/format";
import { nodeStatuses, settledCount } from "@/lib/adapt";
import { SegBar } from "@/components/primitives";
import { NetworkPanel } from "@/components/NetworkPanel";

const num = (s: string) => Number(s) / 1e6;
const amtOf = (p: PipelineRecord, kinds: string[]) =>
  p.nodes.filter((n) => kinds.includes(statusKey(n.status))).reduce((a, n) => a + num(n.allocationUsdc), 0);

function Chip({ k }: { k: string }) {
  const alert = k === "partiallyRefunded" || k === "cancelled";
  return (
    <span
      className="mono"
      style={{
        display: "inline-block", padding: "4px 8px", fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase",
        border: `1px solid ${alert ? "#E5574E" : "#3C322D"}`, color: alert ? "#E5574E" : "#F1ECE5",
        fontWeight: alert ? 700 : 400, whiteSpace: "nowrap",
      }}
    >
      [ {pipelineLabel(k)} ]
    </span>
  );
}

export default function MyPipelinesPage() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [pipelines, setPipelines] = useState<PipelineRecord[] | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    getPipelines(`?consumer=${publicKey.toBase58()}`).then(setPipelines).catch(() => setPipelines([]));
  }, [publicKey]);

  const totalStaked = pipelines ? pipelines.reduce((a, p) => a + Number(p.totalUsdcLocked), 0) : 0;
  const activeCount = pipelines ? pipelines.filter((p) => (Object.keys(p.status)[0] || "active") === "active").length : 0;

  return (
    <div className="cp-in pt-12 pb-16 md:pb-section-gap">
      {/* hero */}
      <header className="mb-16 md:mb-20">
        <div className="masthead-rule w-full mb-4" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-billboard uppercase text-ink break-words leading-none m-0">Active Pipelines</h1>
          <Link href="/pipeline/create" className="btn-oxblood mono no-underline" style={{ padding: "11px 18px", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>+ New pipeline</Link>
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mt-8 gap-4 border-b border-mist pb-8">
          <div className="mono text-[12px] text-slate uppercase tracking-widest">01 / Pipeline Inventory</div>
          <div className="flex gap-10">
            <div className="flex flex-col text-right">
              <span className="mono text-[12px] text-slate uppercase">Total Staked Value</span>
              <span className="mono text-[14px] text-ink mt-1">{usd(totalStaked.toString(), 2)} USDC</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="mono text-[12px] text-slate uppercase">Active</span>
              <span className="mono text-[14px] text-ink mt-1">{activeCount} / {pipelines?.length ?? 0}</span>
            </div>
          </div>
        </div>
      </header>

      {!publicKey ? (
        <div>
          <div className="border border-mist p-10 text-center mb-12">
            <div className="font-serif text-[20px] text-ink mb-2">Connect a wallet</div>
            <div className="mono text-[12px] text-slate mb-6">Your pipelines appear here. Meanwhile, here&apos;s what&apos;s live across the network.</div>
            <button onClick={() => setVisible(true)} className="btn-oxblood mono" style={{ padding: "11px 18px", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase" }}>Connect wallet</button>
          </div>
          <NetworkPanel />
        </div>
      ) : !pipelines ? (
        <div className="border border-mist p-12 text-center"><span className="mono cp-blink text-[12px] text-slate">Loading your pipelines…</span></div>
      ) : pipelines.length === 0 ? (
        <div className="border border-mist p-12 text-center">
          <div className="mono text-[12px] text-slate-dim mb-4">No pipelines yet — lock a budget across a DAG of agents to begin.</div>
          <Link href="/pipeline/create" className="mono text-[12px] text-oxblood-deep underline">Create your first pipeline →</Link>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* column header */}
          <div className="hidden md:grid grid-cols-12 gap-gutter border-b border-mist pb-4 mb-2 mono text-[12px] text-slate uppercase tracking-widest">
            <div className="col-span-2">DAG Map</div>
            <div className="col-span-4">Nomenclature</div>
            <div className="col-span-2">Nodes Settled</div>
            <div className="col-span-2 text-right">Total Stake</div>
            <div className="col-span-2 text-right">Status</div>
          </div>
          {pipelines.map((p) => {
            const stKey = Object.keys(p.status)[0] || "active";
            const settledAmt = amtOf(p, ["settled"]);
            const refundAmt = amtOf(p, ["expired", "refunded"]);
            return (
              <Link key={p.address} href={`/pipeline/${p.address}`} className="grid grid-cols-1 md:grid-cols-12 gap-gutter py-6 border-b border-mist group hover:bg-paper-dim transition-colors no-underline">
                <div className="col-span-2 hidden md:flex items-center">
                  <div className="w-full border border-mist p-3 flex flex-col gap-2" style={{ background: "#17110F" }}>
                    <SegBar statuses={nodeStatuses(p)} />
                    <span className="mono text-[10px] text-slate-dim">{p.totalNodes} nodes</span>
                  </div>
                </div>
                <div className="col-span-4 flex flex-col justify-center">
                  <h2 className="font-serif text-[24px] text-ink group-hover:text-oxblood-deep transition-colors leading-tight">Pipeline {short(p.address)}</h2>
                  <p className="mono text-[12px] text-slate mt-1">
                    <span className="text-oxblood-deep">{settledAmt ? usdC((settledAmt * 1e6).toString()) : "—"}</span> settled
                    {refundAmt ? <> · <span style={{ color: "#9A6A2E" }}>{usdC((refundAmt * 1e6).toString())}</span> refunded</> : null}
                  </p>
                </div>
                <div className="col-span-2 flex flex-col justify-center">
                  <span className="mono text-[12px] text-slate md:hidden mb-1 uppercase">Nodes Settled</span>
                  <span className="mono text-[14px] text-ink">{settledCount(p)} / {p.totalNodes}</span>
                </div>
                <div className="col-span-2 flex flex-col justify-center text-left md:text-right">
                  <span className="mono text-[12px] text-slate md:hidden mb-1 uppercase">Total Stake</span>
                  <span className="mono text-[14px] text-ink">{usd(p.totalUsdcLocked, 2)}</span>
                </div>
                <div className="col-span-2 flex flex-col justify-center items-start md:items-end">
                  <span className="mono text-[12px] text-slate md:hidden mb-1 uppercase">Status</span>
                  <Chip k={stKey} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
