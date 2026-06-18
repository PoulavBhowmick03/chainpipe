import { Connection, Keypair, PublicKey, TransactionSignature } from "@solana/web3.js";
import { completeNode, expireNode, ChainPipeAddresses } from "@chainpipe/solana";

/** Settle a verified, claimed node on-chain (dag_escrow::complete_node). */
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
