// Vendored pure pieces of @chainpipe/solana so the dashboard deploys as a
// self-contained Next.js app (no workspace dependency at build time on Vercel).
// Keep in sync with sdk/src/{addresses,pdas,idls}.ts.
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

import bondedRegistryIdl from "./idl/bonded_registry.json";
import dagEscrowIdl from "./idl/dag_escrow.json";
import reputationBridgeIdl from "./idl/reputation_bridge.json";

export { bondedRegistryIdl, dagEscrowIdl, reputationBridgeIdl };
export type { BondedRegistry } from "./idl/bonded_registry";
export type { DagEscrow } from "./idl/dag_escrow";
export type { ReputationBridge } from "./idl/reputation_bridge";

export interface ChainPipeAddresses {
  bondedRegistry: PublicKey;
  dagEscrow: PublicKey;
  reputationBridge: PublicKey;
  usdcMint: PublicKey;
}

export const DEVNET_ADDRESSES: ChainPipeAddresses = {
  bondedRegistry: new PublicKey("26AB6S5crQAkhfx928bnWSHfpQE6wp2Sdt4afFtk7crq"),
  dagEscrow: new PublicKey("3FqvkzppD4ciwkGLrcNoTHUCeHwNbWtot18CkrBdXiJd"),
  reputationBridge: new PublicKey("6RRfs1Ho1bJ3JWXSy3xVth4BTGHWwVwum74ph2LRWWsf"),
  usdcMint: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
};

const enc = (s: string) => Buffer.from(s);

export const registryConfigPda = (a: ChainPipeAddresses) =>
  PublicKey.findProgramAddressSync([enc("config")], a.bondedRegistry)[0];
export const agentStakePda = (a: ChainPipeAddresses, agent: PublicKey) =>
  PublicKey.findProgramAddressSync([enc("agent_stake"), agent.toBuffer()], a.bondedRegistry)[0];
export const bridgeConfigPda = (a: ChainPipeAddresses) =>
  PublicKey.findProgramAddressSync([enc("bridge_config")], a.reputationBridge)[0];
export const reputationPda = (a: ChainPipeAddresses, agent: PublicKey) =>
  PublicKey.findProgramAddressSync([enc("reputation"), agent.toBuffer()], a.reputationBridge)[0];
export const jobRecordPda = (a: ChainPipeAddresses, jobId: Uint8Array) =>
  PublicKey.findProgramAddressSync([enc("job_record"), Buffer.from(jobId)], a.reputationBridge)[0];
export const pipelineConfigPda = (a: ChainPipeAddresses) =>
  PublicKey.findProgramAddressSync([enc("pipeline_config")], a.dagEscrow)[0];
export const dagAuthorityPda = (a: ChainPipeAddresses) =>
  PublicKey.findProgramAddressSync([enc("dag_authority")], a.dagEscrow)[0];

export function pipelinePda(a: ChainPipeAddresses, consumer: PublicKey, nonce: bigint) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync([enc("pipeline"), consumer.toBuffer(), b], a.dagEscrow)[0];
}
export const nodePda = (a: ChainPipeAddresses, pipeline: PublicKey, index: number) =>
  PublicKey.findProgramAddressSync([enc("node"), pipeline.toBuffer(), Buffer.from([index])], a.dagEscrow)[0];
export const vaultAta = (mint: PublicKey, ownerPda: PublicKey) =>
  getAssociatedTokenAddressSync(mint, ownerPda, true);
