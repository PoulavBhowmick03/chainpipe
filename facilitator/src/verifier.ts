import { Connection, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  getPipeline,
  getSettlement,
  DISPUTE_SLOTS,
  ChainPipeAddresses,
  PipelineNode,
} from "@chainpipe/solana";

export interface CompletionVerification {
  ok: boolean;
  reason?: string;
  node?: PipelineNode;
  agent?: PublicKey;
  jobId?: Uint8Array;
}

/** Message an agent signs to authorize settlement of one node and commit to a
 *  result hash (proof-of-delivery commitment). */
export function completionMessage(
  pipeline: PublicKey,
  nodeIndex: number,
  jobId: Uint8Array,
  resultHash: Uint8Array
): Uint8Array {
  return Uint8Array.from([...pipeline.toBytes(), nodeIndex & 0xff, ...jobId, ...resultHash]);
}

/**
 * Verify a completion request strictly against on-chain state:
 *  - node exists and is Claimed
 *  - the agent's ed25519 signature over (pipeline ‖ nodeIndex ‖ jobId) is valid
 *  - the deadline has not passed
 */
export async function verifyCompletion(
  connection: Connection,
  pipeline: PublicKey,
  nodeIndex: number,
  agentSignature: Uint8Array,
  resultHash: Uint8Array,
  addresses: ChainPipeAddresses
): Promise<CompletionVerification> {
  const p = await getPipeline(connection, pipeline, addresses);
  if (!p) return { ok: false, reason: "pipeline not found" };
  const node = p.nodes[nodeIndex];
  if (!node) return { ok: false, reason: "node not found" };
  if (!("claimed" in node.status)) return { ok: false, reason: "node is not Claimed" };

  const agent = node.agent;
  const jobId = Uint8Array.from(node.jobId);
  const msg = completionMessage(pipeline, nodeIndex, jobId, resultHash);
  const sigOk = nacl.sign.detached.verify(msg, agentSignature, agent.toBytes());
  if (!sigOk) return { ok: false, reason: "invalid agent signature" };

  const slot = await connection.getSlot("confirmed");
  if (slot > node.deadlineSlot.toNumber()) return { ok: false, reason: "deadline has passed" };

  return { ok: true, node, agent, jobId };
}

/** Verify a node is past its deadline (for permissionless expiry). */
export async function verifyExpirable(
  connection: Connection,
  pipeline: PublicKey,
  nodeIndex: number,
  addresses: ChainPipeAddresses
): Promise<{ ok: boolean; reason?: string; node?: PipelineNode }> {
  const p = await getPipeline(connection, pipeline, addresses);
  if (!p) return { ok: false, reason: "pipeline not found" };
  const node = p.nodes[nodeIndex];
  if (!node) return { ok: false, reason: "node not found" };
  if ("settled" in node.status || "expired" in node.status)
    return { ok: false, reason: "node already finalized" };
  const slot = await connection.getSlot("confirmed");
  if (slot <= node.deadlineSlot.toNumber()) return { ok: false, reason: "deadline not passed" };
  return { ok: true, node };
}
