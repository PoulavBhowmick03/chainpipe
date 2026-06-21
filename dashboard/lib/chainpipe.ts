import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import {
  bondedRegistryIdl,
  dagEscrowIdl,
  reputationBridgeIdl,
  DEVNET_ADDRESSES,
  ChainPipeAddresses,
  type BondedRegistry,
  type DagEscrow,
  type ReputationBridge,
} from "@/lib/sdk";

export const ADDRESSES: ChainPipeAddresses = {
  ...DEVNET_ADDRESSES,
  usdcMint: process.env.NEXT_PUBLIC_USDC_MINT
    ? new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT)
    : DEVNET_ADDRESSES.usdcMint,
};

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
export const FACILITATOR_URL =
  process.env.NEXT_PUBLIC_FACILITATOR_URL ?? "http://localhost:3001";

function withAddress<T>(idl: unknown, address: string): T {
  return { ...(idl as Record<string, unknown>), address } as T;
}

export interface Programs {
  provider: AnchorProvider;
  bonded: Program<BondedRegistry>;
  dag: Program<DagEscrow>;
  rep: Program<ReputationBridge>;
}

/** Build the Anchor programs from a connected wallet-adapter wallet. */
export function buildPrograms(connection: Connection, wallet: AnchorWallet): Programs {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const bonded = new Program<BondedRegistry>(
    withAddress<BondedRegistry>(bondedRegistryIdl, ADDRESSES.bondedRegistry.toBase58()),
    provider
  );
  const dag = new Program<DagEscrow>(
    withAddress<DagEscrow>(dagEscrowIdl, ADDRESSES.dagEscrow.toBase58()),
    provider
  );
  const rep = new Program<ReputationBridge>(
    withAddress<ReputationBridge>(reputationBridgeIdl, ADDRESSES.reputationBridge.toBase58()),
    provider
  );
  return { provider, bonded, dag, rep };
}

export const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (addr: string) =>
  `https://explorer.solana.com/address/${addr}?cluster=devnet`;

/**
 * POST JSON to the facilitator with robust failure handling: a dead gateway returns
 * HTML/empty (not JSON), and a thrown fetch means the service is unreachable — both
 * should surface a clean message, never an opaque `Unexpected token <` parse error.
 */
export async function facilitatorPost<T = unknown>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${FACILITATOR_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the facilitator — it may be offline. Try again shortly.");
  }
  const text = await res.text();
  let json: { error?: string; [k: string]: unknown } = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON (gateway error / HTML body) */ }
  if (!res.ok) throw new Error(json.error || `facilitator ${path} failed (${res.status})`);
  return json as T;
}

/**
 * Hash the bytes at a delivery URI via the facilitator (server-side fetch) — a CORS-proof
 * fallback for when the browser can't read an arbitrary cross-origin URL. Returns hex.
 */
export async function hashViaFacilitator(uri: string): Promise<string> {
  const json = await facilitatorPost<{ resultHash: string }>("/hash", { uri });
  if (!json.resultHash) throw new Error("facilitator did not return a hash");
  return json.resultHash;
}
