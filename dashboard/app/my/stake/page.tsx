"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import BN from "bn.js";
import { agentStakePda, vaultAta } from "@chainpipe/solana";
import { buildPrograms, ADDRESSES, explorerTx } from "@/lib/chainpipe";
import { usdc, tierLabel } from "@/lib/format";

export default function StakePage() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [amount, setAmount] = useState("10");
  const [stake, setStake] = useState<{ amount: string; tier: number; openJobs: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    const { bonded } = buildPrograms(connection, wallet);
    const acc = await bonded.account.agentStake.fetchNullable(
      agentStakePda(ADDRESSES, wallet.publicKey)
    );
    setStake(acc ? { amount: acc.stakeAmount.toString(), tier: acc.tier, openJobs: acc.openJobs } : null);
  }, [connection, wallet]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  async function run(action: "stake" | "add" | "unstake") {
    if (!wallet) return;
    setBusy(true);
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
      setBusy(false);
    }
  }

  if (!wallet) return <p className="text-white/60">Connect your wallet to manage your stake.</p>;

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <h1 className="text-2xl font-bold">My stake</h1>

      <div className="card">
        {stake ? (
          <div className="grid grid-cols-3 gap-2 text-center">
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
          <p className="text-white/60">Not registered yet. Stake at least 10 USDC to reach Tier 1.</p>
        )}
      </div>

      <label className="text-sm">
        <div className="text-white/60 text-xs mb-1">Amount (USDC)</div>
        <input className="input w-full" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>

      <div className="flex gap-3 flex-wrap">
        <button className="btn-primary" disabled={busy || !!stake} onClick={() => run("stake")}>
          Stake &amp; register
        </button>
        <button className="btn-ghost" disabled={busy || !stake} onClick={() => run("add")}>
          Add stake
        </button>
        <button className="btn-ghost" disabled={busy || !stake} onClick={() => run("unstake")}>
          Request unstake
        </button>
      </div>

      {error && <p className="text-red-300 text-sm break-words">{error}</p>}
      {msg && (
        <a className="text-accent2 underline text-sm" href={explorerTx(msg)} target="_blank" rel="noreferrer">
          View transaction ↗
        </a>
      )}
    </div>
  );
}
