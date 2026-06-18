import { Connection, PublicKey } from "@solana/web3.js";
import type { ChainPipeAddresses } from "./addresses";
import { loadPrograms } from "./programs";
import { reputationPda } from "./pdas";
import type { AgentStake } from "./stake";
import type { AgentReputation } from "./reputation";
import type { Pipeline } from "./pipeline";

export type AgentWithReputation = AgentStake & {
  address: PublicKey;
  reputation: AgentReputation | null;
};

/** All registered agents (any tier >= 1) with their reputation. */
export async function getRegisteredAgents(
  connection: Connection,
  addresses: ChainPipeAddresses
): Promise<AgentWithReputation[]> {
  return getAgentsByTier(connection, 1, addresses);
}

/** Agents at or above `minTier`, joined with their reputation record. */
export async function getAgentsByTier(
  connection: Connection,
  minTier: number,
  addresses: ChainPipeAddresses
): Promise<AgentWithReputation[]> {
  const { bonded, rep } = loadPrograms(connection, addresses);
  const stakes = await bonded.account.agentStake.all();
  const out: AgentWithReputation[] = [];
  for (const s of stakes) {
    if (s.account.tier < minTier) continue;
    const reputation = await rep.account.agentReputation.fetchNullable(
      reputationPda(addresses, s.account.agent)
    );
    out.push({ ...s.account, address: s.publicKey, reputation });
  }
  return out;
}

export type PipelineWithAddress = Pipeline & { address: PublicKey };

/** Pipelines created by a given consumer. */
export async function getPipelinesByConsumer(
  connection: Connection,
  consumer: PublicKey,
  addresses: ChainPipeAddresses
): Promise<PipelineWithAddress[]> {
  const { dag } = loadPrograms(connection, addresses);
  const all = await dag.account.pipeline.all([
    { memcmp: { offset: 8, bytes: consumer.toBase58() } },
  ]);
  return all.map((p) => ({ ...p.account, address: p.publicKey }));
}
