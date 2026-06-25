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
// because it touches window.
const WalletModalButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletModalButton),
  { ssr: false, loading: () => <span style={{ width: 120 }} /> }
);

// Each link is tagged with the role(s) it belongs to. The Consumer⇄Agent toggle
// filters this list, so flipping the mode visibly reshapes the whole nav.
const links: { href: string; label: string; match: string[]; roles: Role[] }[] = [
  { href: "/", label: "Overview", match: ["/"], roles: ["consumer", "agent"] },
  { href: "/bazaar", label: "Bazaar", match: ["/bazaar", "/agent"], roles: ["consumer", "agent"] },
  { href: "/work", label: "Work", match: ["/work"], roles: ["agent"] },
  { href: "/pipeline/create", label: "Create", match: ["/pipeline/create"], roles: ["consumer"] },
  { href: "/my/pipelines", label: "Pipelines", match: ["/my/pipelines", "/pipeline/"], roles: ["consumer"] },
  { href: "/my/stake", label: "Stake", match: ["/my/stake"], roles: ["agent"] },
];

const ROLE_HOME: Record<Role, string> = { consumer: "/my/pipelines", agent: "/work" };
const roleForPath = (p: string): Role | null =>
  p.startsWith("/work") || p.startsWith("/my/stake") ? "agent"
  : p.startsWith("/pipeline/create") || p.startsWith("/my/pipelines") ? "consumer"
  : null;

const linkBase: React.CSSProperties = {
  fontFamily: "var(--font-geist), serif",
  fontSize: 15,
  textDecoration: "none",
  paddingBottom: 3,
  transition: "color .15s",
};

