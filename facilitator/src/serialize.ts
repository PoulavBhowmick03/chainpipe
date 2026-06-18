import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

/** Recursively convert anchor/web3 values (BN, PublicKey, Buffer) to JSON-safe forms. */
export function serialize(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "bigint") return v.toString();
  if (BN.isBN(v)) return (v as BN).toString();
  if (v instanceof PublicKey) return v.toBase58();
  if (Buffer.isBuffer(v)) return Array.from(v);
  if (Array.isArray(v)) return v.map(serialize);
  if (typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>)) {
      o[k] = serialize((v as Record<string, unknown>)[k]);
    }
    return o;
  }
  return v;
}
