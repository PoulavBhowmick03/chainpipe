"use client";

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { Adapter } from "@solana/wallet-adapter-base";
import { SOLANA_RPC } from "./config";
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Solana wallet context — replaces the EVM `WalletContext` (MetaMask / viem).
 * Wallet Standard auto-detects Phantom / Solflare / Backpack, so the explicit
 * adapter list can stay empty. Wrap the app root with this in `app/layout.tsx`:
 *
 *   <SolanaWalletProvider><App/></SolanaWalletProvider>
 *
 * Consumers use `useWallet()` / `useConnection()` from @solana/wallet-adapter-react
 * and sign the ed25519 payment authorization with `signMessage` (see SDK
 * canonicalPaymentMessage) instead of EIP-712 `signTypedData`.
 */
export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => SOLANA_RPC, []);
  const wallets = useMemo<Adapter[]>(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
