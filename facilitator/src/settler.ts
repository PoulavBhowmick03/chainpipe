import { Connection, Keypair, PublicKey, TransactionSignature } from "@solana/web3.js";
import {
  completeNode,
  expireNode,
  submitCompletion,
  finalizeNode,
  resolveDispute,
  ChainPipeAddresses,
} from "@chainpipe/solana";

/**
 * Optimistic settlement: submit a completion attestation, opening the dispute
 * window (dag_escrow::submit_completion). No payout yet.
 */
export function submitNode(
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
  return submitCompletion(
    connection,
    facilitator,
    pipeline,
    nodeIndex,
    agent,
    scoreDelta,
    addresses,
    resultHash,
    uri
  );
}

/** Permissionless finalize after the dispute window elapses (dag_escrow::finalize_node). */
export function finalizeOverdue(
  connection: Connection,
  caller: Keypair,
  pipeline: PublicKey,
  nodeIndex: number,
  agent: PublicKey,
  operatorTreasury: PublicKey,
  addresses: ChainPipeAddresses
): Promise<{ signature: TransactionSignature }> {
  return finalizeNode(connection, caller, pipeline, nodeIndex, agent, operatorTreasury, addresses);
}

/** Arbiter (facilitator authority, v1) resolves a disputed node (dag_escrow::resolve_dispute). */
export function resolveNode(
  connection: Connection,
  facilitator: Keypair,
  pipeline: PublicKey,
  nodeIndex: number,
  agent: PublicKey,
  upheld: boolean,
  operatorTreasury: PublicKey,
  addresses: ChainPipeAddresses
): Promise<{ signature: TransactionSignature }> {
  return resolveDispute(
    connection,
    facilitator,
    pipeline,
    nodeIndex,
    agent,
    upheld,
    operatorTreasury,
    addresses
  );
}

/** Settle a verified, claimed node on-chain directly (dag_escrow::complete_node, fast path). */
export function settleNode(
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
  return completeNode(
    connection,
    facilitator,
    pipeline,
    nodeIndex,
    agent,
    scoreDelta,
    operatorTreasury,
    addresses,
    resultHash
  );
}

/** Expire an overdue node (dag_escrow::expire_node); cascades + slashes. */
export function expireOverdue(
  connection: Connection,
  caller: Keypair,
  pipeline: PublicKey,
  nodeIndex: number,
  addresses: ChainPipeAddresses
): Promise<{ signature: TransactionSignature; refundAmount: bigint }> {
  return expireNode(connection, caller, pipeline, nodeIndex, addresses);
}
