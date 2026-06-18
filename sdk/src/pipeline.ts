import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Connection, Keypair, PublicKey, TransactionSignature } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { ChainPipeAddresses } from "./addresses";
import { loadPrograms } from "./programs";
import {
  pipelineConfigPda,
  pipelinePda,
  nodePda,
  dagAuthorityPda,
  registryConfigPda,
  agentStakePda,
  bridgeConfigPda,
  reputationPda,
  jobRecordPda,
  vaultAta,
} from "./pdas";
import type { DagEscrow } from "./idl/dag_escrow";

export type Pipeline = anchor.IdlAccounts<DagEscrow>["pipeline"];
export type PipelineNode = anchor.IdlAccounts<DagEscrow>["pipelineNode"];

export interface NodeInput {
  allocationUsdc: bigint;
  deadlineSlotsFromNow: bigint;
  dependencyMask: bigint;
  requiredTier: number;
}

export async function createPipeline(
  connection: Connection,
  consumer: Keypair,
  nodes: NodeInput[],
  addresses: ChainPipeAddresses,
  nonce: bigint = BigInt(Date.now())
): Promise<{ signature: TransactionSignature; pipelinePda: PublicKey; nodePdas: PublicKey[] }> {
  const { dag } = loadPrograms(connection, addresses, consumer);
  const pipeline = pipelinePda(addresses, consumer.publicKey, nonce);
  const nodePdas = nodes.map((_, i) => nodePda(addresses, pipeline, i));

  const signature = await dag.methods
    .createPipeline(
      nodes.map((n) => ({
        allocationUsdc: new BN(n.allocationUsdc.toString()),
        deadlineSlotsFromNow: new BN(n.deadlineSlotsFromNow.toString()),
        dependencyMask: new BN(n.dependencyMask.toString()),
        requiredTier: n.requiredTier,
      })),
      new BN(nonce.toString())
    )
    .accountsPartial({
      pipeline,
      consumer: consumer.publicKey,
      stakeMint: addresses.usdcMint,
      consumerTokenAccount: getAssociatedTokenAddressSync(addresses.usdcMint, consumer.publicKey),
      vault: vaultAta(addresses.usdcMint, pipeline),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .remainingAccounts(nodePdas.map((pubkey) => ({ pubkey, isWritable: true, isSigner: false })))
    .signers([consumer])
    .rpc();
  return { signature, pipelinePda: pipeline, nodePdas };
}

export async function claimNode(
  connection: Connection,
  agent: Keypair,
  pipeline: PublicKey,
  nodeIndex: number,
  addresses: ChainPipeAddresses
): Promise<{ signature: TransactionSignature; jobId: Uint8Array }> {
  const { dag } = loadPrograms(connection, addresses, agent);
  const signature = await dag.methods
    .claimNode(nodeIndex)
    .accountsPartial({
      pipelineConfig: pipelineConfigPda(addresses),
      pipeline,
      node: nodePda(addresses, pipeline, nodeIndex),
      agent: agent.publicKey,
      agentStake: agentStakePda(addresses, agent.publicKey),
      registryConfig: registryConfigPda(addresses),
      dagAuthority: dagAuthorityPda(addresses),
      bondedRegistryProgram: addresses.bondedRegistry,
    })
    .signers([agent])
    .rpc();
  const node = await dag.account.pipelineNode.fetch(nodePda(addresses, pipeline, nodeIndex));
  return { signature, jobId: Uint8Array.from(node.jobId) };
}

/** Facilitator-only: settle a claimed node, paying the agent and operator fee. */
export async function completeNode(
  connection: Connection,
  facilitator: Keypair,
  pipeline: PublicKey,
  nodeIndex: number,
  agent: PublicKey,
  scoreDelta: number,
  operatorTreasury: PublicKey,
  addresses: ChainPipeAddresses,
  resultHash: Uint8Array = new Uint8Array(32)
): Promise<{ signature: TransactionSignature }> {
  const { dag } = loadPrograms(connection, addresses, facilitator);
  const node = await dag.account.pipelineNode.fetch(nodePda(addresses, pipeline, nodeIndex));
  const jobId = Uint8Array.from(node.jobId);
  const signature = await dag.methods
    .completeNode(nodeIndex, scoreDelta, Array.from(resultHash))
    .accountsPartial({
      pipelineConfig: pipelineConfigPda(addresses),
      pipeline,
      node: nodePda(addresses, pipeline, nodeIndex),
      facilitator: facilitator.publicKey,
      vault: vaultAta(addresses.usdcMint, pipeline),
      stakeMint: addresses.usdcMint,
      agent,
      agentTokenAccount: getAssociatedTokenAddressSync(addresses.usdcMint, agent),
      operatorTreasury,
      dagAuthority: dagAuthorityPda(addresses),
      registryConfig: registryConfigPda(addresses),
      agentStake: agentStakePda(addresses, agent),
      bondedRegistryProgram: addresses.bondedRegistry,
      bridgeConfig: bridgeConfigPda(addresses),
      agentReputation: reputationPda(addresses, agent),
      jobRecord: jobRecordPda(addresses, jobId),
      reputationBridgeProgram: addresses.reputationBridge,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([facilitator])
    .rpc();
  return { signature };
}

export async function expireNode(
  connection: Connection,
  caller: Keypair,
  pipeline: PublicKey,
  nodeIndex: number,
  addresses: ChainPipeAddresses
): Promise<{ signature: TransactionSignature; refundAmount: bigint }> {
  const { dag } = loadPrograms(connection, addresses, caller);
  const target = await dag.account.pipelineNode.fetch(nodePda(addresses, pipeline, nodeIndex));
  const pipelineAcc = await dag.account.pipeline.fetch(pipeline);
  const consumerAta = getAssociatedTokenAddressSync(addresses.usdcMint, pipelineAcc.consumer);

  const claimed = "claimed" in target.status;
  const agent = target.agent;

  // All other node accounts (downstream cascade candidates).
  const others: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] = [];
  for (let i = 0; i < pipelineAcc.totalNodes; i++) {
    if (i === nodeIndex) continue;
    others.push({ pubkey: nodePda(addresses, pipeline, i), isWritable: true, isSigner: false });
  }

  const slashAccounts = claimed
    ? {
        registryConfig: registryConfigPda(addresses),
        agentStake: agentStakePda(addresses, agent),
        agentStakeVault: vaultAta(addresses.usdcMint, agentStakePda(addresses, agent)),
        bondedRegistryProgram: addresses.bondedRegistry,
        bridgeConfig: bridgeConfigPda(addresses),
        agentReputation: reputationPda(addresses, agent),
        jobRecord: jobRecordPda(addresses, Uint8Array.from(target.jobId)),
        agent,
        reputationBridgeProgram: addresses.reputationBridge,
      }
    : {
        registryConfig: null,
        agentStake: null,
        agentStakeVault: null,
        bondedRegistryProgram: null,
        bridgeConfig: null,
        agentReputation: null,
        jobRecord: null,
        agent: null,
        reputationBridgeProgram: null,
      };

  const signature = await dag.methods
    .expireNode(nodeIndex)
    .accountsPartial({
      pipelineConfig: pipelineConfigPda(addresses),
      pipeline,
      node: nodePda(addresses, pipeline, nodeIndex),
      vault: vaultAta(addresses.usdcMint, pipeline),
      stakeMint: addresses.usdcMint,
      consumerTokenAccount: consumerAta,
      caller: caller.publicKey,
      dagAuthority: dagAuthorityPda(addresses),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      ...slashAccounts,
    })
    .remainingAccounts(others)
    .signers([caller])
    .rpc();

  return { signature, refundAmount: BigInt(target.allocationUsdc.toString()) };
}

export async function cancelPipeline(
  connection: Connection,
  consumer: Keypair,
  pipeline: PublicKey,
  addresses: ChainPipeAddresses
): Promise<{ signature: TransactionSignature }> {
  const { dag } = loadPrograms(connection, addresses, consumer);
  const pipelineAcc = await dag.account.pipeline.fetch(pipeline);
  const nodes: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] = [];
  for (let i = 0; i < pipelineAcc.totalNodes; i++) {
    nodes.push({ pubkey: nodePda(addresses, pipeline, i), isWritable: true, isSigner: false });
  }
  const signature = await dag.methods
    .cancelPipeline()
    .accountsPartial({
      pipeline,
      consumer: consumer.publicKey,
      stakeMint: addresses.usdcMint,
      vault: vaultAta(addresses.usdcMint, pipeline),
      consumerTokenAccount: getAssociatedTokenAddressSync(addresses.usdcMint, consumer.publicKey),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .remainingAccounts(nodes)
    .signers([consumer])
    .rpc();
  return { signature };
}

export async function getPipeline(
  connection: Connection,
  pipeline: PublicKey,
  addresses: ChainPipeAddresses
): Promise<(Pipeline & { nodes: PipelineNode[] }) | null> {
  const { dag } = loadPrograms(connection, addresses);
  const p = await dag.account.pipeline.fetchNullable(pipeline);
  if (!p) return null;
  const nodes: PipelineNode[] = [];
  for (let i = 0; i < p.totalNodes; i++) {
    const n = await dag.account.pipelineNode.fetchNullable(nodePda(addresses, pipeline, i));
    if (n) nodes.push(n);
  }
  return { ...p, nodes };
}
