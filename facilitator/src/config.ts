import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export const RPC_URL = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
export const CLUSTER = process.env.SOLANA_CLUSTER ?? "devnet";

export const connection = new Connection(RPC_URL, "confirmed");

export const PROGRAM_IDS = {
  skillRegistry: new PublicKey(
    process.env.SKILL_REGISTRY_PROGRAM ?? "26Xf7wEPJbG6EJ5kfAXbkot75ekSWdvpJH2rws1DEaEF",
  ),
  x402Escrow: new PublicKey(
    process.env.X402_ESCROW_PROGRAM ?? "Ec48mwadrna8FC5rJ24K5R5fMVCBFBzhbbeFkf6skiYq",
  ),
  bazaarListings: new PublicKey(
    process.env.BAZAAR_LISTINGS_PROGRAM ?? "HnnH4asvgvAqyBnZKD6SVPMHEwTPTEBq2ZYU995j4Jt3",
  ),
} as const;

export const FACILITATOR_FEE_BPS = parseInt(process.env.FACILITATOR_FEE_BPS ?? "20");
export const PORT = parseInt(process.env.FACILITATOR_PORT ?? "3001");

// Devnet cUSD-equivalent / USDC allowlist (verify before mainnet).
export const ALLOWED_MINTS = new Set(
  (process.env.ALLOWED_MINTS ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),
);

/**
 * Operator (facilitator) signer. Accepts either a base58 secret key or a JSON
 * byte array (Solana CLI id.json format) in SOLANA_OPERATOR_SECRET.
 */
function _loadOperator(): Keypair {
  const raw = process.env.SOLANA_OPERATOR_SECRET;
  if (!raw) throw new Error("SOLANA_OPERATOR_SECRET not set");
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed) as number[]));
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

let _operator: Keypair | undefined;
export function getOperatorKeypair(): Keypair {
  return (_operator ??= _loadOperator());
}

// Serializes all on-chain writes so concurrent /facilitate and /score requests
// never collide on the same recent blockhash / account writes.
let _writeQueue: Promise<unknown> = Promise.resolve();
export function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = _writeQueue.then(() => fn());
  _writeQueue = next.catch(() => undefined);
  return next;
}
