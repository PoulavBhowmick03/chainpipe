// Decision functions per agent. Pure, no I/O. Configurable thresholds
// passed in rather than read from env (the terminal agents read from env;
// the browser uses fixed sensible defaults).

import {
  pickmarginfiSupplyApy,
  pickGasUsd,
  pickPoolApr,
  type SwapPreviewDistilled,
} from "./parsers";

export type ScoutAction = "ENTER_POOL" | "STAY";

export interface ScoutDecision {
  action: ScoutAction;
  reason: string;
  confidence: number;
  topPoolApr?: number;
  marginfiSupplyApy?: number;
  gasUsd?: number;
  /** Set when the runner has paid for the swap-preview step and decoded it. */
  swap?: SwapPreviewDistilled;
}

export interface ScoutThresholds {
  minAprDeltaPct: number;
  maxGasUsd: number;
  fallbackMntPriceUsd: number;
}

export const SCOUT_DEFAULTS: ScoutThresholds = {
  minAprDeltaPct: 5,
  maxGasUsd: 1,
  fallbackMntPriceUsd: 0.7,
};

export function decideScout(
  inputs: { topPools: unknown; marginfiRates: unknown; gas: unknown },
  thresholds: ScoutThresholds = SCOUT_DEFAULTS,
): ScoutDecision {
  const { apr: poolApr } = pickPoolApr(inputs.topPools);
  const marginfiApy = pickmarginfiSupplyApy(inputs.marginfiRates);
  const gasUsd = pickGasUsd(inputs.gas, thresholds.fallbackMntPriceUsd);

  const apr = Number.isFinite(poolApr) ? poolApr : 0;
  const apy = Number.isFinite(marginfiApy) ? marginfiApy : 0;
  const gas = Number.isFinite(gasUsd) ? gasUsd : 0;
  const delta = apr - apy;

  const stay = (reason: string, confidence: number): ScoutDecision => ({
    action: "STAY",
    reason,
    confidence,
    topPoolApr: apr,
    marginfiSupplyApy: apy,
    gasUsd: gas,
  });

  if (!Number.isFinite(poolApr) || apr === 0) {
    return stay("Could not read a top-pool APR from orca-pool-analysis.", 40);
  }
  if (delta < thresholds.minAprDeltaPct) {
    return stay(
      `Top Orca APR (${apr.toFixed(2)}%) is only ${delta.toFixed(2)}pp above marginfi USDC supply APY (${apy.toFixed(2)}%), below ${thresholds.minAprDeltaPct}pp threshold.`,
      72,
    );
  }
  if (gas > thresholds.maxGasUsd) {
    return stay(
      `Gas cost ($${gas.toFixed(2)}) too high vs expected near-term yield differential.`,
      66,
    );
  }
  return {
    action: "ENTER_POOL",
    reason: `Top Orca pool yields ${apr.toFixed(2)}% vs marginfi USDC ${apy.toFixed(2)}% (delta ${delta.toFixed(2)}pp). Gas ${gas.toFixed(2)} USD is negligible. Recommend rotating.`,
    confidence: 85,
    topPoolApr: apr,
    marginfiSupplyApy: apy,
    gasUsd: gas,
  };
}
