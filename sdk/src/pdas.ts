import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { ChainPipeAddresses } from "./addresses";

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
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [enc("pipeline"), consumer.toBuffer(), nonceBuf],
    a.dagEscrow
  )[0];
}

export const nodePda = (a: ChainPipeAddresses, pipeline: PublicKey, index: number) =>
  PublicKey.findProgramAddressSync(
    [enc("node"), pipeline.toBuffer(), Buffer.from([index])],
    a.dagEscrow
  )[0];

/** Companion settlement PDA created at submit_completion time. */
export const settlementPda = (a: ChainPipeAddresses, node: PublicKey) =>
  PublicKey.findProgramAddressSync([enc("settlement"), node.toBuffer()], a.dagEscrow)[0];

/** Vault is an ATA owned by an off-curve PDA (stake vault or pipeline vault). */
export const vaultAta = (mint: PublicKey, ownerPda: PublicKey) =>
  getAssociatedTokenAddressSync(mint, ownerPda, true);
