"use client";

import { useState } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import BN from "bn.js";
import { pipelinePda, nodePda, vaultAta } from "@chainpipe/solana";
import { buildPrograms, ADDRESSES, explorerTx } from "@/lib/chainpipe";

interface DraftNode {
  allocation: string; // USDC
  deadlineHours: string;
  deps: boolean[]; // deps[j] => depends on node j (only j < i shown)
}

const SLOTS_PER_HOUR = 9000; // ~400ms slots

export function PipelineBuilder() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [nodes, setNodes] = useState<DraftNode[]>([
    { allocation: "40", deadlineHours: "1", deps: [] },
  ]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sig: string; pda: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addNode = () =>
    setNodes((ns) => [...ns, { allocation: "10", deadlineHours: "1", deps: ns.map(() => false) }]);
  const removeNode = () => setNodes((ns) => (ns.length > 1 ? ns.slice(0, -1) : ns));

  const setAlloc = (i: number, v: string) =>
    setNodes((ns) => ns.map((n, k) => (k === i ? { ...n, allocation: v } : n)));
  const setDeadline = (i: number, v: string) =>
    setNodes((ns) => ns.map((n, k) => (k === i ? { ...n, deadlineHours: v } : n)));
  const toggleDep = (i: number, j: number) =>
    setNodes((ns) =>
      ns.map((n, k) => {
        if (k !== i) return n;
        const deps = [...n.deps];
        deps[j] = !deps[j];
        return { ...n, deps };
      })
    );

  const total = nodes.reduce((s, n) => s + (Number(n.allocation) || 0), 0);

  async function submit() {
    setError(null);
    setResult(null);
    if (!wallet) {
      setError("Connect a wallet first.");
      return;
    }
    setBusy(true);
    try {
      const { dag } = buildPrograms(connection, wallet);
      const nonce = BigInt(Date.now());
      const pipeline = pipelinePda(ADDRESSES, wallet.publicKey, nonce);
      const nodePdas = nodes.map((_, i) => nodePda(ADDRESSES, pipeline, i));

      const configs = nodes.map((n, i) => {
        let mask = 0;
        n.deps.forEach((d, j) => {
          if (d && j < i) mask |= 1 << j;
        });
        return {
          allocationUsdc: new BN(Math.round(Number(n.allocation) * 1_000_000)),
          deadlineSlotsFromNow: new BN(Math.round(Number(n.deadlineHours) * SLOTS_PER_HOUR)),
          dependencyMask: new BN(mask),
          requiredTier: 1,
        };
      });

      const sig = await dag.methods
        .createPipeline(configs, new BN(nonce.toString()))
        .accountsPartial({
          pipeline,
          consumer: wallet.publicKey,
          stakeMint: ADDRESSES.usdcMint,
          consumerTokenAccount: getAssociatedTokenAddressSync(ADDRESSES.usdcMint, wallet.publicKey),
          vault: vaultAta(ADDRESSES.usdcMint, pipeline),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(
          nodePdas.map((pubkey) => ({ pubkey, isWritable: true, isSigner: false }))
        )
        .rpc();

      setResult({ sig, pda: pipeline.toBase58() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {nodes.map((n, i) => (
        <div key={i} className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Node {i}</h3>
            <span className="text-xs text-white/50">required tier 1</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <div className="text-white/60 text-xs mb-1">Allocation (USDC)</div>
              <input
                className="input w-full"
                value={n.allocation}
                onChange={(e) => setAlloc(i, e.target.value)}
              />
            </label>
            <label className="text-sm">
              <div className="text-white/60 text-xs mb-1">Deadline (hours from now)</div>
              <input
                className="input w-full"
                value={n.deadlineHours}
                onChange={(e) => setDeadline(i, e.target.value)}
              />
            </label>
          </div>
          {i > 0 && (
            <div className="mt-3 text-sm">
              <div className="text-white/60 text-xs mb-1">Depends on</div>
              <div className="flex flex-wrap gap-3">
                {nodes.slice(0, i).map((_, j) => (
                  <label key={j} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={n.deps[j] ?? false}
                      onChange={() => toggleDep(i, j)}
                    />
                    Node {j}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-3 items-center">
        <button className="btn-ghost" onClick={addNode} disabled={nodes.length >= 16}>
          + Add node
        </button>
        <button className="btn-ghost" onClick={removeNode} disabled={nodes.length <= 1}>
          − Remove
        </button>
        <span className="ml-auto text-white/70">
          Total locked: <span className="text-accent">{total.toFixed(2)} USDC</span>
        </span>
      </div>

      <button className="btn-primary" onClick={submit} disabled={busy || !wallet}>
        {busy ? "Submitting…" : wallet ? "Create pipeline" : "Connect wallet to create"}
      </button>

      {error && <p className="text-red-300 text-sm break-words">{error}</p>}
      {result && (
        <div className="card border-accent/40">
          <p className="text-accent font-medium">Pipeline created.</p>
          <p className="text-sm break-all">PDA: {result.pda}</p>
          <a className="text-accent2 text-sm underline" href={explorerTx(result.sig)} target="_blank" rel="noreferrer">
            View transaction ↗
          </a>
        </div>
      )}
    </div>
  );
}
