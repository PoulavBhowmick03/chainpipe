"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import BN from "bn.js";
import { agentStakePda, vaultAta } from "@/lib/sdk";
import { buildPrograms, ADDRESSES, FACILITATOR_URL, explorerTx } from "@/lib/chainpipe";
import { C, usd } from "@/lib/theme";
import { TierBadge } from "@/components/primitives";
import { NetworkPanel } from "@/components/NetworkPanel";

const REQ: Record<number, number> = { 1: 10, 2: 100, 3: 1000 };
const THRESH = [10, 100, 1000];

/** Stepped tier-capacity gauge: three segments (T1/T2/T3); each fills as stake climbs
 *  toward its threshold, lit green once met. Reads like a machine's power bars. */
function TierCapacity({ stakeUsd }: { stakeUsd: number }) {
  const next = THRESH.find((t) => stakeUsd < t);
  return (
    <div>
      <div style={{ display: "flex", gap: 6 }}>
        {THRESH.map((t, i) => {
          const prev = i === 0 ? 0 : THRESH[i - 1];
          const frac = Math.max(0, Math.min(1, (stakeUsd - prev) / (t - prev)));
          const met = stakeUsd >= t;
          const col = met ? C.green : frac > 0 ? C.hi : C.line2;
          return (
            <div key={t} style={{ flex: 1 }}>
              <div style={{ position: "relative", height: 7, background: C.bg0, borderRadius: 3, overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(0,0,0,.6)" }}>
                <div style={{ position: "absolute", inset: 0, width: frac * 100 + "%", background: `linear-gradient(90deg,${col}55,${col})`, boxShadow: frac > 0 ? `0 0 8px ${col}66` : "none", transition: "width .3s var(--ease)" }} />
              </div>
              <div className="mono" style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 9, color: met ? C.green : C.faint }}>
                <span>T{i + 1}</span><span>≥{t.toLocaleString()}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mono" style={{ fontSize: 11, color: C.dim, marginTop: 10 }}>
        {next ? <>Bond <span style={{ color: C.hi }}>{usd((next - stakeUsd) * 1e6, 2)}</span> more to reach T{THRESH.indexOf(next) + 1}.</> : <span style={{ color: C.green }}>Maximum tier — full capacity.</span>}
      </div>
    </div>
  );
}

export default function StakePage() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { setVisible } = useWalletModal();
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

  if (!wallet) return (
    <div className="cp-in" style={{ padding: "28px 0 80px" }}>
      <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".14em", color: C.dim, marginBottom: 6 }}>/my/stake</div>
      <h1 className="display" style={{ fontSize: 24, margin: "0 0 6px" }}>Bond stake, earn trust</h1>
      <p style={{ color: C.dim, fontSize: 13, margin: "0 0 24px", lineHeight: 1.55, maxWidth: 480 }}>Agents stake USDC for a trust tier. Tier gates the value of work you can claim; failing a claimed node slashes your stake to the wronged consumer.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 440px", minWidth: 320 }}>
          <div className="surface" style={{ overflow: "hidden", padding: 0, marginBottom: 16 }}>
            <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".12em", color: C.dim, padding: "13px 16px", borderBottom: `1px solid ${C.line}` }}>TRUST TIERS</div>
            {[3, 2, 1].map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 16, padding: "15px 16px", borderBottom: t === 1 ? "none" : `1px solid #14181f` }}>
                <TierBadge tier={t} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Tier {t}</div>
                  <div className="mono" style={{ fontSize: 11, color: C.dim }}>claims nodes requiring up to T{t}</div>
                </div>
                <div className="mono" style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: C.dim, letterSpacing: ".08em" }}>BOND ≥</div>
                  <div style={{ fontWeight: 600, fontSize: 17, color: t === 3 ? C.green : C.hi }}>{usd(REQ[t] * 1e6, 0)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mono" style={{ fontSize: 11, color: C.faint, lineHeight: 1.6, marginBottom: 22 }}>
            Slashing: a failed claimed node forfeits a share of your stake to the consumer · Unstaking is blocked while you have open jobs and clears after a cooldown.
          </div>
          <button onClick={() => setVisible(true)} className="lift" style={{ padding: "11px 18px", borderRadius: 8, border: `1px solid ${C.hi}`, background: C.hi, color: C.bg0, fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>Connect wallet to stake</button>
        </div>
        <div style={{ flex: "1 1 440px", minWidth: 320 }}>
          <NetworkPanel mt={0} />
        </div>
      </div>
    </div>
  );

  const bal = (usdcBal ?? 0) / 1e6;
  const badge = (active: boolean) => ({ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-geist-mono)", fontWeight: 600, fontSize: 12, flex: "none", background: active ? C.hi : C.line, color: active ? C.bg0 : C.dim } as React.CSSProperties);
  const canReg = bal >= REQ[stakeTier];
  const locked = (stake?.openJobs ?? 0) > 0;

  return (
    <div className="cp-in" style={{ padding: "28px 0 80px", maxWidth: 600 }}>
      <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".14em", color: C.dim, marginBottom: 6 }}>/my/stake</div>
      <h1 className="display" style={{ fontSize: 24, margin: "0 0 6px" }}>My stake</h1>
      <p style={{ color: C.dim, fontSize: 13, margin: "0 0 26px", lineHeight: 1.55 }}>Bond USDC for a trust tier. Tier gates which nodes you can claim; failure slashes your stake to the wronged consumer.</p>

      {stake ? (
        <div className="surface-raised" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <TierBadge tier={stake.tier} />
            <div style={{ textAlign: "right" }}>
              <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".1em", color: C.dim }}>BONDED STAKE</div>
              <div className="mono display" style={{ fontSize: 30 }}>{usd(stake.amount, 2)}</div>
            </div>
          </div>

          <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".12em", color: C.dim, marginBottom: 12 }}>TIER CAPACITY</div>
          <div style={{ marginBottom: 18 }}><TierCapacity stakeUsd={Number(stake.amount) / 1e6} /></div>

          <div className="surface" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", overflow: "hidden", marginBottom: 16, padding: 0 }}>
            <div style={{ padding: 13, borderRight: `1px solid ${C.line}` }}>
              <div className="mono" style={{ fontWeight: 500, fontSize: 10, color: C.dim, marginBottom: 6 }}>STAKE LOCK</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: locked ? C.blue : C.green, boxShadow: `0 0 7px ${locked ? C.blue : C.green}` }} />
                <span className="mono" style={{ fontWeight: 500, fontSize: 13, color: locked ? C.blue : C.green }}>{locked ? `LOCKED · ${stake.openJobs} job(s)` : "UNLOCKED"}</span>
              </div>
            </div>
            <div style={{ padding: 13 }}><div className="mono" style={{ fontWeight: 500, fontSize: 10, color: C.dim, marginBottom: 6 }}>USDC BALANCE</div><div className="mono" style={{ fontWeight: 500, fontSize: 17 }}>{usd(usdcBal ?? 0, 2)}</div></div>
          </div>

          <div style={{ display: "flex", gap: 9 }}>
            <button onClick={() => act("add")} disabled={busy !== null} className="btn-outline lift" style={{ flex: 1, padding: 10, fontSize: 13 }}>{busy === "add" ? "…" : "+ Add 50 stake"}</button>
            <button onClick={() => act("unstake")} disabled={busy !== null || locked} title={locked ? "Settle open jobs before unstaking" : ""} className="btn-ghost2 lift" style={{ flex: 1, padding: 10, fontSize: 13, opacity: locked ? 0.5 : 1, cursor: locked ? "not-allowed" : "pointer" }}>{busy === "unstake" ? "…" : "Request unstake"}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="surface" style={{ padding: 18, borderColor: bal > 0 ? "#1d3a2c" : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={badge(true)}>1</div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 500, fontSize: 13 }}>Get test USDC</div><div className="mono" style={{ fontSize: 11, color: C.dim }}>devnet faucet — testing only</div></div>
              <div style={{ textAlign: "right" }}><div className="mono" style={{ fontWeight: 500, fontSize: 10, color: C.dim }}>BALANCE</div><div className="mono" style={{ fontWeight: 500, fontSize: 15 }}>{usd(usdcBal ?? 0, 2)}</div></div>
            </div>
            <button onClick={faucet} disabled={busy !== null} className="lift" style={{ width: "100%", padding: 11, borderRadius: 7, border: `1px solid ${bal > 0 ? "#1d3a2c" : C.line2}`, background: bal > 0 ? "#0c1712" : C.raised, color: bal > 0 ? C.green : C.hi, fontWeight: 500, fontSize: 13, cursor: "pointer" }}>{busy === "faucet" ? "Requesting…" : bal > 0 ? "✓ received — request more" : "Request 100 test USDC"}</button>
          </div>

          <div className="surface" style={{ padding: 18, opacity: bal > 0 ? 1 : 0.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={badge(bal > 0)}>2</div>
              <div><div style={{ fontWeight: 500, fontSize: 13 }}>Stake &amp; register</div><div className="mono" style={{ fontSize: 11, color: C.dim }}>higher stake unlocks higher-value nodes</div></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
              {[1, 2, 3].map((tv) => (
                <button key={tv} onClick={() => setStakeTier(tv)} className="lift" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 13px", borderRadius: 8, cursor: "pointer", border: `1px solid ${stakeTier === tv ? C.line2 : C.line}`, background: stakeTier === tv ? C.raised : C.panel }}>
                  <div style={{ textAlign: "left" }}><div style={{ fontWeight: 500, fontSize: 13, color: C.hi }}>Tier {tv}</div><div className="mono" style={{ fontSize: 10, color: C.dim }}>requires ≥ {REQ[tv].toLocaleString()} USDC</div></div>
                  <TierBadge tier={tv} />
                </button>
              ))}
            </div>
            <button onClick={() => act("register")} disabled={busy !== null || !canReg} className="lift" style={{ width: "100%", padding: 12, borderRadius: 8, border: `1px solid ${canReg ? C.hi : C.line}`, fontWeight: 600, fontSize: 13, cursor: canReg ? "pointer" : "not-allowed", background: canReg ? C.hi : "transparent", color: canReg ? C.bg0 : C.faint, boxShadow: canReg ? "0 0 18px rgba(20,241,149,.12)" : "none" }}>
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
