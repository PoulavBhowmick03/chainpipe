"use client";

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
// Individual adapters — NOT the @solana/wallet-adapter-wallets meta-package, which
// transitively bundles WalletConnect → viem → ox (an EVM lib we must not ship).
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import "@solana/wallet-adapter-react-ui/styles.css";
import { RPC_URL } from "@/lib/chainpipe";

export function Providers({ children }: { children: ReactNode }) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );
  return (
    // No autoConnect: wallet detection (and any native-app deep-link permission
    // prompt the wallet libraries trigger) only runs when the user explicitly
    // clicks "Connect", instead of probing for wallet apps on page load.
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
