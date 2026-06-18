"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { getPipelines, type PipelineRecord } from "@/lib/indexer";
import { usdc, shortKey, statusKey } from "@/lib/format";

export default function MyPipelinesPage() {
  const { publicKey } = useWallet();
  const [pipelines, setPipelines] = useState<PipelineRecord[] | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    getPipelines(`?consumer=${publicKey.toBase58()}`)
      .then(setPipelines)
      .catch(() => setPipelines([]));
  }, [publicKey]);

  if (!publicKey) return <p className="text-white/60">Connect your wallet to see your pipelines.</p>;
  if (!pipelines) return <p className="text-white/50">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">My pipelines</h1>
      {pipelines.length === 0 ? (
        <p className="text-white/50">
          No pipelines yet. <Link href="/pipeline/create" className="text-accent underline">Create one</Link>.
        </p>
      ) : (
        pipelines.map((p) => (
          <Link key={p.address} href={`/pipeline/${p.address}`} className="card flex justify-between items-center hover:border-accent/40">
            <span className="font-mono text-sm">{shortKey(p.address, 6)}</span>
            <span className="text-white/60 text-sm">{p.totalNodes} nodes · {usdc(p.totalUsdcLocked)} USDC</span>
            <span className="badge border-white/20 capitalize">{statusKey(p.status)}</span>
          </Link>
        ))
      )}
    </div>
  );
}
