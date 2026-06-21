import type { NodeRecord, PipelineRecord, AgentRecord } from "@/lib/indexer";
import { statusKey } from "@/lib/format";
import { short } from "@/lib/theme";
import type { DagNode } from "@/components/DagCanvas";

const SYSTEM = "11111111111111111111111111111111";

/** Dependency node indices from a u64 bitmask string. */
export function depsOf(mask: string): number[] {
  const m = BigInt(mask || "0");
  const out: number[] = [];
  for (let i = 0; i < 16; i++) if (((m >> BigInt(i)) & 1n) === 1n) out.push(i);
  return out;
}

export function toDagNodes(nodes: NodeRecord[]): DagNode[] {
  return nodes.map((n) => {
    const st = statusKey(n.status);
    const assigned = n.agent && n.agent !== SYSTEM;
    return {
      id: n.nodeIndex,
      label: String(n.nodeIndex),
      title: `node ${n.nodeIndex}`,
      allocStr: (Number(n.allocationUsdc) / 1e6).toFixed(2),
      statusShort: st.toUpperCase(),
      agentStr: assigned ? short(n.agent) : "—",
      tier: n.requiredTier,
      deps: depsOf(n.dependencyMask),
      status: st,
    };
  });
}

export const nodeStatuses = (p: PipelineRecord) => p.nodes.map((n) => statusKey(n.status));
export const settledCount = (p: PipelineRecord) => p.nodes.filter((n) => statusKey(n.status) === "settled").length;

/** Reputation score 0–100 (one decimal) or "—". */
export const repScore = (a: AgentRecord) => (a.reputation ? (a.reputation.emaScore / 100).toFixed(1) : "—");
// The indexer exposes no human-readable name for an agent, so the on-chain pubkey
// (shortened) is the canonical identity. (A display-name registry would be an
// indexer-side feature; until then, never reference a non-existent field.)
export const agentTitle = (a: AgentRecord) => short(a.agent);
