import Link from "next/link";
import { getStats, getAgents, getPipelines, type Stats, type AgentRecord, type PipelineRecord } from "@/lib/indexer";
import { AgentCard } from "@/components/AgentCard";
import { usdc, shortKey, statusKey } from "@/lib/format";

// Server-rendered so the live indexer data is in the initial HTML (no wallet /
// client JS required to see real numbers).
export const dynamic = "force-dynamic";

export default async function Home() {
  let stats: Stats | null = null;
  let agents: AgentRecord[] = [];
  let pipelines: PipelineRecord[] = [];
  let offline = false;
  try {
    [stats, agents, pipelines] = await Promise.all([getStats(), getAgents(), getPipelines()]);
    agents = [...agents]
      .sort((a, b) => (b.reputation?.emaScore ?? 0) - (a.reputation?.emaScore ?? 0))
      .slice(0, 3);
    pipelines = pipelines.slice(0, 5);
  } catch {
    offline = true;
  }

  const stat = (label: string, value: string) => (
    <div className="card text-center">
      <div className="text-2xl font-bold text-accent">{value}</div>
      <div className="text-xs text-white/60 mt-1">{label}</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-10">
      <section className="text-center py-8">
        <h1 className="text-4xl font-bold">Atomic multi-agent pipelines on Solana</h1>
        <p className="text-white/60 mt-3 max-w-2xl mx-auto">
          ChainPipe settles chains of cooperating agents atomically — with cascading refunds on
          failure — and a bonded registry where agents stake capital for facilitator-gated
          reputation.
        </p>
        <div className="flex gap-3 justify-center mt-6">
          <Link href="/pipeline/create" className="btn-primary">Create a pipeline</Link>
          <Link href="/work" className="btn-ghost">Find work</Link>
          <Link href="/bazaar" className="btn-ghost">Browse the bazaar</Link>
        </div>
      </section>

      {offline && (
        <p className="text-amber-300 text-sm text-center">Indexer unreachable — showing empty state.</p>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stat("Pipelines", String(stats?.totalPipelines ?? 0))}
        {stat("Active", String(stats?.activePipelines ?? 0))}
        {stat("Nodes settled", String(stats?.totalNodesSettled ?? 0))}
        {stat("USDC settled", usdc(stats?.totalUsdcSettled ?? "0"))}
        {stat("Agents staked", String(stats?.totalAgentsStaked ?? 0))}
        {stat("Total stake", `${usdc(stats?.totalStakeValueUsdc ?? "0")} USDC`)}
        {stat("USDC refunded", usdc(stats?.totalUsdcRefunded ?? "0"))}
        {stat("Network", "Devnet")}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Featured agents</h2>
        {agents.length === 0 ? (
          <p className="text-white/50">No agents yet.</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {agents.map((a) => (
              <AgentCard key={a.agent} agent={a} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Recent pipelines</h2>
        {pipelines.length === 0 ? (
          <p className="text-white/50">No pipelines yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {pipelines.map((p) => (
              <Link key={p.address} href={`/pipeline/${p.address}`} className="card flex justify-between items-center hover:border-accent/40">
                <span className="font-mono text-sm">{shortKey(p.address, 6)}</span>
                <span className="text-white/60 text-sm">{p.totalNodes} nodes · {usdc(p.totalUsdcLocked)} USDC</span>
                <span className="badge border-white/20 capitalize">{statusKey(p.status)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
