import { Connection, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  getPipeline,
  deliveryMessage,
  sha256Bytes,
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

/**
 * Verify a completion/submission request strictly against on-chain state + delivery proof:
 *  - node exists and is Claimed
 *  - the agent's ed25519 signature over the canonical `deliveryMessage`
 *    (pipeline ‖ nodeIndex ‖ jobId ‖ resultHash ‖ sha256(uri)) is valid — this binds the
 *    signature to BOTH the output hash and the retrieval pointer, so neither can be swapped.
 *    Old-format signatures (without the uri binding) are therefore rejected.
 *  - the deadline has not passed
 *  - if `uri` resolves and the fetched bytes hash != resultHash → reject (definitive mismatch).
 *    Unreachable URIs are NOT rejected here (availability is the consumer's dispute lever).
 */
export async function verifyCompletion(
  connection: Connection,
  pipeline: PublicKey,
  nodeIndex: number,
  agentSignature: Uint8Array,
  resultHash: Uint8Array,
  addresses: ChainPipeAddresses,
  uri: string = ""
): Promise<CompletionVerification> {
  const p = await getPipeline(connection, pipeline, addresses);
  if (!p) return { ok: false, reason: "pipeline not found" };
  const node = p.nodes[nodeIndex];
  if (!node) return { ok: false, reason: "node not found" };
  if (!("claimed" in node.status)) return { ok: false, reason: "node is not Claimed" };

  const agent = node.agent;
  const jobId = Uint8Array.from(node.jobId);
  const uriBytes = new TextEncoder().encode(uri);
  const msg = deliveryMessage(pipeline, nodeIndex, jobId, resultHash, uriBytes);
  const sigOk = nacl.sign.detached.verify(msg, agentSignature, agent.toBytes());
  if (!sigOk) return { ok: false, reason: "invalid agent signature (must sign the uri-bound deliveryMessage)" };

  const slot = await connection.getSlot("confirmed");
  if (slot > node.deadlineSlot.toNumber()) return { ok: false, reason: "deadline has passed" };

  // Definitive-mismatch integrity check (best-effort; gated on FACILITATOR_VERIFY_DELIVERY).
  if (uri && (process.env.FACILITATOR_VERIFY_DELIVERY ?? "true") === "true") {
    const mismatch = await deliveryHashMismatch(uri, resultHash);
    if (mismatch) return { ok: false, reason: "result_hash does not match fetched output" };
  }

  return { ok: true, node, agent, jobId };
}

/**
 * Returns true only if the URI resolves AND its bytes hash differs from `resultHash`.
 * Returns false on unreachable/unsupported URIs (don't block on availability — the
 * consumer disputes unavailability on-chain within the window).
 */
export async function deliveryHashMismatch(uri: string, resultHash: Uint8Array): Promise<boolean> {
  const gateway = process.env.IPFS_GATEWAY ?? "https://ipfs.io/ipfs/";
  const url = uri.startsWith("ipfs://") ? gateway + uri.slice("ipfs://".length) : uri;
  if (!/^https?:\/\//.test(url)) return false; // unsupported scheme → can't disprove
  try {
    const resp = await fetch(url);
    if (!resp.ok) return false; // unreachable → not a definitive mismatch
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const actual = Buffer.from(sha256Bytes(bytes)).toString("hex");
    const expected = Buffer.from(resultHash).toString("hex");
    return actual !== expected;
  } catch {
    return false; // network error → not a definitive mismatch
  }
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
