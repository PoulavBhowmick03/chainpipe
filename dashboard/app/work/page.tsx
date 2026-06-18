"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  agentStakePda,
  registryConfigPda,
  pipelineConfigPda,
  dagAuthorityPda,
  nodePda,
} from "@/lib/sdk";
import { buildPrograms, ADDRESSES, FACILITATOR_URL, explorerTx } from "@/lib/chainpipe";
import { getPipelines, type PipelineRecord, type NodeRecord } from "@/lib/indexer";
import { usdc, shortKey, statusKey } from "@/lib/format";
import { NodeStatusBadge } from "@/components/NodeStatusBadge";

type Job = { pipeline: PipelineRecord; node: NodeRecord; claimable: boolean; mine: boolean };

const depsSettled = (p: PipelineRecord, n: NodeRecord) => {
  const mask = BigInt(n.dependencyMask);
  for (let i = 0; i < p.nodes.length; i++) {
    if (((mask >> BigInt(i)) & 1n) === 1n && statusKey(p.nodes[i]?.status) !== "settled") return false;
  }
  return true;
};

export default function WorkPage() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { signMessage } = useWallet();
  const [tier, setTier] = useState<number | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    const me = wallet.publicKey.toBase58();
    const { bonded } = buildPrograms(connection, wallet);
    const stake = await bonded.account.agentStake.fetchNullable(agentStakePda(ADDRESSES, wallet.publicKey));
    const myTier = stake?.tier ?? 0;
    setTier(myTier);

    const pipelines = await getPipelines("?status=active").catch(() => [] as PipelineRecord[]);
    const out: Job[] = [];
    for (const p of pipelines) {
      for (const n of p.nodes) {
        const s = statusKey(n.status);
        const mine = n.agent === me && s === "claimed";
        const claimable = s === "pending" && n.requiredTier <= myTier && depsSettled(p, n);
        if (mine || claimable) out.push({ pipeline: p, node: n, claimable, mine });
      }
    }
    setJobs(out);
  }, [connection, wallet]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  async function claim(j: Job) {
    if (!wallet) return;
    setBusy(`claim-${j.pipeline.address}-${j.node.nodeIndex}`);
    setMsg(null);
    setError(null);
    try {
      const { dag } = buildPrograms(connection, wallet);
      const pipeline = new PublicKey(j.pipeline.address);
      const sig = await dag.methods
        .claimNode(j.node.nodeIndex)
        .accountsPartial({
          pipelineConfig: pipelineConfigPda(ADDRESSES),
          pipeline,
          node: nodePda(ADDRESSES, pipeline, j.node.nodeIndex),
          agent: wallet.publicKey,
          agentStake: agentStakePda(ADDRESSES, wallet.publicKey),
          registryConfig: registryConfigPda(ADDRESSES),
          dagAuthority: dagAuthorityPda(ADDRESSES),
          bondedRegistryProgram: ADDRESSES.bondedRegistry,
        })
        .rpc();
      setMsg(sig);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // Sign a completion (committing to a zero result hash for now) and let the
  // facilitator settle it on-chain.
  async function complete(j: Job) {
    if (!wallet || !signMessage) {
      setError("Wallet can't sign messages.");
      return;
    }
    setBusy(`complete-${j.pipeline.address}-${j.node.nodeIndex}`);
    setMsg(null);
    setError(null);
    try {
      const { dag } = buildPrograms(connection, wallet);
      const pipeline = new PublicKey(j.pipeline.address);
      const node = await dag.account.pipelineNode.fetch(nodePda(ADDRESSES, pipeline, j.node.nodeIndex));
      const jobId = Uint8Array.from(node.jobId);
      const message = Uint8Array.from([
        ...pipeline.toBytes(),
        j.node.nodeIndex & 0xff,
        ...jobId,
        ...new Uint8Array(32), // result hash commitment (zeros for now)
      ]);
      const signature = await signMessage(message);
      const b64 = btoa(String.fromCharCode(...signature));
      const res = await fetch(`${FACILITATOR_URL}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pipelinePda: j.pipeline.address, nodeIndex: j.node.nodeIndex, agentSignature: b64 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "facilitator rejected completion");
      setMsg(json.signature);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!wallet) return <p className="text-white/60">Connect your wallet to find and complete work.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Agent work console</h1>
        <p className="text-white/60">
          Your tier: <span className="text-accent2">{tier === null ? "…" : tier === 0 ? "Unregistered" : `Tier ${tier}`}</span>
          {tier === 0 && (
            <> — <Link href="/my/stake" className="text-accent underline">stake to register</Link> first.</>
          )}
        </p>
      </div>

      {jobs.length === 0 ? (
        <p className="text-white/50">No claimable or in-progress nodes for you right now.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {jobs.map((j) => (
            <div key={`${j.pipeline.address}-${j.node.nodeIndex}`} className="card flex flex-wrap items-center gap-4">
              <Link href={`/pipeline/${j.pipeline.address}`} className="font-mono text-sm hover:text-accent">
                {shortKey(j.pipeline.address, 4)}#{j.node.nodeIndex}
              </Link>
              <NodeStatusBadge status={statusKey(j.node.status)} />
              <span className="text-white/70 text-sm">{usdc(j.node.allocationUsdc)} USDC</span>
              <span className="text-white/40 text-xs">req. tier {j.node.requiredTier}</span>
              <div className="ml-auto">
                {j.claimable && (
                  <button className="btn-primary" disabled={busy !== null} onClick={() => claim(j)}>
                    {busy === `claim-${j.pipeline.address}-${j.node.nodeIndex}` ? "Claiming…" : "Claim"}
                  </button>
                )}
                {j.mine && (
                  <button className="btn-primary" disabled={busy !== null} onClick={() => complete(j)}>
                    {busy === `complete-${j.pipeline.address}-${j.node.nodeIndex}` ? "Submitting…" : "Submit completion"}
                  </button>
                )}
              </div>
            </div>
          ))}
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
