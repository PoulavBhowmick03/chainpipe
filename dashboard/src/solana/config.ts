import { PublicKey } from "@solana/web3.js";

export const SOLANA_CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
export const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";

export const PROGRAM_IDS = {
  skillRegistry: new PublicKey("26Xf7wEPJbG6EJ5kfAXbkot75ekSWdvpJH2rws1DEaEF"),
  x402Escrow: new PublicKey("Ec48mwadrna8FC5rJ24K5R5fMVCBFBzhbbeFkf6skiYq"),
  bazaarListings: new PublicKey("HnnH4asvgvAqyBnZKD6SVPMHEwTPTEBq2ZYU995j4Jt3"),
} as const;

export const TOKENS = {
  // Devnet USDC (verify before mainnet — see DEPLOY.md).
  USDC: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
} as const;

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${SOLANA_CLUSTER}`;
}

export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=${SOLANA_CLUSTER}`;
}
