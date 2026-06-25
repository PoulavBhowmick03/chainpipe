"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import BN from "bn.js";
import { agentStakePda, vaultAta } from "@/lib/sdk";
import { buildPrograms, ADDRESSES, explorerTx, facilitatorPost } from "@/lib/chainpipe";
import { C, usd } from "@/lib/theme";
import { TierBadge } from "@/components/primitives";
import { NetworkPanel } from "@/components/NetworkPanel";

const REQ: Record<number, number> = { 1: 10, 2: 100, 3: 1000 };
const THRESH = [10, 100, 1000];

/** Stepped tier-capacity gauge: three segments (T1/T2/T3); each fills as stake climbs
 *  toward its threshold, lit oxblood once met. Flat, ledger-grade. */
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
              <div style={{ position: "relative", height: 6, background: C.bg, border: `1px solid ${C.line}`, overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, width: frac * 100 + "%", background: col, transition: "width .3s var(--ease)" }} />
              </div>
              <div className="mono" style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: met ? C.green : C.faint }}>
                <span>T{i + 1}</span><span>≥{t.toLocaleString()}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mono" style={{ fontSize: 12, color: C.dim, marginTop: 12 }}>
        {next ? <>Bond <span style={{ color: C.hi }}>{usd((next - stakeUsd) * 1e6, 2)}</span> more to reach T{THRESH.indexOf(next) + 1}.</> : <span style={{ color: C.green }}>Maximum tier — full capacity.</span>}
      </div>
    </div>
  );
}

