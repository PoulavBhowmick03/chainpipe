import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { sha256 } from "@noble/hashes/sha256";
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
  settlementPda,
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
export type NodeSettlement = anchor.IdlAccounts<DagEscrow>["nodeSettlement"];

/** Dispute window length in slots — mirrors `DISPUTE_SLOTS` in the dag_escrow program. */
export const DISPUTE_SLOTS = 150;

/** Max on-chain delivery URI length (bytes), mirrors `NodeSettlement.uri` size. */
export const MAX_URI_LEN = 96;

/** Encode a delivery URI string into the fixed 96-byte on-chain buffer + length. */
export function encodeUri(uri: string): { bytes: number[]; len: number } {
  const enc = new TextEncoder().encode(uri);
  if (enc.length > MAX_URI_LEN) throw new Error(`uri exceeds ${MAX_URI_LEN} bytes`);
  const bytes = new Array(MAX_URI_LEN).fill(0);
  enc.forEach((b, i) => (bytes[i] = b));
  return { bytes, len: enc.length };
}

/** Decode the on-chain 96-byte URI buffer + length back to a string. */
export function decodeUri(uri: number[] | Uint8Array, uriLen: number): string {
  return new TextDecoder().decode(Uint8Array.from(Array.from(uri).slice(0, uriLen)));
}

/** sha256 helper (cross-platform: browser + node). */
export function sha256Bytes(data: Uint8Array): Uint8Array {
  return sha256(data);
}

/**
 * Canonical message an agent ed25519-signs to authorize a node's settlement AND
 * bind it to a specific delivery. Layout:
 *   pipeline(32) ‖ nodeIndex(1) ‖ jobId(32) ‖ resultHash(32) ‖ sha256(uriBytes)(32)
 * The single source of truth shared by the SDK, facilitator verifier, and dashboard
 * — so a signature cannot be replayed against a different output or retrieval pointer.
 */
export function deliveryMessage(
  pipeline: PublicKey,
  nodeIndex: number,
  jobId: Uint8Array,
  resultHash: Uint8Array,
  uriBytes: Uint8Array
): Uint8Array {
  return Uint8Array.from([
    ...pipeline.toBytes(),
    nodeIndex & 0xff,
    ...jobId,
    ...resultHash,
    ...sha256(uriBytes),
  ]);
}

export interface DeliveryCheck {
  ok: boolean;
  uri: string;
  expectedHash: string;
  actualHash: string | null;
  reason?: string;
}

/**
 * Trustless re-verification of a delivered node: fetch the content addressed by the
 * settlement's `uri`, recompute sha256, and compare to the on-chain `result_hash`.
 * Anyone (consumer, third party) can run this — a mismatch is objective grounds to dispute.
 * `ipfs://` URIs are resolved through `gateway` (default ipfs.io).
 */
export async function verifyDelivery(
  settlement: NodeSettlement,
  opts: { gateway?: string; fetchImpl?: typeof fetch } = {}
): Promise<DeliveryCheck> {
  const uri = decodeUri(settlement.uri as number[], settlement.uriLen as number);
  const expectedHash = Buffer.from(settlement.resultHash as number[]).toString("hex");
  const f = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
  const gateway = opts.gateway ?? "https://ipfs.io/ipfs/";
  const url = uri.startsWith("ipfs://") ? gateway + uri.slice("ipfs://".length) : uri;
  try {
    if (!f) return { ok: false, uri, expectedHash, actualHash: null, reason: "no fetch available" };
    const resp = await f(url);
    if (!resp.ok) return { ok: false, uri, expectedHash, actualHash: null, reason: `fetch ${resp.status}` };
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const actualHash = Buffer.from(sha256(bytes)).toString("hex");
    return { ok: actualHash === expectedHash, uri, expectedHash, actualHash };
  } catch (e) {
    return { ok: false, uri, expectedHash, actualHash: null, reason: String(e) };
  }
}

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

/**
 * Facilitator-only: submit a completion attestation for a claimed node. Starts the
 * dispute window; no payout yet. The node moves Claimed → Submitted and a companion
 * NodeSettlement PDA is created.
 */
