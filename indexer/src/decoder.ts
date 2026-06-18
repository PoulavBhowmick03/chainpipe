import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import type { AgentWithReputation } from "@chainpipe/solana";

/** Recursively convert anchor/web3 values to JSON-safe forms. */
export function serialize(v: unknown): any {
  if (v === null || v === undefined) return v;
  if (typeof v === "bigint") return v.toString();
  if (BN.isBN(v)) return (v as BN).toString();
  if (v instanceof PublicKey) return v.toBase58();
  if (Buffer.isBuffer(v)) return Array.from(v);
  if (Array.isArray(v)) return v.map(serialize);
  if (typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>)) {
      o[k] = serialize((v as Record<string, unknown>)[k]);
    }
    return o;
  }
  return v;
}

/** A pipeline with its address and decoded nodes (still anchor types). */
export interface RawPipeline {
  address: PublicKey;
  consumer: PublicKey;
  totalNodes: number;
  totalUsdcLocked: BN;
  nodesSettled: number;
  nodesExpired: number;
  status: Record<string, unknown>;
  nodes: Array<{ status: Record<string, unknown>; allocationUsdc: BN }>;
}

export interface Stats {
  totalPipelines: number;
  activePipelines: number;
  totalNodesSettled: number;
  totalUsdcSettled: string;
  totalUsdcRefunded: string;
  totalAgentsStaked: number;
  totalStakeValueUsdc: string;
}

export function computeStats(
  agents: AgentWithReputation[],
  pipelines: RawPipeline[]
): Stats {
  let settled = new BN(0);
  let refunded = new BN(0);
  let nodesSettled = 0;
  let active = 0;
  for (const p of pipelines) {
    if ("active" in p.status) active++;
    for (const n of p.nodes) {
      if ("settled" in n.status) {
        settled = settled.add(n.allocationUsdc);
        nodesSettled++;
      } else if ("expired" in n.status) {
        refunded = refunded.add(n.allocationUsdc);
      }
    }
  }
  let stakeTotal = new BN(0);
  for (const a of agents) stakeTotal = stakeTotal.add(a.stakeAmount);

  return {
    totalPipelines: pipelines.length,
    activePipelines: active,
    totalNodesSettled: nodesSettled,
    totalUsdcSettled: settled.toString(),
    totalUsdcRefunded: refunded.toString(),
    totalAgentsStaked: agents.length,
    totalStakeValueUsdc: stakeTotal.toString(),
  };
}