export function NavBar() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { publicKey, disconnect } = useWallet();
  const { connection } = useConnection();
  const { role, setRole } = useRole();
  const [slot, setSlot] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    const r = roleForPath(pathname);
    if (r && r !== role) setRole(r);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    const tick = () => connection.getSlot("confirmed").then((s) => alive && setSlot(s)).catch(() => {});
    tick();
    const id = setInterval(tick, 10_000);
    return () => { alive = false; clearInterval(id); };
  }, [connection]);

  const isActive = (m: string[]) =>
    m.some((p) => {
      // Exact-match routes (avoid "/" or "/pipeline/create" matching everything by prefix).
      if (p === "/" || p === "/pipeline/create") return pathname === p;
      // The Pipelines link claims /pipeline/* (detail pages) but NOT /pipeline/create,
      // which belongs to Create — otherwise both light up on the create page.
      if (p === "/pipeline/") return pathname.startsWith("/pipeline/") && pathname !== "/pipeline/create";
      return pathname === p || pathname.startsWith(p);
    });

  const Wordmark = (
    <Link href="/" style={{ textDecoration: "none", flex: "none", display: "inline-flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontFamily: "var(--font-geist), serif", fontWeight: 600, fontSize: 28, letterSpacing: "-0.03em" }}>
        <span style={{ color: C.hi }}>Chain</span>
        <span style={{ color: C.green }}>Pipe</span>
      </span>
      <span className="mono" style={{ fontSize: 9, letterSpacing: ".12em", color: C.dim, border: `1px solid ${C.line}`, padding: "1px 5px", textTransform: "uppercase" }}>Devnet</span>
    </Link>
  );

  return (
    <>
      <CommandPalette />
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: C.bg0, borderBottom: `3px solid ${C.hi}` }}>
        <div className="max-w-[1440px] mx-auto" style={{ padding: "0 16px", height: 64, display: "flex", alignItems: "center", gap: 28 }}>
          {Wordmark}

          <nav className="nav-desktop" style={{ alignItems: "center", gap: 28, marginLeft: 12 }}>
            {links.filter((l) => l.roles.includes(role)).map((l) => {
              const on = isActive(l.match);
              return (
                <Link key={l.href} href={l.href} style={{ ...linkBase, color: on ? C.green : C.dim, borderBottom: on ? `3px solid ${C.green}` : "3px solid transparent" }}>
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div style={{ flex: 1 }} />

          <div className="nav-desktop" style={{ alignItems: "center", gap: 16 }}>
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              className="mono"
              title="Command palette (⌘K)"
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 9px", border: `1px solid ${C.line}`, background: "transparent", color: C.dim, fontSize: 11, cursor: "pointer", borderRadius: 0 }}
            >
              ⌘K
            </button>

            <div className="mono" title="Current devnet slot" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", border: `1px solid ${C.line}` }}>
              <span className="mono" style={{ fontSize: 11, color: C.dim, letterSpacing: ".08em", textTransform: "uppercase" }}>Slot</span>
              <span style={{ fontSize: 12, color: C.hi }}>{slot ? slot.toLocaleString() : "—"}</span>
            </div>

            <div title="Switch mode — reshapes the nav and takes you to that mode's home" style={{ display: "flex", alignItems: "center", border: `1px solid ${C.hi}` }}>
              {(["consumer", "agent"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => { setRole(r); router.push(ROLE_HOME[r]); }}
                  className="mono"
                  style={{ padding: "6px 12px", border: "none", background: role === r ? C.hi : "transparent", color: role === r ? C.bg0 : C.dim, fontWeight: 500, fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", cursor: "pointer" }}
                >
                  {r}
                </button>
              ))}
            </div>

            {publicKey ? (
              <button onClick={() => disconnect()} className="mono" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 11px", border: `1px solid ${C.line}`, background: "transparent", color: C.hi, fontWeight: 500, fontSize: 12, cursor: "pointer" }}>
                <span className="cp-blink" style={{ width: 6, height: 6, background: C.green }} />
                {short(publicKey.toBase58())}
              </button>
            ) : (
              <WalletModalButton
                style={{ height: "auto", lineHeight: 1, padding: "9px 16px", borderRadius: 0, border: `1px solid ${C.green}`, background: C.green, color: C.bg0, fontWeight: 600, fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", fontFamily: "var(--font-geist-mono), monospace" }}
              >
                Connect wallet
              </WalletModalButton>
            )}
          </div>

          {/* mobile menu trigger */}
          <button
            className="nav-mobile mono"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            style={{ alignItems: "center", justifyContent: "center", padding: "6px 11px", border: `1px solid ${C.hi}`, background: menuOpen ? C.hi : "transparent", color: menuOpen ? C.bg0 : C.hi, cursor: "pointer", flex: "none", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}
          >
            Menu
          </button>
        </div>

        {menuOpen && (
          <div className="nav-mobile" style={{ flexDirection: "column", gap: 14, padding: "16px", borderTop: `1px solid ${C.line}`, background: C.bg0 }}>
            <div style={{ display: "flex", border: `1px solid ${C.hi}` }}>
              {(["consumer", "agent"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => { setRole(r); router.push(ROLE_HOME[r]); }}
                  className="mono"
                  style={{ flex: 1, padding: "10px 0", border: "none", background: role === r ? C.hi : "transparent", color: role === r ? C.bg0 : C.dim, fontWeight: 500, fontSize: 12, letterSpacing: ".05em", textTransform: "uppercase", cursor: "pointer" }}
                >
                  {r}
                </button>
              ))}
            </div>
            <nav style={{ display: "flex", flexDirection: "column" }}>
              {links.filter((l) => l.roles.includes(role)).map((l) => {
                const on = isActive(l.match);
                return (
                  <Link key={l.href} href={l.href} style={{ padding: "12px 4px", borderBottom: `1px solid ${C.line}`, color: on ? C.green : C.hi, fontFamily: "var(--font-geist), serif", fontSize: 16, textDecoration: "none" }}>
                    {l.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mono" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: C.dim }}>
              <span className={slot ? "cp-blink" : ""} style={{ width: 5, height: 5, background: slot ? C.green : C.faint }} />
              devnet slot {slot ? slot.toLocaleString() : "—"}
            </div>
            {!publicKey && (
              <WalletModalButton style={{ height: "auto", lineHeight: 1, padding: "11px 16px", borderRadius: 0, border: `1px solid ${C.green}`, background: C.green, color: C.bg0, fontWeight: 600, fontSize: 12, textTransform: "uppercase", fontFamily: "var(--font-geist-mono), monospace", justifyContent: "center" }}>Connect wallet</WalletModalButton>
            )}
          </div>
        )}
      </header>
    </>
  );
}
