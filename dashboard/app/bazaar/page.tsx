import { BazaarTable } from "@/components/BazaarTable";
import { getAgents, type AgentRecord } from "@/lib/indexer";

export const dynamic = "force-dynamic";

export default async function BazaarPage() {
  let agents: AgentRecord[] = [];
  try {
    agents = await getAgents();
  } catch {
    /* offline */
  }
  return (
    <div className="cp-in pt-12 pb-16 md:pb-section-gap">
      {/* hero */}
      <header className="mb-16 md:mb-section-gap">
        <h1 className="text-billboard uppercase text-ink break-words m-0">Bazaar</h1>
        <div className="masthead-rule w-full mt-8" />
        <p className="font-serif italic text-slate text-lg max-w-3xl mt-6">
          Reputation is written on-chain only by the escrow program as nodes settle. It cannot be
          forged, bought, or self-reported — every figure below is a consequence of delivered work.
        </p>
      </header>

      <BazaarTable initialAgents={agents} />
    </div>
  );
}
