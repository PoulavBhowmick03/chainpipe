"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { C, short } from "@/lib/theme";

// Canonical opener (handles the modal + wallet selection reliably); ssr:false
// because it touches window. Styled inline to match the v2 button.
const WalletModalButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletModalButton),
  { ssr: false, loading: () => <span style={{ width: 120 }} /> }
);

const links = [
  { href: "/bazaar", label: "Bazaar", match: ["/bazaar", "/agent"] },
  { href: "/pipeline/create", label: "Create", match: ["/pipeline/create"] },
  { href: "/work", label: "Work", match: ["/work"] },
  { href: "/my/pipelines", label: "Pipelines", match: ["/my/pipelines", "/pipeline/"] },
  { href: "/my/stake", label: "Stake", match: ["/my/stake"] },
];

export function NavBar() {
  const pathname = usePathname() || "/";
  const { publicKey, disconnect } = useWallet();
  const { connection } = useConnection();
  const [role, setRole] = useState<"consumer" | "agent">("consumer");
  const [slot, setSlot] = useState<number | null>(null);

  // Live slot readout — the heartbeat of the control room.
  useEffect(() => {
    let alive = true;
    const tick = () => connection.getSlot("confirmed").then((s) => alive && setSlot(s)).catch(() => {});
    tick();
    const id = setInterval(tick, 10_000);
    return () => { alive = false; clearInterval(id); };
  }, [connection]);

  const isActive = (m: string[]) =>
    m.some((p) => (p === "/pipeline/create" ? pathname === p : pathname === p || pathname.startsWith(p)));

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(7,9,13,.86)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${C.line}` }}>
      <div className="max-w-[1260px] mx-auto" style={{ padding: "0 22px", height: 54, display: "flex", alignItems: "center", gap: 18 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", color: C.hi, flex: "none" }}>
          <span style={{ width: 18, height: 18, border: `1.5px solid ${C.hi}`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ width: 5, height: 5, background: C.green, borderRadius: 1 }} />
          </span>
          <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-.01em" }}>ChainPipe</span>
          <span className="mono" style={{ fontWeight: 500, fontSize: 9, letterSpacing: ".1em", color: C.dim, border: `1px solid ${C.line}`, borderRadius: 4, padding: "2px 5px" }}>DEVNET</span>
        </Link>

        <nav style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 8 }}>
          {links.map((l) => {
            const on = isActive(l.match);
            return (
              <Link key={l.href} href={l.href} style={{ padding: "6px 11px", borderRadius: 6, background: on ? C.raised : "transparent", color: on ? C.hi : C.dim, fontWeight: 500, fontSize: 13, textDecoration: "none" }}>
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        <div className="mono" title="Current devnet slot" style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.line}`, background: C.bg }}>
          <span className={slot ? "cp-blink" : ""} style={{ width: 5, height: 5, borderRadius: "50%", background: slot ? C.green : C.faint }} />
          <span style={{ fontSize: 11, color: C.dim, letterSpacing: ".04em" }}>{slot ? slot.toLocaleString() : "—"}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.line}`, borderRadius: 7, overflow: "hidden" }}>
          {(["consumer", "agent"] as const).map((r) => (
            <button key={r} onClick={() => setRole(r)} style={{ padding: "6px 12px", border: "none", background: role === r ? C.raised : "transparent", color: role === r ? C.hi : C.dim, fontWeight: 500, fontSize: 12, cursor: "pointer", textTransform: "capitalize" }}>
              {r}
            </button>
          ))}
        </div>

        {publicKey ? (
          <button onClick={() => disconnect()} className="mono" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 11px", borderRadius: 7, border: `1px solid ${C.line}`, background: C.panel, color: C.hi, fontWeight: 500, fontSize: 12, cursor: "pointer" }}>
            <span className="cp-blink" style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
            {short(publicKey.toBase58())}
          </button>
        ) : (
          <WalletModalButton
            style={{ height: "auto", lineHeight: 1, padding: "8px 14px", borderRadius: 7, border: `1px solid ${C.hi}`, background: C.hi, color: C.bg0, fontWeight: 600, fontSize: 12, fontFamily: "var(--font-geist)" }}
          >
            Connect wallet
          </WalletModalButton>
        )}
      </div>
    </header>
  );
}
