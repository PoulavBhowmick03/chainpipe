"use client";

import { useEffect, useRef } from "react";
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

  // Subtle pointer tilt — the node field reads as a physical plane. Reduced-motion safe.
  const wrap = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const w = wrap.current, f = field.current;
    if (!w || !f) return;
    let raf = 0, rx = 0, ry = 0;
    const apply = () => { raf = 0; f.style.transform = `perspective(1400px) rotateX(${rx}deg) rotateY(${ry}deg)`; };
    const onMove = (e: PointerEvent) => {
      const r = w.getBoundingClientRect();
      ry = ((e.clientX - r.left) / r.width - 0.5) * 3.2;   // ±1.6deg
      rx = ((e.clientY - r.top) / r.height - 0.5) * -2.4;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => { rx = 0; ry = 0; if (!raf) raf = requestAnimationFrame(apply); };
    w.addEventListener("pointermove", onMove);
    w.addEventListener("pointerleave", onLeave);
    return () => { w.removeEventListener("pointermove", onMove); w.removeEventListener("pointerleave", onLeave); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const edges: React.ReactNode[] = [];
  nodes.forEach((n) =>
    (n.deps || []).forEach((d) => {
      if (!pos[d]) return;
      const a = pos[d], b = pos[n.id];
      const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
      const path = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      const srcSettled = byId[d].status === "settled";
      const tgtBad = n.status === "expired" || n.status === "refunded";
      const live = srcSettled && !tgtBad;
      const col = tgtBad ? C.red : srcSettled ? C.green : C.hi;
      // physical conduit: a faint rounded pipe…
      edges.push(<path key={`${d}-${n.id}p`} d={path} fill="none" stroke={tgtBad ? "rgba(242,85,90,.16)" : live ? "rgba(20,241,149,.14)" : C.line} strokeWidth={5} strokeLinecap="round" />);
      // …with the conducting line inside…
      edges.push(<path key={`${d}-${n.id}b`} d={path} fill="none" stroke={col} strokeWidth={1.25} opacity={tgtBad ? 0.8 : srcSettled ? 1 : 0.7} />);
      // …and value flowing through it (forward oxblood on settle, reverse red on cascade).
      if (live)
        edges.push(<path key={`${d}-${n.id}f`} className="cp-flow" d={path} fill="none" stroke="url(#cpFlowG)" strokeWidth={2} strokeDasharray="4 10" strokeLinecap="round" />);
      if (tgtBad)
        edges.push(<path key={`${d}-${n.id}r`} className="cp-flow" d={path} fill="none" stroke="#C98A8A" strokeWidth={1.5} strokeDasharray="4 8" style={{ animationDirection: "reverse" }} />);
      edges.push(<circle key={`${d}-${n.id}d`} cx={x2} cy={y2} r={2.5} fill={col} />);
    })
  );

  return (
    <div ref={wrap} className="dag-scroll" style={{ overflowX: "auto", overflowY: "hidden", flex: 1, minWidth: 0, minHeight: height }}>
      <div
        ref={field}
        style={{
          position: "relative",
          width: W,
          height: H,
          minWidth: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 220ms cubic-bezier(.2,.8,.2,1)",
          backgroundImage: `radial-gradient(circle at 1px 1px, ${C.line}66 1px, transparent 0)`,
          backgroundSize: "22px 22px",
        }}
      >
        <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
          <defs>
            <linearGradient id="cpFlowG" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#14F195" stopOpacity="0.15" />
              <stop offset="0.5" stopColor="#14F195" stopOpacity="1" />
              <stop offset="1" stopColor="#14F195" stopOpacity="0.4" />
            </linearGradient>
            <filter id="cpGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {edges}
        </svg>
        {nodes.map((n) => {
          const p = pos[n.id], c = statusColor(n.status);
          const sel = selId === n.id, conn = connectFrom === n.id;
          const settled = n.status === "settled";
          const border = conn ? C.green : sel ? C.green : settled ? C.green : C.hi;
          return (
            <div
              key={n.id}
              onClick={onNodeClick ? () => onNodeClick(n.id) : undefined}
              style={{
                position: "absolute", left: p.x, top: p.y, width: NW, height: NH, boxSizing: "border-box",
                borderRadius: 2, padding: "9px 11px 9px 13px",
                background: sel || conn ? C.bg : C.panel, border: `1px solid ${border}`,
                cursor: onNodeClick ? "pointer" : "default", display: "flex", flexDirection: "column", justifyContent: "space-between",
                boxShadow: sel || conn ? `0 0 0 2px ${conn ? "rgba(20,241,149,.22)" : "rgba(20,241,149,.16)"}` : "none",
                transition: "border-color .15s, box-shadow .15s, background .15s",
              }}
            >
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: c }} />
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