/** Trust-tier reference ledger — shared by both states. */
function TierTable({ heading }: { heading: string }) {
  return (
    <section>
      <div className="masthead-rule w-full mb-4" />
      <h2 className="font-serif text-[28px] font-semibold uppercase tracking-tight mb-5">{heading}</h2>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-y border-mist">
            <th className="py-3 font-serif text-[13px] font-semibold uppercase tracking-wider">Tier</th>
            <th className="py-3 font-serif text-[13px] font-semibold uppercase tracking-wider">Claims Up To</th>
            <th className="py-3 text-right font-serif text-[13px] font-semibold uppercase tracking-wider">Bond ≥</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3].map((t) => (
            <tr key={t} className="border-b border-mist">
              <td className="py-4"><TierBadge tier={t} /></td>
              <td className="py-4 font-serif text-[15px] text-ink">Tier {t} nodes</td>
              <td className="py-4 text-right mono text-[14px]" style={{ color: t === 3 ? C.green : C.hi }}>{usd(REQ[t] * 1e6, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
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
      const j = await facilitatorPost<{ signature: string }>("/faucet", { owner: wallet.publicKey.toBase58(), amount: 100 });
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
    <div className="cp-in pt-12 pb-16 md:pb-section-gap">
      <header className="mb-12 md:mb-20">
        <div className="masthead-rule w-full mb-4" />
        <h1 className="text-billboard uppercase text-ink break-words leading-none m-0">Stake</h1>
        <p className="font-serif italic text-slate text-lg max-w-3xl mt-6">
          Agents bond USDC for a trust tier. Tier gates the value of work you can claim; failing a
          claimed node slashes your stake to the wronged consumer.
        </p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter lg:gap-12">
        <div className="lg:col-span-5 flex flex-col gap-8">
          <div>
            <TierTable heading="01 / Trust Tiers" />
            <p className="mono text-[12px] text-slate leading-relaxed mt-5">
              Slashing: a failed claimed node forfeits a share of your stake to the consumer.
              Unstaking is blocked while you have open jobs and clears after a cooldown.
            </p>
            <button onClick={() => setVisible(true)} className="btn-oxblood mono mt-6" style={{ padding: "13px 22px", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", alignSelf: "flex-start" }}>
              Connect wallet to stake
            </button>
          </div>
        </div>
        <div className="lg:col-span-7">
          <NetworkPanel mt={0} title="Live On The Network" />
        </div>
      </div>
    </div>
  );

  const bal = (usdcBal ?? 0) / 1e6;
  const canReg = bal >= REQ[stakeTier];
  const locked = (stake?.openJobs ?? 0) > 0;

  return (
    <div className="cp-in pt-12 pb-16 md:pb-section-gap">
      <header className="mb-12 md:mb-20">
        <div className="masthead-rule w-full mb-4" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-billboard uppercase text-ink break-words leading-none m-0">Stake</h1>
          <div className="flex gap-10 pb-2">
            <div className="flex flex-col text-right">
              <span className="mono text-[12px] text-slate uppercase">Bonded Stake</span>
              <span className="mono text-[14px] text-ink mt-1">{stake ? usd(stake.amount, 2) : "0.00"} USDC</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="mono text-[12px] text-slate uppercase">USDC Balance</span>
              <span className="mono text-[14px] text-ink mt-1">{usd(usdcBal ?? 0, 2)}</span>
            </div>
          </div>
        </div>
        <p className="font-serif italic text-slate text-lg max-w-3xl mt-6">
          Bond USDC for a trust tier. Tier gates which nodes you can claim; failure slashes your
          stake to the wronged consumer.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter lg:gap-12">
        {stake ? (
          /* ── staked: position ── */
          <>
            <section className="lg:col-span-7 flex flex-col">
              <div className="masthead-rule w-full mb-4" />
              <h2 className="font-serif text-[28px] font-semibold uppercase tracking-tight mb-6">01 / Position</h2>

              <div className="flex items-end justify-between border border-ink p-6 mb-8">
                <div>
                  <div className="mono text-[12px] text-slate uppercase tracking-widest mb-2">Bonded Stake</div>
                  <div className="mono" style={{ fontWeight: 600, fontSize: 44, letterSpacing: "-.02em", lineHeight: 1 }}>{usd(stake.amount, 2)}</div>
                </div>
                <TierBadge tier={stake.tier} />
              </div>

              <div className="mono text-[12px] text-slate uppercase tracking-widest mb-3">Tier Capacity</div>
              <div className="mb-8"><TierCapacity stakeUsd={Number(stake.amount) / 1e6} /></div>

              <div className="grid grid-cols-2 border border-mist mb-8">
                <div className="p-4 border-r border-mist">
                  <div className="mono text-[12px] text-slate uppercase mb-2">Stake Lock</div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2" style={{ background: locked ? C.blue : C.green }} />
                    <span className="mono text-[13px]" style={{ color: locked ? C.blue : C.green }}>{locked ? `Locked · ${stake.openJobs} job(s)` : "Unlocked"}</span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="mono text-[12px] text-slate uppercase mb-2">USDC Balance</div>
                  <div className="mono text-[17px] text-ink">{usd(usdcBal ?? 0, 2)}</div>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => act("add")} disabled={busy !== null} className="btn-outline mono" style={{ flex: 1, padding: "11px 0", fontSize: 12, letterSpacing: ".05em", textTransform: "uppercase" }}>{busy === "add" ? "…" : "+ Add 50 stake"}</button>
                <button onClick={() => act("unstake")} disabled={busy !== null || locked} title={locked ? "Settle open jobs before unstaking" : ""} className="btn-ghost2 mono" style={{ flex: 1, padding: "11px 0", fontSize: 12, letterSpacing: ".05em", textTransform: "uppercase", opacity: locked ? 0.45 : 1, cursor: locked ? "not-allowed" : "pointer" }}>{busy === "unstake" ? "…" : "Request unstake"}</button>
              </div>
            </section>

            <div className="lg:col-span-5">
              <TierTable heading="02 / Trust Tiers" />
            </div>
          </>
        ) : (
          /* ── not staked: acquire + register ── */
          <>
            <div className="lg:col-span-7 flex flex-col gap-12">
              <section>
                <div className="masthead-rule w-full mb-4" />
                <div className="flex items-baseline justify-between mb-5">
                  <h2 className="font-serif text-[28px] font-semibold uppercase tracking-tight">01 / Acquire</h2>
                  <div className="text-right">
                    <span className="mono text-[12px] text-slate uppercase block">Balance</span>
                    <span className="mono text-[15px] text-ink">{usd(usdcBal ?? 0, 2)}</span>
                  </div>
                </div>
                <p className="font-serif text-[15px] text-slate leading-relaxed mb-5">Devnet faucet — testing only. Request test USDC to bond against a trust tier.</p>
                <button onClick={faucet} disabled={busy !== null} className="mono" style={{ width: "100%", padding: "13px 0", border: `1px solid ${bal > 0 ? C.green : C.hi}`, background: bal > 0 ? "rgba(203,90,96,0.12)" : "transparent", color: bal > 0 ? C.green : C.hi, fontWeight: 600, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" }}>
                  {busy === "faucet" ? "Requesting…" : bal > 0 ? "✓ Received — request more" : "Request 100 test USDC"}
                </button>
              </section>

              <section style={{ opacity: bal > 0 ? 1 : 0.5 }}>
                <div className="masthead-rule w-full mb-4" />
                <h2 className="font-serif text-[28px] font-semibold uppercase tracking-tight mb-1">02 / Register</h2>
                <p className="font-serif text-[15px] text-slate leading-relaxed mb-5">Higher stake unlocks higher-value nodes. Choose a tier to bond.</p>
                <div className="flex flex-col border border-mist mb-5">
                  {[1, 2, 3].map((tv, i) => (
                    <button key={tv} onClick={() => setStakeTier(tv)} className="flex justify-between items-center px-4 py-4 transition-colors" style={{ borderTop: i > 0 ? `1px solid ${C.line}` : "none", background: stakeTier === tv ? C.bg : "transparent", cursor: "pointer" }}>
                      <div className="text-left">
                        <div className="font-serif text-[16px] text-ink">Tier {tv}</div>
                        <div className="mono text-[11px] text-slate">requires ≥ {REQ[tv].toLocaleString()} USDC</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <TierBadge tier={tv} />
                        <span className="mono text-[13px]" style={{ color: stakeTier === tv ? C.green : C.faint }}>{stakeTier === tv ? "✓" : ""}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <button onClick={() => act("register")} disabled={busy !== null || !canReg} className="mono" style={{ width: "100%", padding: "13px 0", border: "none", fontWeight: 600, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", cursor: canReg ? "pointer" : "not-allowed", background: canReg ? C.green : C.line, color: canReg ? C.bg0 : C.faint }}>
                  {busy === "register" ? "Registering…" : canReg ? `Stake & register as T${stakeTier}` : `Need ${REQ[stakeTier].toLocaleString()} USDC for T${stakeTier}`}
                </button>
              </section>
            </div>

            <div className="lg:col-span-5">
              <TierTable heading="Trust Tiers" />
            </div>
          </>
        )}
      </div>

      {error && <p className="mono" style={{ color: C.red, fontSize: 12, marginTop: 18, wordBreak: "break-word" }}>{error}</p>}
      {msg && <a href={explorerTx(msg)} target="_blank" rel="noreferrer" className="mono" style={{ color: C.green, fontSize: 12, marginTop: 18, display: "inline-block", textDecoration: "underline" }}>View transaction ↗</a>}
    </div>
  );
}
