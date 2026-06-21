"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import "@solana/wallet-adapter-react-ui/styles.css";
import { RPC_URL } from "@/lib/chainpipe";

// ── Role (Consumer ⇄ Agent) — a real, persisted mode that drives the whole app ──
export type Role = "consumer" | "agent";
const RoleCtx = createContext<{ role: Role; setRole: (r: Role) => void }>({ role: "consumer", setRole: () => {} });
export const useRole = () => useContext(RoleCtx);

function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>("consumer");
  useEffect(() => {
    const saved = (typeof window !== "undefined" && window.localStorage.getItem("cp_role")) as Role | null;
    if (saved === "consumer" || saved === "agent") setRoleState(saved);
  }, []);
  const setRole = (r: Role) => { setRoleState(r); try { window.localStorage.setItem("cp_role", r); } catch {} };
  return <RoleCtx.Provider value={{ role, setRole }}>{children}</RoleCtx.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  // Installed wallets register via the Wallet Standard and are auto-detected; the explicit
  // Phantom/Solflare adapters are a fallback so the modal never dead-ends with an empty list
  // when nothing is detected (the user still gets install prompts). wallet-adapter dedupes a
  // Standard-detected wallet against its explicit adapter, so installed Phantom shows once and
  // connects. autoConnect reconnects a previously-authorized wallet without re-prompting.
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <RoleProvider>{children}</RoleProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
