import { PublicKey } from "@solana/web3.js";

/** Program + mint addresses ChainPipe operates against. */
export interface ChainPipeAddresses {
  bondedRegistry: PublicKey;
  dagEscrow: PublicKey;
  reputationBridge: PublicKey;
  /** SPL mint used for stake + pipeline payments (6 decimals, e.g. USDC). */
  usdcMint: PublicKey;
}

/** Live devnet deployment (see DEPLOYED.md). */
export const DEVNET_ADDRESSES: ChainPipeAddresses = {
  bondedRegistry: new PublicKey("26AB6S5crQAkhfx928bnWSHfpQE6wp2Sdt4afFtk7crq"),
  dagEscrow: new PublicKey("3FqvkzppD4ciwkGLrcNoTHUCeHwNbWtot18CkrBdXiJd"),
  reputationBridge: new PublicKey("6RRfs1Ho1bJ3JWXSy3xVth4BTGHWwVwum74ph2LRWWsf"),
  // Circle devnet USDC. Override with your own mint for local/seeded runs.
  usdcMint: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
};

export const TIER1_MIN = 10_000_000n; // 10 USDC
export const TIER2_MIN = 100_000_000n; // 100 USDC
export const TIER3_MIN = 1_000_000_000n; // 1000 USDC
