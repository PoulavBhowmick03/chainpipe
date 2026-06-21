"use client";

import { C } from "@/lib/theme";

/**
 * Dispute-window countdown — a depleting segmented gauge (fuel-cell strip) that
 * drains left→right and shifts green → amber → red as it nears zero. Presentational:
 * the parent supplies `remaining`/`total` in slots and refreshes them.
 */
export function DisputeTimer({
  remaining,
  total,
  segments = 16,
  slotMs = 400,
}: {
  remaining: number;
  total: number;
  segments?: number;
  slotMs?: number;
}) {
  const rem = Math.max(0, remaining);
  const ratio = total > 0 ? Math.min(1, rem / total) : 0;
  const lit = Math.ceil(ratio * segments);
  const col = ratio > 0.5 ? C.green : ratio > 0.2 ? C.amber : C.red;
  const secs = Math.max(0, Math.round((rem * slotMs) / 1000));
  const closed = rem <= 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ display: "flex", gap: 2, alignItems: "center" }} aria-hidden>
        {Array.from({ length: segments }).map((_, i) => {
          const on = i < lit && !closed;
          return (
            <span
              key={i}
              style={{
                width: 4,
                height: 12,
                borderRadius: 1,
                background: on ? col : C.line,
                boxShadow: on ? `0 0 6px ${col}77` : "none",
                transition: "background 200ms var(--ease), box-shadow 200ms var(--ease)",
              }}
            />
          );
        })}
      </div>
      <span className="mono" style={{ fontSize: 11, fontWeight: 500, color: closed ? C.dim : col, letterSpacing: ".02em" }}>
        {closed ? "window closed" : `~${secs}s · ${rem} slots`}
      </span>
    </div>
  );
}
