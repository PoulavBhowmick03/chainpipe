/**
 * Quality score heuristic. The dag_escrow EMA is additive
 * (new = clamp(old + alpha·delta)), so we return a per-job delta in
 * [200, 1000]: the more deadline headroom remained at settlement, the higher
 * the delta. This is intentionally simple — the facilitator verifies on-chain
 * state, not output quality.
 */
export function scoreDelta(currentSlot: number, deadlineSlot: number): number {
  const remaining = Math.max(0, deadlineSlot - currentSlot);
  // Assume a nominal 3000-slot (~20 min) window for normalization.
  const frac = Math.min(1, remaining / 3000);
  return Math.round(200 + frac * 800);
}
