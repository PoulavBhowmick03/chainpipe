"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import BN from "bn.js";
import { agentStakePda, vaultAta } from "@/lib/sdk";
import { buildPrograms, ADDRESSES, FACILITATOR_URL, explorerTx } from "@/lib/chainpipe";
import { usdc, tierLabel } from "@/lib/format";

export default function StakePage() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [amount, setAmount] = useState("10");
  const [stake, setStake] = useState<{ amount: string; tier: number; openJobs: number } | null>(null);
  const [usdcBal, setUsdcBal] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    const { bonded } = buildPrograms(connection, wallet);
    const acc = await bonded.account.agentStake.fetchNullable(agentStakePda(ADDRESSES, wallet.publicKey));
    setStake(acc ? { amount: acc.stakeAmount.toString(), tier: acc.tier, openJobs: acc.openJobs } : null);
    try {
      const bal = await getAccount(connection, getAssociatedTokenAddressSync(ADDRESSES.usdcMint, wallet.publicKey));
      setUsdcBal(Number(bal.amount));
    } catch {
      setUsdcBal(0);
    }
  }, [connection, wallet]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  async function faucet() {
    if (!wallet) return;
    setBusy("faucet");
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`${FACILITATOR_URL}/faucet`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: wallet.publicKey.toBase58(), amount: 100 }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "faucet failed");
      setMsg(j.signature);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function run(action: "stake" | "add" | "unstake") {
    if (!wallet) return;
    setBusy(action);
    setMsg(null);
    setError(null);
    try {
      const { bonded } = buildPrograms(connection, wallet);
      const stakePda = agentStakePda(ADDRESSES, wallet.publicKey);
      const base = new BN(Math.round(Number(amount) * 1_000_000));
      let sig: string;
      if (action === "stake") {
        sig = await bonded.methods
          .stakeAndRegister(base)
          .accountsPartial({
            agentStake: stakePda,
            agent: wallet.publicKey,
            stakeMint: ADDRESSES.usdcMint,
            agentTokenAccount: getAssociatedTokenAddressSync(ADDRESSES.usdcMint, wallet.publicKey),
            vault: vaultAta(ADDRESSES.usdcMint, stakePda),
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      } else if (action === "add") {
        sig = await bonded.methods
          .addStake(base)
          .accountsPartial({
            agentStake: stakePda,
            agent: wallet.publicKey,
            stakeMint: ADDRESSES.usdcMint,
            agentTokenAccount: getAssociatedTokenAddressSync(ADDRESSES.usdcMint, wallet.publicKey),
            vault: vaultAta(ADDRESSES.usdcMint, stakePda),
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
      } else {
        sig = await bonded.methods
          .requestUnstake()
          .accountsPartial({ agentStake: stakePda, agent: wallet.publicKey })
          .rpc();
      }
      setMsg(sig);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!wallet) return <p className="text-white/60">Connect your wallet to manage your stake.</p>;

  const needAmount = Math.round(Number(amount) * 1_000_000);
  const hasEnough = (usdcBal ?? 0) >= needAmount;

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <h1 className="text-2xl font-bold">My stake</h1>

      {stake ? (
        <div className="card grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-bold">{usdc(stake.amount)}</div>
            <div className="text-xs text-white/60">Staked USDC</div>
          </div>
          <div>
            <div className="text-xl font-bold text-accent2">{tierLabel(stake.tier)}</div>
            <div className="text-xs text-white/60">Tier</div>
          </div>
          <div>
            <div className="text-xl font-bold">{stake.openJobs}</div>
            <div className="text-xs text-white/60">Open jobs</div>
          </div>
        </div>
      ) : (
        <div className="card flex flex-col gap-4">
          <p className="text-white/70">
            This wallet isn’t registered yet. Initialize it as a bonded agent in two steps:
          </p>

          <div className="flex items-center gap-3">
            <span className="badge border-accent/60 text-accent">1</span>
            <div className="flex-1">
              <div className="text-sm">Get test USDC</div>
              <div className="text-xs text-white/50">
                Balance: {usdcBal === null ? "…" : `${usdc(usdcBal)} USDC`}
              </div>
            </div>
            <button className="btn-ghost" disabled={busy !== null} onClick={faucet}>
              {busy === "faucet" ? "Requesting…" : "Get 100 test USDC"}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="badge border-accent/60 text-accent">2</span>
            <div className="flex-1">
              <div className="text-sm">Stake &amp; register (Tier 1 = 10 USDC)</div>
              {!hasEnough && (
                <div className="text-xs text-amber-300">Get test USDC first.</div>
              )}
            </div>
            <button className="btn-primary" disabled={busy !== null || !hasEnough} onClick={() => run("stake")}>
              {busy === "stake" ? "Staking…" : "Stake & register"}
            </button>
          </div>
        </div>
      )}

      <label className="text-sm">
        <div className="text-white/60 text-xs mb-1">Amount (USDC)</div>
        <input className="input w-full" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>

      {stake && (
        <div className="flex gap-3 flex-wrap">
          <button className="btn-ghost" disabled={busy !== null} onClick={() => run("add")}>
            Add stake
          </button>
          <button className="btn-ghost" disabled={busy !== null} onClick={() => run("unstake")}>
            Request unstake
          </button>
        </div>
      )}

      {error && <p className="text-red-300 text-sm break-words">{error}</p>}
      {msg && (
        <a className="text-accent2 underline text-sm" href={explorerTx(msg)} target="_blank" rel="noreferrer">
          View transaction ↗
        </a>
      )}
    </div>
  );
}
