import { C, statusColor, tierLabel } from "@/lib/theme";

/** Tier badge: ascending bars filled up to the tier (lit) + label. */
export function TierBadge({ tier }: { tier: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 10 }}>
        {[0, 1, 2].map((i) => {
          const on = i < tier;
          return (
            <span
              key={i}
              style={{
                width: 3,
                height: 4 + i * 3,
                background: on ? C.hi : C.line2,
                borderRadius: 1,
                boxShadow: on ? "0 0 5px rgba(232,235,240,.35)" : "none",
              }}
            />
          );
        })}
      </span>
      <span className="mono" style={{ fontWeight: 500, fontSize: 11, color: tier ? C.hi : C.dim }}>{tierLabel(tier)}</span>
    </span>
  );
}

/** Outcome tape: settled = full-height green bar, failed = half-height red bar — a seismograph strip. */
export function OutcomeTape({ seq, width = 84, height = 14 }: { seq: boolean[]; width?: number | string; height?: number }) {
  const n = seq.length || 1;
  const gap = 2;
  const numericW = typeof width === "number" ? width : 0;
  const bw = typeof width === "number" ? Math.max(1.5, (numericW - (n - 1) * gap) / n) : `calc((100% - ${(n - 1) * gap}px) / ${n})`;
  return (
    <span style={{ display: typeof width === "number" ? "inline-flex" : "flex", alignItems: "flex-end", gap, height, width: typeof width === "number" ? undefined : width }}>
      {seq.map((ok, i) => (
        <span
          key={i}
          style={{
            width: bw,
            height: ok ? height : Math.round(height * 0.5),
            background: ok ? C.green : C.red,
            opacity: ok ? 0.85 : 1,
            borderRadius: 0.5,
            boxShadow: ok ? "0 0 4px rgba(20,241,149,.3)" : "0 0 4px rgba(255,91,91,.4)",
          }}
        />
      ))}
    </span>
  );
}

/**
 * Reputation gauge — a backlit linear meter. A recessed track, an illuminated fill
 * up to the score, quartile ticks etched into it, and a glowing marker head.
 */
export function Gauge({ score, width }: { score: number; width?: number | string }) {
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const col = score >= 75 ? C.green : score >= 50 ? C.hi : C.amber;
  return (
    <div style={{ width: width ?? "100%" }}>
      <div style={{ position: "relative", height: 8, background: C.bg0, borderRadius: 4, boxShadow: "inset 0 1px 2px rgba(0,0,0,.6)", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: pct * 100 + "%",
            background: `linear-gradient(90deg, ${col}22, ${col})`,
            boxShadow: `0 0 12px ${col}66`,
          }}
        />
        {[25, 50, 75].map((t) => (
          <div key={t} style={{ position: "absolute", left: t + "%", top: 0, bottom: 0, width: 1, background: "rgba(7,9,13,.8)" }} />
        ))}
        <div style={{ position: "absolute", left: `calc(${pct * 100}% - 1px)`, top: -3, width: 2, height: 14, background: col, borderRadius: 1, boxShadow: `0 0 8px ${col}` }} />
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
      <span style={{ width: 7, height: 7, borderRadius: 1, background: c, boxShadow: `0 0 6px ${c}88` }} />
      {label}
    </span>
  );
}

/** Instrument readout strip: a row of labelled mono figures separated by hairlines. */
export function StatStrip({ items }: { items: { label: string; value: string; color?: string }[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 0 }}>
      {items.map((m, i) => (
        <div key={m.label} style={{ padding: "0 22px", borderLeft: i === 0 ? "none" : `1px solid ${C.line}` }}>
          <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".12em", color: C.dim, marginBottom: 6 }}>{m.label}</div>
          <div className="mono" style={{ fontWeight: 500, fontSize: 20, letterSpacing: "-.02em", color: m.color ?? C.hi }}>{m.value}</div>
        </div>
      ))}
    </div>
  );
}
