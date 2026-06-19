"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { agentStakePda, registryConfigPda, pipelineConfigPda, dagAuthorityPda, nodePda } from "@/lib/sdk";
import { buildPrograms, ADDRESSES, FACILITATOR_URL, explorerTx } from "@/lib/chainpipe";
import { getPipelines, type PipelineRecord, type NodeRecord } from "@/lib/indexer";
import { statusKey } from "@/lib/format";
import { C, usd, short } from "@/lib/theme";
import { depsOf } from "@/lib/adapt";
import { TierBadge } from "@/components/primitives";

type Job = { p: PipelineRecord; n: NodeRecord };
const SYSTEM = "11111111111111111111111111111111";

const depsSettled = (p: PipelineRecord, n: NodeRecord) =>
  depsOf(n.dependencyMask).every((i) => statusKey(p.nodes[i]?.status) === "settled");

export default function WorkPage() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { signMessage } = useWallet();
  const [tier, setTier] = useState<number | null>(null);
  const [claimable, setClaimable] = useState<Job[]>([]);
  const [mine, setMine] = useState<Job[]>([]);
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
    const cl: Job[] = [], pr: Job[] = [];
    for (const p of pipelines)
      for (const n of p.nodes) {
        const s = statusKey(n.status);
        if (n.agent === me && s === "claimed") pr.push({ p, n });
        else if (s === "pending" && n.requiredTier <= myTier && (!n.agent || n.agent === SYSTEM) && depsSettled(p, n)) cl.push({ p, n });
      }
    setClaimable(cl);
    setMine(pr);
  }, [connection, wallet]);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  async function claim(j: Job) {
    if (!wallet) return;
    const id = `c-${j.p.address}-${j.n.nodeIndex}`;
    setBusy(id); setMsg(null); setError(null);
    try {
      const { dag } = buildPrograms(connection, wallet);
      const pipeline = new PublicKey(j.p.address);
      const sig = await dag.methods.claimNode(j.n.nodeIndex).accountsPartial({
        pipelineConfig: pipelineConfigPda(ADDRESSES), pipeline, node: nodePda(ADDRESSES, pipeline, j.n.nodeIndex),
        agent: wallet.publicKey, agentStake: agentStakePda(ADDRESSES, wallet.publicKey), registryConfig: registryConfigPda(ADDRESSES),
        dagAuthority: dagAuthorityPda(ADDRESSES), bondedRegistryProgram: ADDRESSES.bondedRegistry,
      }).rpc();
      setMsg(sig); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  async function complete(j: Job) {
    if (!wallet || !signMessage) { setError("Wallet can't sign messages."); return; }
    const id = `s-${j.p.address}-${j.n.nodeIndex}`;
    setBusy(id); setMsg(null); setError(null);
    try {
      const { dag } = buildPrograms(connection, wallet);
      const pipeline = new PublicKey(j.p.address);
      const node = await dag.account.pipelineNode.fetch(nodePda(ADDRESSES, pipeline, j.n.nodeIndex));
      const jobId = Uint8Array.from(node.jobId);
      const message = Uint8Array.from([...pipeline.toBytes(), j.n.nodeIndex & 0xff, ...jobId, ...new Uint8Array(32)]);
      const signature = await signMessage(message);
      const b64 = btoa(String.fromCharCode(...signature));
      const res = await fetch(`${FACILITATOR_URL}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pipelinePda: j.p.address, nodeIndex: j.n.nodeIndex, agentSignature: b64 }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "facilitator rejected completion");
      setMsg(json.signature); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  if (!wallet) return <p style={{ color: C.tx, padding: "28px 0" }}>Connect your wallet to find and complete work.</p>;

  return (
    <div className="cp-in" style={{ padding: "28px 0 80px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".14em", color: C.dim, marginBottom: 6 }}>/work · AGENT CONSOLE</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Find work</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 13px", border: `1px solid ${C.line}`, borderRadius: 8, background: C.bg }}>
          <span className="mono" style={{ fontSize: 11, color: C.dim }}>your agent</span>
          <TierBadge tier={tier ?? 0} />
          <span className="mono" style={{ fontSize: 11, color: C.tx }}>{short(wallet.publicKey.toBase58())}</span>
        </div>
      </div>

      {tier === 0 && (
        <div className="mono" style={{ fontSize: 12, color: C.amber, marginBottom: 18 }}>You&apos;re not registered — <Link href="/my/stake" style={{ color: C.green }}>stake to register</Link> before claiming.</div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 30 }}>
        <div style={{ flex: "1 1 380px", minWidth: 300 }}>
          <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".1em", color: C.dim, marginBottom: 14 }}>CLAIMABLE · {claimable.length}</div>
          {claimable.length === 0 ? (
            <div className="mono" style={{ border: `1px dashed ${C.line}`, borderRadius: 9, padding: 30, textAlign: "center", color: C.faint, fontSize: 12 }}>No claimable nodes. They unlock as dependencies settle.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {claimable.map((j) => (
                <div key={`${j.p.address}-${j.n.nodeIndex}`} style={{ border: `1px solid ${C.line}`, borderRadius: 9, padding: 15 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>node {j.n.nodeIndex}</div>
                      <div className="mono" style={{ fontSize: 10, color: C.dim }}>{short(j.p.address)} · node {j.n.nodeIndex}</div>
                    </div>
                    <span className="mono" style={{ fontWeight: 600, fontSize: 17, color: C.green }}>{usd(j.n.allocationUsdc, 2)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <TierBadge tier={j.n.requiredTier} />
                    <button onClick={() => claim(j)} disabled={busy !== null} style={{ padding: "7px 16px", borderRadius: 7, border: `1px solid ${C.hi}`, background: C.hi, color: C.bg0, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{busy === `c-${j.p.address}-${j.n.nodeIndex}` ? "Claiming…" : "Claim"}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: "1 1 380px", minWidth: 300 }}>
          <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".1em", color: C.dim, marginBottom: 14 }}>IN PROGRESS · {mine.length}</div>
          {mine.length === 0 ? (
            <div className="mono" style={{ border: `1px dashed ${C.line}`, borderRadius: 9, padding: 30, textAlign: "center", color: C.faint, fontSize: 12 }}>Nothing claimed yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {mine.map((j) => (
                <div key={`${j.p.address}-${j.n.nodeIndex}`} style={{ border: `1px solid ${C.line}`, borderLeft: `2px solid ${C.blue}`, borderRadius: 9, padding: 15 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>node {j.n.nodeIndex}</div>
                      <div className="mono" style={{ fontSize: 10, color: C.dim }}>{short(j.p.address)} · node {j.n.nodeIndex}</div>
                    </div>
                    <span className="mono" style={{ fontWeight: 600, fontSize: 17, color: C.blue }}>{usd(j.n.allocationUsdc, 2)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                    <button onClick={() => complete(j)} disabled={busy !== null} style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.line2}`, background: C.panel, color: C.hi, fontWeight: 500, fontSize: 12, cursor: "pointer" }}>{busy === `s-${j.p.address}-${j.n.nodeIndex}` ? "Submitting…" : "Submit completion"}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p className="mono" style={{ color: C.red, fontSize: 12, marginTop: 18, wordBreak: "break-word" }}>{error}</p>}
      {msg && <a href={explorerTx(msg)} target="_blank" rel="noreferrer" className="mono" style={{ color: C.green, fontSize: 12, marginTop: 18, display: "inline-block" }}>View transaction ↗</a>}
    </div>
  );
}
