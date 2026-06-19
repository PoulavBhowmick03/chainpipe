"use client";

import { C, statusColor } from "@/lib/theme";

export interface DagNode {
  id: number;
  label: string;
  title: string;
  allocStr: string;
  statusShort: string;
  agentStr: string;
  tier: number;
  deps: number[];
  status: string;
}

const NW = 172, NH = 82, GX = 64, GY = 20, PAD = 26;

export function DagCanvas({
  nodes,
  onNodeClick,
  selId,
  connectFrom,
  height = 300,
}: {
  nodes: DagNode[];
  onNodeClick?: (id: number) => void;
  selId?: number | null;
  connectFrom?: number | null;
  height?: number;
}) {
  const byId: Record<number, DagNode> = {};
  nodes.forEach((n) => (byId[n.id] = n));

  const dm: Record<number, number> = {};
  const depth = (id: number): number => {
    if (dm[id] != null) return dm[id];
    const n = byId[id];
    if (!n || !n.deps?.length) return (dm[id] = 0);
    let m = 0;
    n.deps.forEach((d) => { if (byId[d] != null) m = Math.max(m, depth(d) + 1); });
    return (dm[id] = m);
  };

  const cols: Record<number, DagNode[]> = {};
  nodes.forEach((n) => { const d = depth(n.id); (cols[d] = cols[d] || []).push(n); });

  const pos: Record<number, { x: number; y: number }> = {};
  let maxRow = 0;
  const maxD = Math.max(0, ...Object.keys(cols).map(Number));
  Object.keys(cols).forEach((dk) => {
    const d = +dk;
    cols[d].forEach((n, i) => { pos[n.id] = { x: PAD + d * (NW + GX), y: PAD + i * (NH + GY) }; });
    maxRow = Math.max(maxRow, cols[d].length);
  });
  const W = PAD * 2 + (maxD + 1) * NW + maxD * GX;
  const H = Math.max(180, PAD * 2 + maxRow * NH + (maxRow - 1) * GY);

  const edges: React.ReactNode[] = [];
  nodes.forEach((n) =>
    (n.deps || []).forEach((d) => {
      if (!pos[d]) return;
      const a = pos[d], b = pos[n.id];
      const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
      const path = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      const srcSettled = byId[d].status === "settled";
      const tgtBad = n.status === "expired" || n.status === "refunded";
      const col = tgtBad ? C.red : srcSettled ? C.green : C.line2;
      edges.push(<path key={`${d}-${n.id}b`} d={path} fill="none" stroke={col} strokeWidth={1.5} opacity={tgtBad ? 0.7 : 1} />);
      if (srcSettled && !tgtBad)
        edges.push(<path key={`${d}-${n.id}f`} className="cp-flow" d={path} fill="none" stroke={C.green} strokeWidth={1.5} strokeDasharray="4 10" strokeLinecap="round" />);
      if (tgtBad)
        edges.push(<path key={`${d}-${n.id}r`} className="cp-flow" d={path} fill="none" stroke="#ff9a9a" strokeWidth={1.5} strokeDasharray="4 8" />);
      edges.push(<rect key={`${d}-${n.id}d`} x={x2 - 2} y={y2 - 2} width={4} height={4} fill={col} />);
    })
  );

  return (
    <div style={{ overflow: "auto", flex: 1, minHeight: height }}>
      <div
        style={{
          position: "relative",
          width: W,
          height: H,
          minWidth: "100%",
          backgroundImage: `linear-gradient(${C.line}55 1px,transparent 1px),linear-gradient(90deg,${C.line}55 1px,transparent 1px)`,
          backgroundSize: "22px 22px",
        }}
      >
        <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
          {edges}
        </svg>
        {nodes.map((n) => {
          const p = pos[n.id], c = statusColor(n.status);
          const sel = selId === n.id, conn = connectFrom === n.id;
          const border = conn ? C.green : sel ? C.hi : C.line2;
          return (
            <div
              key={n.id}
              onClick={onNodeClick ? () => onNodeClick(n.id) : undefined}
              style={{
                position: "absolute", left: p.x, top: p.y, width: NW, height: NH, boxSizing: "border-box",
                borderRadius: 7, padding: "9px 11px 9px 13px", background: C.raised, border: `1px solid ${border}`,
                cursor: onNodeClick ? "pointer" : "default", display: "flex", flexDirection: "column", justifyContent: "space-between",
                boxShadow: sel || conn ? `0 0 0 3px ${conn ? "rgba(20,241,149,.16)" : "rgba(232,235,240,.10)"}` : "none",
                transition: "border-color .15s, box-shadow .15s",
              }}
            >
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: c, borderRadius: "7px 0 0 7px" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 500, fontSize: 12, color: C.hi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: 1 }}>{n.title}</span>
                <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 500, fontSize: 9, letterSpacing: ".06em", color: c, flex: "none", marginLeft: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 1, background: c }} />{n.statusShort}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span className="mono" style={{ fontWeight: 600, fontSize: 17, letterSpacing: "-.02em", color: C.hi }}>{n.allocStr}</span>
                <span className="mono" style={{ fontSize: 9, color: C.dim }}>USDC</span>
              </div>
              <div className="mono" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: C.dim, whiteSpace: "nowrap", overflow: "hidden" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>N{n.label} · {n.agentStr}</span>
                <span style={{ flex: "none", marginLeft: 6 }}>T{n.tier}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
