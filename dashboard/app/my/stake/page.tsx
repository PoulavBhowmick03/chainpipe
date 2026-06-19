"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import BN from "bn.js";
import { agentStakePda, vaultAta } from "@/lib/sdk";
import { buildPrograms, ADDRESSES, FACILITATOR_URL, explorerTx } from "@/lib/chainpipe";
import { C, usd } from "@/lib/theme";
import { TierBadge } from "@/components/primitives";

const REQ: Record<number, number> = { 1: 10, 2: 100, 3: 1000 };

export default function StakePage() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [stake, setStake] = useState<{ amount: string; tier: number; openJobs: number } | null>(null);
  const [usdcBal, setUsdcBal] = useState<number | null>(null);
  const [stakeTier, setStakeTier] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    const { bonded } = buildPrograms(connection, wallet);
    const acc = await bonded.account.agentStake.fetchNullable(agentStakePda(ADDRESSES, wallet.publicKey));
    setStake(acc ? { amount: acc.stakeAmount.toString(), tier: acc.tier, openJobs: acc.openJobs } : null);
    try { setUsdcBal(Number((await getAccount(connection, getAssociatedTokenAddressSync(ADDRESSES.usdcMint, wallet.publicKey))).amount)); } catch { setUsdcBal(0); }
  }, [connection, wallet]);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  async function faucet() {
    if (!wallet) return;
    setBusy("faucet"); setMsg(null); setError(null);
    try {
      const res = await fetch(`${FACILITATOR_URL}/faucet`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ owner: wallet.publicKey.toBase58(), amount: 100 }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error ?? "faucet failed");
      setMsg(j.signature); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  async function act(action: "register" | "add" | "unstake") {
    if (!wallet) return;
    setBusy(action); setMsg(null); setError(null);
    try {
      const { bonded } = buildPrograms(connection, wallet);
      const stakePda = agentStakePda(ADDRESSES, wallet.publicKey);
      const ata = getAssociatedTokenAddressSync(ADDRESSES.usdcMint, wallet.publicKey);
      let sig: string;
      if (action === "register") {
        sig = await bonded.methods.stakeAndRegister(new BN(REQ[stakeTier] * 1_000_000)).accountsPartial({
          agentStake: stakePda, agent: wallet.publicKey, stakeMint: ADDRESSES.usdcMint, agentTokenAccount: ata,
          vault: vaultAta(ADDRESSES.usdcMint, stakePda), tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        }).rpc();
      } else if (action === "add") {
        sig = await bonded.methods.addStake(new BN(50 * 1_000_000)).accountsPartial({
          agentStake: stakePda, agent: wallet.publicKey, stakeMint: ADDRESSES.usdcMint, agentTokenAccount: ata, vault: vaultAta(ADDRESSES.usdcMint, stakePda), tokenProgram: TOKEN_PROGRAM_ID,
        }).rpc();
      } else {
        sig = await bonded.methods.requestUnstake().accountsPartial({ agentStake: stakePda, agent: wallet.publicKey }).rpc();
      }
      setMsg(sig); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  if (!wallet) return <p style={{ color: C.tx, padding: "28px 0" }}>Connect your wallet to manage your stake.</p>;

  const bal = (usdcBal ?? 0) / 1e6;
  const badge = (active: boolean) => ({ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-geist-mono)", fontWeight: 600, fontSize: 12, flex: "none", background: active ? C.hi : C.line, color: active ? C.bg0 : C.dim } as React.CSSProperties);
  const canReg = bal >= REQ[stakeTier];

  return (
    <div className="cp-in" style={{ padding: "28px 0 80px", maxWidth: 600 }}>
      <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".14em", color: C.dim, marginBottom: 6 }}>/my/stake</div>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 6px" }}>My stake</h1>
      <p style={{ color: C.dim, fontSize: 13, margin: "0 0 26px", lineHeight: 1.55 }}>Bond USDC for a trust tier. Tier gates which nodes you can claim; failure slashes your stake to the wronged consumer.</p>

      {stake ? (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <TierBadge tier={stake.tier} />
            <div style={{ textAlign: "right" }}>
              <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".1em", color: C.dim }}>BONDED STAKE</div>
              <div className="mono" style={{ fontWeight: 600, fontSize: 30, letterSpacing: "-.02em" }}>{usd(stake.amount, 2)}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: 13, borderRight: `1px solid ${C.line}` }}><div className="mono" style={{ fontWeight: 500, fontSize: 10, color: C.dim }}>OPEN JOBS</div><div className="mono" style={{ fontWeight: 500, fontSize: 17 }}>{stake.openJobs}</div></div>
            <div style={{ padding: 13 }}><div className="mono" style={{ fontWeight: 500, fontSize: 10, color: C.dim }}>USDC BALANCE</div><div className="mono" style={{ fontWeight: 500, fontSize: 17 }}>{usd(usdcBal ?? 0, 2)}</div></div>
          </div>
          <div style={{ display: "flex", gap: 9 }}>
            <button onClick={() => act("add")} disabled={busy !== null} className="btn-outline" style={{ flex: 1, padding: 10, fontSize: 13 }}>{busy === "add" ? "…" : "+ Add 50 stake"}</button>
            <button onClick={() => act("unstake")} disabled={busy !== null} className="btn-ghost2" style={{ flex: 1, padding: 10, fontSize: 13 }}>{busy === "unstake" ? "…" : "Request unstake"}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ border: `1px solid ${bal > 0 ? "#1d3a2c" : C.line}`, borderRadius: 10, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={badge(true)}>1</div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 500, fontSize: 13 }}>Get test USDC</div><div className="mono" style={{ fontSize: 11, color: C.dim }}>devnet faucet — testing only</div></div>
              <div style={{ textAlign: "right" }}><div className="mono" style={{ fontWeight: 500, fontSize: 10, color: C.dim }}>BALANCE</div><div className="mono" style={{ fontWeight: 500, fontSize: 15 }}>{usd(usdcBal ?? 0, 2)}</div></div>
            </div>
            <button onClick={faucet} disabled={busy !== null} style={{ width: "100%", padding: 11, borderRadius: 7, border: `1px solid ${bal > 0 ? "#1d3a2c" : C.line2}`, background: bal > 0 ? "#0c1712" : C.raised, color: bal > 0 ? C.green : C.hi, fontWeight: 500, fontSize: 13, cursor: "pointer" }}>{busy === "faucet" ? "Requesting…" : bal > 0 ? "✓ received — request more" : "Request 100 test USDC"}</button>
          </div>

          <div style={{ border: `1px solid ${bal > 0 ? C.line2 : C.line}`, borderRadius: 10, padding: 18, opacity: bal > 0 ? 1 : 0.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={badge(bal > 0)}>2</div>
              <div><div style={{ fontWeight: 500, fontSize: 13 }}>Stake &amp; register</div><div className="mono" style={{ fontSize: 11, color: C.dim }}>higher stake unlocks higher-value nodes</div></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
              {[1, 2, 3].map((tv) => (
                <button key={tv} onClick={() => setStakeTier(tv)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 13px", borderRadius: 8, cursor: "pointer", border: `1px solid ${stakeTier === tv ? C.line2 : C.line}`, background: stakeTier === tv ? C.raised : C.panel }}>
                  <div style={{ textAlign: "left" }}><div style={{ fontWeight: 500, fontSize: 13, color: C.hi }}>Tier {tv}</div><div className="mono" style={{ fontSize: 10, color: C.dim }}>requires ≥ {REQ[tv].toLocaleString()} USDC</div></div>
                  <TierBadge tier={tv} />
                </button>
              ))}
            </div>
            <button onClick={() => act("register")} disabled={busy !== null || !canReg} style={{ width: "100%", padding: 12, borderRadius: 8, border: `1px solid ${canReg ? C.hi : C.line}`, fontWeight: 600, fontSize: 13, cursor: canReg ? "pointer" : "not-allowed", background: canReg ? C.hi : "transparent", color: canReg ? C.bg0 : C.faint }}>
              {busy === "register" ? "Registering…" : canReg ? `Stake & register as T${stakeTier}` : `Need ${REQ[stakeTier].toLocaleString()} USDC for T${stakeTier}`}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mono" style={{ color: C.red, fontSize: 12, marginTop: 14, wordBreak: "break-word" }}>{error}</p>}
      {msg && <a href={explorerTx(msg)} target="_blank" rel="noreferrer" className="mono" style={{ color: C.green, fontSize: 12, marginTop: 14, display: "inline-block" }}>View transaction ↗</a>}
    </div>
  );
}
