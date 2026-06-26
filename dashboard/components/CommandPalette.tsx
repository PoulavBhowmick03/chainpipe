"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { C } from "@/lib/theme";

interface Cmd { label: string; hint: string; run: () => void; }

/** ⌘K / Ctrl-K command palette — keyboard-native nav to every surface. */
export function CommandPalette() {
  const router = useRouter();
  const { setVisible } = useWalletModal();
  const { publicKey, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const cmds: Cmd[] = useMemo(() => {
    const go = (href: string) => () => { router.push(href); setOpen(false); };
    const base: Cmd[] = [
      { label: "Home", hint: "/", run: go("/") },
      { label: "Agent bazaar", hint: "/bazaar", run: go("/bazaar") },
      { label: "Create a pipeline", hint: "/pipeline/create", run: go("/pipeline/create") },
      { label: "Find work", hint: "/work", run: go("/work") },
      { label: "My pipelines", hint: "/my/pipelines", run: go("/my/pipelines") },
      { label: "My stake", hint: "/my/stake", run: go("/my/stake") },
    ];
    base.push(
      publicKey
        ? { label: "Disconnect wallet", hint: "wallet", run: () => { disconnect(); setOpen(false); } }
        : { label: "Connect wallet", hint: "wallet", run: () => { setVisible(true); setOpen(false); } }
    );
    return base;
  }, [router, publicKey, disconnect, setVisible]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cmds;
    return cmds.filter((c) => (c.label + " " + c.hint).toLowerCase().includes(s));
  }, [q, cmds]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); setQ(""); setActive(0); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
  useEffect(() => { setActive(0); }, [q]);

  if (!open) return null;

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); results[active]?.run(); }
  };

  return (
    <div
      onClick={() => setOpen(false)}
      style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(22,21,18,.38)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "14vh" }}
    >
      <div
        className="surface-raised cp-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onListKey}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{ width: "min(560px, 92vw)", overflow: "hidden", boxShadow: "0 24px 64px rgba(22,21,18,.22)" }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Jump to…"
          aria-label="Search commands"
          className="mono"
          style={{ width: "100%", boxSizing: "border-box", padding: "16px 18px", background: "transparent", border: "none", borderBottom: `1px solid ${C.line}`, color: C.hi, fontSize: 15, outline: "none" }}
        />
        <div style={{ maxHeight: 320, overflowY: "auto", padding: 6 }}>
          {results.length === 0 && <div className="mono" style={{ padding: 18, color: C.faint, fontSize: 12 }}>No matches.</div>}
          {results.map((c, i) => (
            <button
              key={c.label}
              onMouseEnter={() => setActive(i)}
              onClick={c.run}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: "11px 13px", borderRadius: 0, border: "none", cursor: "pointer", textAlign: "left",
                background: i === active ? C.bg : "transparent", color: i === active ? C.hi : C.tx,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500 }}>{c.label}</span>
              <span className="mono" style={{ fontSize: 11, color: i === active ? C.green : C.faint }}>{c.hint}</span>
            </button>
          ))}
        </div>
        <div className="mono" style={{ display: "flex", gap: 16, padding: "9px 14px", borderTop: `1px solid ${C.line}`, fontSize: 10, color: C.faint }}>
          <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}
