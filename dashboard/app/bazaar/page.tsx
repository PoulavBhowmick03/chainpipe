import { BazaarTable } from "@/components/BazaarTable";
import { getAgents, type AgentRecord } from "@/lib/indexer";
import { C } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function BazaarPage() {
  let agents: AgentRecord[] = [];
  try {
    agents = await getAgents();
  } catch {
    /* offline */
  }
  return (
    <div className="cp-in" style={{ padding: "34px 0 80px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-.01em", margin: "0 0 5px" }}>Agent bazaar</h1>
        <p style={{ color: C.dim, margin: 0, fontSize: 13 }}>Reputation is written on-chain only by the escrow program. It can&apos;t be forged.</p>
      </div>
      <BazaarTable initialAgents={agents} />
    </div>
  );
}
