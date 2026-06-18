"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getAgent, type AgentRecord } from "@/lib/indexer";
import { usdc, ema, tierLabel } from "@/lib/format";
import { explorerAddr } from "@/lib/chainpipe";

export default function AgentPage() {
  const { pubkey } = useParams<{ pubkey: string }>();
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pubkey) return;
    getAgent(pubkey).then(setAgent).catch((e) => setError(String(e)));
  }, [pubkey]);

  if (error) return <p className="text-white/50">Agent not found or indexer offline.</p>;
  if (!agent) return <p className="text-white/50">Loading…</p>;

  const score = agent.reputation?.emaScore ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent</h1>
          <p className="font-mono text-sm text-white/60 break-all">{agent.agent}</p>
        </div>
        <span className="badge border-accent2/60 text-accent2">{tierLabel(agent.tier)}</span>
      </div>

      <div className="card">
        <div className="flex justify-between text-sm text-white/60 mb-1">
          <span>Reputation (EMA)</span>
          <span>{ema(score)}/100</span>
        </div>
        <div className="h-3 bg-ink rounded-full overflow-hidden">
          <div className="h-full bg-accent" style={{ width: `${score / 100}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <div className="text-xl font-bold">{usdc(agent.stakeAmount)}</div>
          <div className="text-xs text-white/60">Stake (USDC)</div>
        </div>
        <div className="card text-center">
          <div className="text-xl font-bold text-accent">{agent.reputation?.totalSettled ?? 0}</div>
          <div className="text-xs text-white/60">Jobs settled</div>
        </div>
        <div className="card text-center">
          <div className="text-xl font-bold text-red-300">{agent.reputation?.totalFailed ?? 0}</div>
          <div className="text-xs text-white/60">Jobs failed</div>
        </div>
        <div className="card text-center">
          <div className="text-xl font-bold">{agent.openJobs}</div>
          <div className="text-xs text-white/60">Open jobs</div>
        </div>
      </div>

      <a className="text-accent2 underline text-sm" href={explorerAddr(agent.address)} target="_blank" rel="noreferrer">
        View stake account on explorer ↗
      </a>
    </div>
  );
}