export async function submitCompletion(
  connection: Connection,
  facilitator: Keypair,
  pipeline: PublicKey,
  nodeIndex: number,
  agent: PublicKey,
  scoreDelta: number,
  addresses: ChainPipeAddresses,
  resultHash: Uint8Array = new Uint8Array(32),
  uri: string = ""
): Promise<{ signature: TransactionSignature; settlementPda: PublicKey }> {
  const { dag } = loadPrograms(connection, addresses, facilitator);
  const node = nodePda(addresses, pipeline, nodeIndex);
  const settlement = settlementPda(addresses, node);
  const { bytes: uriBytes, len: uriLen } = encodeUri(uri);
  const signature = await dag.methods
    .submitCompletion(nodeIndex, scoreDelta, Array.from(resultHash), uriBytes, uriLen)
    .accountsPartial({
      pipelineConfig: pipelineConfigPda(addresses),
      pipeline,
      node,
      facilitator: facilitator.publicKey,
      agent,
      settlement,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([facilitator])
    .rpc();
  return { signature, settlementPda: settlement };
}

/** Consumer-only: dispute a Submitted node within the dispute window. */
export async function disputeNode(
  connection: Connection,
  consumer: Keypair,
  pipeline: PublicKey,
  nodeIndex: number,
  addresses: ChainPipeAddresses,
  reasonHash: Uint8Array = new Uint8Array(32),
  reasonCode: number = 0
): Promise<{ signature: TransactionSignature }> {
  const { dag } = loadPrograms(connection, addresses, consumer);
  const node = nodePda(addresses, pipeline, nodeIndex);
  const signature = await dag.methods
    .disputeNode(nodeIndex, Array.from(reasonHash), reasonCode)
    .accountsPartial({
      pipeline,
      node,
      settlement: settlementPda(addresses, node),
      consumer: consumer.publicKey,
    })
    .signers([consumer])
    .rpc();
  return { signature };
}

/**
 * Permissionless: finalize a Submitted node after the dispute window elapses with no
 * dispute. Pays the agent (minus fee) + operator fee, records completion reputation,
 * and closes the settlement PDA (rent refunded to caller).
 */
export async function finalizeNode(
  connection: Connection,
  caller: Keypair,
  pipeline: PublicKey,
  nodeIndex: number,
  agent: PublicKey,
  operatorTreasury: PublicKey,
  addresses: ChainPipeAddresses
): Promise<{ signature: TransactionSignature }> {
  const { dag } = loadPrograms(connection, addresses, caller);
  const node = nodePda(addresses, pipeline, nodeIndex);
  const nodeAcc = await dag.account.pipelineNode.fetch(node);
  const jobId = Uint8Array.from(nodeAcc.jobId);
  const signature = await dag.methods
    .finalizeNode(nodeIndex)
    .accountsPartial({
      pipelineConfig: pipelineConfigPda(addresses),
      pipeline,
      node,
      settlement: settlementPda(addresses, node),
      caller: caller.publicKey,
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
    .signers([caller])
    .rpc();
  return { signature };
}

/**
 * Arbiter (facilitator authority, v1) resolves a disputed node. `upheld` → refund the
 * consumer + slash the agent + record failure; otherwise pay the agent + record
 * completion. Closes the settlement PDA (rent refunded to facilitator).
 */
export async function resolveDispute(
  connection: Connection,
  facilitator: Keypair,
  pipeline: PublicKey,
  nodeIndex: number,
  agent: PublicKey,
  upheld: boolean,
  operatorTreasury: PublicKey,
  addresses: ChainPipeAddresses
): Promise<{ signature: TransactionSignature }> {
  const { dag } = loadPrograms(connection, addresses, facilitator);
  const node = nodePda(addresses, pipeline, nodeIndex);
  const nodeAcc = await dag.account.pipelineNode.fetch(node);
  const jobId = Uint8Array.from(nodeAcc.jobId);
  const pipelineAcc = await dag.account.pipeline.fetch(pipeline);
  const signature = await dag.methods
    .resolveDispute(nodeIndex, upheld)
    .accountsPartial({
      pipelineConfig: pipelineConfigPda(addresses),
      pipeline,
      node,
      settlement: settlementPda(addresses, node),
      facilitator: facilitator.publicKey,
      vault: vaultAta(addresses.usdcMint, pipeline),
      stakeMint: addresses.usdcMint,
      agent,
      agentTokenAccount: getAssociatedTokenAddressSync(addresses.usdcMint, agent),
      operatorTreasury,
      consumerTokenAccount: getAssociatedTokenAddressSync(addresses.usdcMint, pipelineAcc.consumer),
      dagAuthority: dagAuthorityPda(addresses),
      registryConfig: registryConfigPda(addresses),
      agentStake: agentStakePda(addresses, agent),
      agentStakeVault: vaultAta(addresses.usdcMint, agentStakePda(addresses, agent)),
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

/** Fetch the companion NodeSettlement PDA for a submitted node (null if none). */
export async function getSettlement(
  connection: Connection,
  pipeline: PublicKey,
  nodeIndex: number,
  addresses: ChainPipeAddresses
): Promise<NodeSettlement | null> {
  const { dag } = loadPrograms(connection, addresses);
  const node = nodePda(addresses, pipeline, nodeIndex);
  return dag.account.nodeSettlement.fetchNullable(settlementPda(addresses, node));
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
