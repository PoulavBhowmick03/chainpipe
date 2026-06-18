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
