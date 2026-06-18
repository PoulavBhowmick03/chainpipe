import { PublicKey } from "@solana/web3.js";

export const SOLANA_CLUSTER = "devnet";
export const DEVNET_RPC = "https://api.devnet.solana.com";

// Program IDs (match declare_id! in solana/programs/*).
export const PROGRAM_IDS = {
  skillRegistry: new PublicKey("26Xf7wEPJbG6EJ5kfAXbkot75ekSWdvpJH2rws1DEaEF"),
  x402Escrow: new PublicKey("Ec48mwadrna8FC5rJ24K5R5fMVCBFBzhbbeFkf6skiYq"),
  bazaarListings: new PublicKey("HnnH4asvgvAqyBnZKD6SVPMHEwTPTEBq2ZYU995j4Jt3"),
} as const;

// Circle devnet USDC mint (verify against current devnet before mainnet — see DEPLOY.md).
export const TOKENS = {
  USDC: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
} as const;

export const DEFAULTS = {
  bazaarUrl: "https://ledgerforge-indexer.fly.dev",
  facilitatorUrl: "https://ledgerforge-facilitator.fly.dev",
  rpcUrl: DEVNET_RPC,
  cluster: SOLANA_CLUSTER,
} as const;

// ed25519 payment-authorization domain (replaces the Solana ed25519 domain).
export const PAYMENT_DOMAIN = "LedgerForge-Solana";
export const PAYMENT_VERSION = "1";

// PDA seed prefixes (match the Anchor programs).
export const SEED_CONFIG = "config";
export const SEED_JOB = "job";
export const SEED_SKILL = "skill";
export const SEED_LISTING = "listing";
