export const usdc = (base: string | number | bigint): string => {
  const n = typeof base === "bigint" ? base : BigInt(Math.trunc(Number(base)));
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `${whole.toString()}.${frac}`;
};

export const shortKey = (k: string, n = 4): string =>
  k.length > n * 2 ? `${k.slice(0, n)}…${k.slice(-n)}` : k;

export const tierLabel = (t: number): string => (t === 0 ? "Unregistered" : `Tier ${t}`);

export const ema = (score: number): string => (score / 100).toFixed(1);

export const statusKey = (status: Record<string, unknown> | undefined): string =>
  status ? Object.keys(status)[0] ?? "unknown" : "unknown";
