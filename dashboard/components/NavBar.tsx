"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { C, short } from "@/lib/theme";
import { CommandPalette } from "@/components/CommandPalette";
import { useRole, type Role } from "@/app/providers";

// Canonical opener (handles the modal + wallet selection reliably); ssr:false
// because it touches window. Styled inline to match the v2 button.
const WalletModalButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletModalButton),
  { ssr: false, loading: () => <span style={{ width: 120 }} /> }
);

// Each link is tagged with the role(s) it belongs to. The Consumer⇄Agent toggle
// filters this list, so flipping the mode visibly reshapes the whole nav.
const links: { href: string; label: string; match: string[]; roles: Role[] }[] = [
  { href: "/bazaar", label: "Bazaar", match: ["/bazaar", "/agent"], roles: ["consumer", "agent"] },
  { href: "/pipeline/create", label: "Create", match: ["/pipeline/create"], roles: ["consumer"] },
  { href: "/my/pipelines", label: "Pipelines", match: ["/my/pipelines", "/pipeline/"], roles: ["consumer"] },
  { href: "/work", label: "Work", match: ["/work"], roles: ["agent"] },
  { href: "/my/stake", label: "Stake", match: ["/my/stake"], roles: ["agent"] },
];

// Where each mode lands you when you flip into it.
const ROLE_HOME: Record<Role, string> = { consumer: "/my/pipelines", agent: "/work" };
// Routes that unambiguously belong to one mode — visiting them flips the toggle to match,
// so the nav and the Consumer/Agent control are never out of sync with where you are.
const roleForPath = (p: string): Role | null =>
  p.startsWith("/work") || p.startsWith("/my/stake") ? "agent"
  : p.startsWith("/pipeline/create") || p.startsWith("/my/pipelines") ? "consumer"
  : null;

export function NavBar() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { publicKey, disconnect } = useWallet();
  const { connection } = useConnection();
  const { role, setRole } = useRole();
  const [slot, setSlot] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Keep the mode in sync with the route: landing on an agent-only page (Work, Stake) shows
  // the Agent nav + Agent toggle, and vice-versa. Shared pages (Bazaar, detail views) leave
  // the current mode untouched.
  useEffect(() => {
    const r = roleForPath(pathname);
    if (r && r !== role) setRole(r);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <>
    <CommandPalette />
    <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(7,9,13,.86)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${C.line}` }}>
      <div className="max-w-[1260px] mx-auto" style={{ padding: "0 22px", height: 54, display: "flex", alignItems: "center", gap: 18 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", color: C.hi, flex: "none" }}>
          <span style={{ width: 18, height: 18, border: `1.5px solid ${C.hi}`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ width: 5, height: 5, background: C.green, borderRadius: 1 }} />
          </span>
          <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-.01em" }}>ChainPipe</span>
          <span className="mono" style={{ fontWeight: 500, fontSize: 9, letterSpacing: ".1em", color: C.dim, border: `1px solid ${C.line}`, borderRadius: 4, padding: "2px 5px" }}>DEVNET</span>
        </Link>

        <nav className="nav-desktop" style={{ alignItems: "center", gap: 2, marginLeft: 8 }}>
          {links.filter((l) => l.roles.includes(role)).map((l) => {
            const on = isActive(l.match);
            return (
              <Link key={l.href} href={l.href} style={{ padding: "6px 11px", borderRadius: 6, background: on ? C.raised : "transparent", color: on ? C.hi : C.dim, fontWeight: 500, fontSize: 13, textDecoration: "none" }}>
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        <div className="nav-desktop" style={{ alignItems: "center", gap: 18 }}>
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="mono"
            title="Command palette (⌘K)"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 7, border: `1px solid ${C.line}`, background: C.bg, color: C.dim, fontSize: 11, cursor: "pointer" }}
          >
            <span style={{ fontSize: 12 }}>⌘</span>K
          </button>

          <div className="mono" title="Current devnet slot" style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.line}`, background: C.bg }}>
            <span className={slot ? "cp-blink" : ""} style={{ width: 5, height: 5, borderRadius: "50%", background: slot ? C.green : C.faint }} />
            <span style={{ fontSize: 11, color: C.dim, letterSpacing: ".04em" }}>{slot ? slot.toLocaleString() : "—"}</span>
          </div>

          <div title="Switch mode — reshapes the nav and takes you to that mode's home" style={{ display: "flex", alignItems: "center", border: `1px solid ${C.line}`, borderRadius: 7, overflow: "hidden" }}>
            {(["consumer", "agent"] as const).map((r) => (
              <button
                key={r}
                onClick={() => { setRole(r); router.push(ROLE_HOME[r]); }}
                title={r === "consumer" ? "Consumer — lock budgets across pipelines" : "Agent — stake and find work"}
                style={{ padding: "6px 12px", border: "none", background: role === r ? C.hi : "transparent", color: role === r ? C.bg0 : C.dim, fontWeight: 600, fontSize: 12, cursor: "pointer", textTransform: "capitalize" }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* mobile: a compact menu trigger replaces the inline links/chips */}
        <button
          className="nav-mobile"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          style={{ alignItems: "center", justifyContent: "center", width: 38, height: 34, borderRadius: 7, border: `1px solid ${C.line}`, background: menuOpen ? C.raised : C.bg, color: C.hi, cursor: "pointer", flex: "none", padding: 0 }}
        >
          <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ width: 15, height: 1.5, background: "currentColor", borderRadius: 1 }} />
            <span style={{ width: 15, height: 1.5, background: "currentColor", borderRadius: 1 }} />
            <span style={{ width: 15, height: 1.5, background: "currentColor", borderRadius: 1 }} />
          </span>
        </button>

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

      {/* mobile dropdown: role switch + role-filtered links + slot */}
      {menuOpen && (
        <div className="nav-mobile" style={{ flexDirection: "column", gap: 12, padding: "14px 22px 18px", borderTop: `1px solid ${C.line}`, background: "rgba(7,9,13,.97)" }}>
          <div style={{ display: "flex", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
            {(["consumer", "agent"] as const).map((r) => (
              <button
                key={r}
                onClick={() => { setRole(r); router.push(ROLE_HOME[r]); }}
                style={{ flex: 1, padding: "9px 0", border: "none", background: role === r ? C.hi : "transparent", color: role === r ? C.bg0 : C.dim, fontWeight: 600, fontSize: 13, cursor: "pointer", textTransform: "capitalize" }}
              >
                {r}
              </button>
            ))}
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {links.filter((l) => l.roles.includes(role)).map((l) => {
              const on = isActive(l.match);
              return (
                <Link key={l.href} href={l.href} style={{ padding: "11px 13px", borderRadius: 7, background: on ? C.raised : "transparent", color: on ? C.hi : C.tx, fontWeight: 500, fontSize: 14, textDecoration: "none" }}>
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="mono" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: C.dim, paddingLeft: 2 }}>
            <span className={slot ? "cp-blink" : ""} style={{ width: 5, height: 5, borderRadius: "50%", background: slot ? C.green : C.faint }} />
            devnet slot {slot ? slot.toLocaleString() : "—"}
          </div>
        </div>
      )}
    </header>
    </>
  );
}
