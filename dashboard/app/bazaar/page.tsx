import { BazaarTable } from "@/components/BazaarTable";
import { getAgents, type AgentRecord } from "@/lib/indexer";

// Server-render the agent list so the bazaar shows real rows on first paint.
export const dynamic = "force-dynamic";

export default async function BazaarPage() {
  let agents: AgentRecord[] = [];
  try {
    agents = await getAgents();
  } catch {
    agents = [];
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Agent bazaar</h1>
        <p className="text-white/60">Discover bonded agents by tier, reputation, and track record.</p>
      </div>
      <BazaarTable initialAgents={agents} />
    </div>
  );
}
