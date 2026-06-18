import type { NodeRecord } from "@/lib/indexer";
import { statusKey, usdc } from "@/lib/format";

const FILL: Record<string, string> = {
  pending: "#3a4252",
  claimed: "#2563eb",
  settled: "#14f195",
  expired: "#ef4444",
};

/** Layered left-to-right DAG: x = dependency depth, edges = dependencies. */
export function DagGraph({ nodes }: { nodes: NodeRecord[] }) {
  const deps = (n: NodeRecord) => {
    const m = BigInt(n.dependencyMask);
    const out: number[] = [];
    for (let i = 0; i < nodes.length; i++) if (((m >> BigInt(i)) & 1n) === 1n) out.push(i);
    return out;
  };

  // depth = longest dependency chain to this node
  const depth: number[] = nodes.map(() => 0);
  for (let pass = 0; pass < nodes.length; pass++) {
    nodes.forEach((n, i) => {
      for (const d of deps(n)) depth[i] = Math.max(depth[i], depth[d] + 1);
    });
  }
  const maxDepth = Math.max(0, ...depth);
  const perCol: Record<number, number> = {};
  const pos = nodes.map((_, i) => {
    const col = depth[i];
    const row = perCol[col] = (perCol[col] ?? 0) + 1;
    return { x: 40 + col * 170, y: 30 + (row - 1) * 90 };
  });

  const W = 80 + (maxDepth + 1) * 170;
  const maxRow = Math.max(1, ...Object.values(perCol));
  const H = 40 + maxRow * 90;
  const NW = 130, NH = 56;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="bg-ink rounded-xl border border-white/10">
      {nodes.map((n, i) =>
        deps(n).map((d) => (
          <line
            key={`${i}-${d}`}
            x1={pos[d].x + NW}
            y1={pos[d].y + NH / 2}
            x2={pos[i].x}
            y2={pos[i].y + NH / 2}
            stroke="#4b5563"
            strokeWidth={1.5}
            markerEnd="url(#arrow)"
          />
        ))
      )}
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 Z" fill="#4b5563" />
        </marker>
      </defs>
      {nodes.map((n, i) => {
        const s = statusKey(n.status);
        return (
          <g key={i}>
            <rect x={pos[i].x} y={pos[i].y} width={NW} height={NH} rx={8} fill={FILL[s] ?? "#3a4252"} opacity={0.9} />
            <text x={pos[i].x + 10} y={pos[i].y + 22} fill="#0b0e14" fontSize="13" fontWeight="700">
              Node {n.nodeIndex}
            </text>
            <text x={pos[i].x + 10} y={pos[i].y + 42} fill="#0b0e14" fontSize="11">
              {usdc(n.allocationUsdc)} USDC · {s}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
