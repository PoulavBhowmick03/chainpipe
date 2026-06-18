import type { PaymentAuthorization } from "./types.js";

const DEFAULT_USDC_DECIMALS = 6;

export function formatTokenAmount(
  amount: bigint | string | number,
  decimals: number = DEFAULT_USDC_DECIMALS,
): string {
  const v = BigInt(amount);
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function buildQuery(record: Record<string, string | number | boolean>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    params.set(key, String(value));
  }
  return params.toString();
}

export function explorerTxUrl(signature: string, cluster: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

export function explorerAddressUrl(address: string, cluster: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}

/**
 * Canonical, deterministic byte encoding of a payment authorization. Both the SDK
 * (signing) and the facilitator (verifying) MUST produce identical bytes — newline-
 * delimited fixed field order, UTF-8. Replaces the Solana ed25519 signed message.
 */
export function canonicalPaymentMessage(
  auth: PaymentAuthorization,
  domain: string,
  version: string,
): Uint8Array {
  const lines = [
    domain,
    version,
    auth.consumer,
    auth.provider,
    auth.mint,
    auth.amount,
    String(auth.skillId),
    String(auth.jobId),
    String(auth.nonce),
    String(auth.validBefore),
  ];
  return new TextEncoder().encode(lines.join("\n"));
}

export class LedgerForgeError extends Error {
  readonly code: string;
  readonly cause?: unknown;
  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = "LedgerForgeError";
    this.code = code;
    this.cause = cause;
  }
}
