// Settlement Broadsheet design tokens. Semantic slots are unchanged so every inline
// `C.*` reference across the app remaps in place; the values are now "Paper & Ink".
//   bg0  = linen page base (and light text on ink/oxblood buttons)
//   bg   = paper-dim inset (table headers, chips)
//   panel/raised = paper surfaces
//   line/line2   = mist hairlines
//   hi   = obsidian ink (primary text + solid-button fill)
//   tx/dim/faint = warm-gray metadata, descending
//   green = oxblood — THE accent (value, active, settled, primary CTA)
//   blue  = tertiary teal (claimed / in-progress)
//   red   = true error (expired / dispute)   amber = muted ochre (refunded / warning)
export const C = {
  bg0: "#100C0C",
  bg: "#1B1413",
  panel: "#17110F",
  raised: "#211917",
  line: "#2C2421",
  line2: "#3C322D",
  hi: "#F1ECE5",
  tx: "#D8D0C6",
  dim: "#ADA298",
  faint: "#857C72",
  green: "#14F195",
  blue: "#B07CFF",
  red: "#F2555A",
  amber: "#D69A4E",
} as const;

/** USDC from 6-decimal base units → "$x.xx" / "$x,xxx". */
export function usd(base: string | number, dec?: number): string {
  const n = Number(base) / 1e6;
  if (dec != null) return "$" + n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  if (n >= 1000) return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return "$" + n.toFixed(2);
}

/** Compact USDC ($1.5k, $284.50M). */
export function usdC(base: string | number): string {
  const n = Number(base) / 1e6;
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "k";
  return "$" + n.toFixed(0);
}

export const short = (a?: string | null) => (a ? a.slice(0, 4) + "…" + a.slice(-4) : "—");
export const tierLabel = (t: number) => (t === 0 ? "—" : "T" + t);

export type NodeStatus = "pending" | "claimed" | "settled" | "expired" | "refunded";

export const statusColor = (s: string): string =>
  ({ pending: C.dim, claimed: C.blue, settled: C.green, expired: C.red, refunded: C.amber } as Record<string, string>)[s] ?? C.dim;

export const pipelineColor = (s: string): string =>
  ({ active: C.green, completed: C.blue, partiallyRefunded: C.amber, cancelled: C.dim } as Record<string, string>)[s] ?? C.dim;

export const pipelineLabel = (s: string): string =>
  ({ active: "active", completed: "completed", partiallyRefunded: "partially refunded", cancelled: "cancelled" } as Record<string, string>)[s] ?? s;

/** Deterministic outcome tape: n cells, ~failed/total marked as failures, spread out. */
export function tapeSeq(settled: number, failed: number, n: number): boolean[] {
  const total = settled + failed;
  if (!total) return Array(n).fill(true);
  const fails = Math.min(n - 1, Math.round((n * failed) / total));
  const arr = Array(n).fill(true);
  if (fails > 0) {
    const stride = n / fails;
    for (let k = 0; k < fails; k++) {
      let pos = Math.floor(k * stride + (k % 2 ? 1 : 2)) % n;
      pos = Math.max(0, Math.min(n - 3, pos));
      arr[pos] = false;
    }
  }
  return arr;
}
