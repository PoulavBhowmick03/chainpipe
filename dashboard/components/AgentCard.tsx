import Link from "next/link";
import type { AgentRecord } from "@/lib/indexer";
import { usdc, shortKey, ema } from "@/lib/format";

export function AgentCard({ agent }: { agent: AgentRecord }) {
  const score = agent.reputation?.emaScore ?? 0;
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Link href={`/agent/${agent.agent}`} className="font-mono text-sm hover:text-accent">
          {shortKey(agent.agent, 6)}
        </Link>
        <span className="badge border-accent2/60 text-accent2">
          {agent.tier === 0 ? "Unregistered" : `Tier ${agent.tier}`}
        </span>
      </div>

      <div>
        <div className="flex justify-between text-xs text-white/60 mb-1">
          <span>Reputation (EMA)</span>
          <span>{ema(score)}/100</span>
        </div>
        <div className="h-2 bg-ink rounded-full overflow-hidden">
          <div className="h-full bg-accent" style={{ width: `${score / 100}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <div className="text-white/50 text-xs">Stake</div>
          <div>{usdc(agent.stakeAmount)}</div>
        </div>
        <div>
          <div className="text-white/50 text-xs">Settled</div>
          <div className="text-accent">{agent.reputation?.totalSettled ?? agent.totalSettled}</div>
        </div>
        <div>
          <div className="text-white/50 text-xs">Failed</div>
          <div className="text-red-300">{agent.reputation?.totalFailed ?? 0}</div>
        </div>
      </div>
    </div>
  );
}
