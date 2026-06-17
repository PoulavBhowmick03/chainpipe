export interface SolanaPaymentDetails {
  scheme: "solana-ed25519";
  cluster: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string; // provider base58
  maxTimeoutSeconds: number;
  asset: string; // SPL mint base58
  skillId: number;
}

export interface PaymentAuthorization {
  consumer: string;
  provider: string;
  mint: string;
  amount: string;
  skillId: number;
  jobId: number;
  nonce: number;
  validBefore: number;
}

export interface SolanaPaymentProof {
  scheme: "solana-ed25519";
  cluster: string;
  authorization: PaymentAuthorization;
  signature: string; // ed25519 detached signature, base58
  reputationScore?: number;
}

export interface SettlementResult {
  settlementSignature: string;
  completeJobSignature: string;
  jobId: number;
  reputationSignature?: string;
  reputationScore: number;
}

export interface FacilitateResponse {
  success: boolean;
  settlementSignature?: string;
  accessToken?: string;
  jobId?: number;
  completeJobSignature?: string;
  reputationSignature?: string;
  reputationScore?: number;
  error?: string;
}
