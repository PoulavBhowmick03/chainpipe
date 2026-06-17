import type { Keypair } from "@solana/web3.js";

export type BazaarTier = "FREE" | "BASIC" | "PRO";

/** base58-encoded public key */
export type Base58 = string;

export interface SkillListing {
  skillId: number;
  provider: Base58;
  name: string;
  endpoint: string;
  paymentMint: Base58;
  pricePerCall: string;
  totalJobs: number;
  score: number;
  tier: BazaarTier;
  active: boolean;
}

export interface ListSkillsFilter {
  tier?: BazaarTier;
  minScore?: number;
  search?: string;
}

export interface PaymentChallenge {
  scheme: "solana-ed25519";
  cluster: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: Base58; // provider
  asset: Base58; // SPL mint
  skillId: number;
  maxTimeoutSeconds: number;
}

/** Exact-amount authorization the consumer signs with ed25519. */
export interface PaymentAuthorization {
  consumer: Base58;
  provider: Base58;
  mint: Base58;
  amount: string; // u64 as decimal string
  skillId: number;
  jobId: number;
  nonce: number;
  validBefore: number; // unix seconds
}

export interface PaymentProof {
  scheme: "solana-ed25519";
  cluster: string;
  authorization: PaymentAuthorization;
  signature: Base58; // ed25519 detached signature, base58
  reputationScore?: number;
}

export interface SettlementReceipt {
  success: boolean;
  settlementSignature: string;
  accessToken: string;
  explorerUrl: string;
  jobId?: number;
  createJobSignature?: string;
  completeJobSignature?: string;
  reputationSignature?: string;
  reputationScore?: number;
}

export interface InvokeResult<T = unknown> {
  skillId: number;
  skillName: string;
  output: T;
  receipt: SettlementReceipt;
}

export interface LedgerForgeConfig {
  bazaarUrl?: string;
  facilitatorUrl?: string;
  rpcUrl?: string;
  cluster?: string;
  /** consumer signer — pass a Keypair or its 64-byte secret key */
  keypair?: Keypair;
  secretKey?: Uint8Array;
}

export interface CallSkillOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface InvokeOptions extends CallSkillOptions {
  recipient?: Base58;
  amount?: bigint | number | string;
  jobId?: number;
  validForSeconds?: number;
  reputationScore?: number;
}
