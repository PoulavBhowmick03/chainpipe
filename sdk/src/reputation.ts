import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import type { ChainPipeAddresses } from "./addresses";
import { loadPrograms } from "./programs";
import { reputationPda, jobRecordPda } from "./pdas";
import type { ReputationBridge } from "./idl/reputation_bridge";

export type AgentReputation = anchor.IdlAccounts<ReputationBridge>["agentReputation"];
export type JobRecord = anchor.IdlAccounts<ReputationBridge>["jobRecord"];

export async function getAgentReputation(
  connection: Connection,
  agentPubkey: PublicKey,
  addresses: ChainPipeAddresses
): Promise<AgentReputation | null> {
  const { rep } = loadPrograms(connection, addresses);
  return rep.account.agentReputation.fetchNullable(reputationPda(addresses, agentPubkey));
}

export async function getJobRecord(
  connection: Connection,
  jobId: Uint8Array,
  addresses: ChainPipeAddresses
): Promise<JobRecord | null> {
  const { rep } = loadPrograms(connection, addresses);
  return rep.account.jobRecord.fetchNullable(jobRecordPda(addresses, jobId));
}
