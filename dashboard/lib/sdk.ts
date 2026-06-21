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
export const settlementPda = (a: ChainPipeAddresses, node: PublicKey) =>
  PublicKey.findProgramAddressSync([enc("settlement"), node.toBuffer()], a.dagEscrow)[0];

// ── Proof-of-delivery (vendored from sdk/src/pipeline.ts; keep byte-compatible) ──
export const DISPUTE_SLOTS = 150;
export const MAX_URI_LEN = 96;

export function encodeUri(uri: string): { bytes: number[]; len: number } {
  const e = new TextEncoder().encode(uri);
  if (e.length > MAX_URI_LEN) throw new Error(`uri exceeds ${MAX_URI_LEN} bytes`);
  const bytes = new Array(MAX_URI_LEN).fill(0);
  e.forEach((b, i) => (bytes[i] = b));
  return { bytes, len: e.length };
}
export function decodeUri(uri: number[] | Uint8Array, uriLen: number): string {
  return new TextDecoder().decode(Uint8Array.from(Array.from(uri).slice(0, uriLen)));
}

/** SHA-256 via Web Crypto (browser + Node 20+); no extra dependency. */
export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(d);
}

/** Canonical agent-signed message — MUST match sdk deliveryMessage byte layout:
 *  pipeline(32) ‖ nodeIndex(1) ‖ jobId(32) ‖ resultHash(32) ‖ sha256(uriBytes)(32). */
export async function deliveryMessage(
  pipeline: PublicKey,
  nodeIndex: number,
  jobId: Uint8Array,
  resultHash: Uint8Array,
  uriBytes: Uint8Array
): Promise<Uint8Array> {
  const uriHash = await sha256(uriBytes);
  return Uint8Array.from([...pipeline.toBytes(), nodeIndex & 0xff, ...jobId, ...resultHash, ...uriHash]);
}

/** Trustless re-check: fetch the delivery uri, recompute sha256, compare to result_hash. */
export async function verifyDelivery(
  uri: string,
  resultHashHex: string,
  gateway = "https://ipfs.io/ipfs/"
): Promise<{ ok: boolean; actualHash: string | null; reason?: string }> {
  const url = uri.startsWith("ipfs://") ? gateway + uri.slice("ipfs://".length) : uri;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return { ok: false, actualHash: null, reason: `fetch ${resp.status}` };
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const actualHash = Buffer.from(await sha256(bytes)).toString("hex");
    return { ok: actualHash === resultHashHex, actualHash };
  } catch (e) {
    return { ok: false, actualHash: null, reason: String(e) };
  }
}
