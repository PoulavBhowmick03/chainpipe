import { C, statusColor, tierLabel } from "@/lib/theme";

/** Tier badge: ascending bars filled up to the tier + label. */
export function TierBadge({ tier }: { tier: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 10 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 3, height: 4 + i * 3, background: i < tier ? C.hi : C.line2, borderRadius: 1 }} />
        ))}
      </span>
      <span className="mono" style={{ fontWeight: 500, fontSize: 11, color: tier ? C.hi : C.dim }}>{tierLabel(tier)}</span>
    </span>
  );
}

/** Outcome tape: settled = full-height green bar, failed = half-height red bar. */
export function OutcomeTape({ seq, width = 84, height = 14 }: { seq: boolean[]; width?: number | string; height?: number }) {
  const n = seq.length || 1;
  const gap = 2;
  const numericW = typeof width === "number" ? width : 0;
  const bw = typeof width === "number" ? Math.max(1.5, (numericW - (n - 1) * gap) / n) : `calc((100% - ${(n - 1) * gap}px) / ${n})`;
  return (
    <span style={{ display: typeof width === "number" ? "inline-flex" : "flex", alignItems: "flex-end", gap, height, width: typeof width === "number" ? undefined : width }}>
      {seq.map((ok, i) => (
        <span key={i} style={{ width: bw, height: ok ? height : Math.round(height * 0.5), background: ok ? C.green : C.red, opacity: ok ? 0.8 : 1, borderRadius: 0.5 }} />
      ))}
    </span>
  );
}

/** Linear reputation gauge with quartile ticks and a colored marker. */
export function Gauge({ score, width }: { score: number; width?: number | string }) {
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const col = score >= 75 ? C.green : score >= 50 ? C.hi : C.amber;
  return (
    <div style={{ width: width ?? "100%" }}>
      <div style={{ position: "relative", height: 6, background: C.line, borderRadius: 3 }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct * 100 + "%", background: C.line2, borderRadius: 3 }} />
        {[25, 50, 75].map((t) => (
          <div key={t} style={{ position: "absolute", left: t + "%", top: 1, bottom: 1, width: 1, background: C.bg0 }} />
        ))}
        <div style={{ position: "absolute", left: `calc(${pct * 100}% - 1px)`, top: -4, width: 2, height: 14, background: col, borderRadius: 1, boxShadow: `0 0 6px ${col}99` }} />
      </div>
      <div className="mono" style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 9, color: C.faint }}>
        <span>0</span><span>50</span><span>100</span>
      </div>
    </div>
  );
}

/** Segmented status bar across a pipeline's nodes. */
export function SegBar({ statuses }: { statuses: string[] }) {
  return (
    <span style={{ display: "flex", gap: 2, height: 4, width: "100%", maxWidth: 160 }}>
      {statuses.map((st, i) => (
        <span key={i} style={{ flex: 1, background: statusColor(st), opacity: st === "pending" ? 0.3 : 0.9, borderRadius: 1 }} />
      ))}
    </span>
  );
}

/** Status dot + uppercase label. */
export function StatusTag({ status, label }: { status: string; label: string }) {
  const c = statusColor(status);
  return (
    <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 500, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: c }}>
      <span style={{ width: 7, height: 7, borderRadius: 1, background: c }} />
      {label}
    </span>
  );
}
