"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getPipeline, type PipelineRecord } from "@/lib/indexer";
import { usdc, shortKey, statusKey } from "@/lib/format";
import { NodeStatusBadge } from "@/components/NodeStatusBadge";
import { DagGraph } from "@/components/DagGraph";
import { explorerAddr } from "@/lib/chainpipe";

export default function PipelinePage() {
  const { pda } = useParams<{ pda: string }>();
  const [pipeline, setPipeline] = useState<PipelineRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pda) return;
    getPipeline(pda).then(setPipeline).catch((e) => setError(String(e)));
  }, [pda]);

  if (error) return <p className="text-white/50">Pipeline not found or indexer offline.</p>;
  if (!pipeline) return <p className="text-white/50">Loading…</p>;

  const depList = (mask: string) => {
    const m = BigInt(mask);
    const deps: number[] = [];
    for (let i = 0; i < 16; i++) if ((m >> BigInt(i)) & 1n) deps.push(i);
    return deps;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipeline</h1>
          <p className="font-mono text-sm text-white/60 break-all">{pipeline.address}</p>
        </div>
        <span className="badge border-white/20 capitalize">{statusKey(pipeline.status)}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <div className="text-xl font-bold">{usdc(pipeline.totalUsdcLocked)}</div>
          <div className="text-xs text-white/60">USDC locked</div>
        </div>
        <div className="card text-center">
          <div className="text-xl font-bold">{pipeline.totalNodes}</div>
          <div className="text-xs text-white/60">Nodes</div>
        </div>
        <div className="card text-center">
          <div className="text-xl font-bold text-accent">{pipeline.nodesSettled}</div>
          <div className="text-xs text-white/60">Settled</div>
        </div>
        <div className="card text-center">
          <div className="text-xl font-bold text-red-300">{pipeline.nodesExpired}</div>
          <div className="text-xs text-white/60">Expired</div>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">DAG</h2>
        <div className="mb-4">
          <DagGraph nodes={pipeline.nodes} />
        </div>
        <div className="flex flex-col gap-3">
          {pipeline.nodes.map((n) => {
            const deps = depList(n.dependencyMask);
            return (
              <div key={n.nodeIndex} className="card flex flex-wrap items-center gap-4">
                <span className="font-semibold">Node {n.nodeIndex}</span>
                <NodeStatusBadge status={statusKey(n.status)} />
                <span className="text-white/70 text-sm">{usdc(n.allocationUsdc)} USDC</span>
                <span className="text-white/50 text-sm">
                  {deps.length ? `depends on ${deps.map((d) => `#${d}`).join(", ")}` : "no deps"}
                </span>
                {n.agent && n.agent !== "11111111111111111111111111111111" && (
                  <span className="font-mono text-xs text-white/60">{shortKey(n.agent, 4)}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <a className="text-accent2 underline text-sm" href={explorerAddr(pipeline.address)} target="_blank" rel="noreferrer">
        View pipeline account on explorer ↗
      </a>
    </div>
  );
}
