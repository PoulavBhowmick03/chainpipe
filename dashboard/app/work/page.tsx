"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { agentStakePda, registryConfigPda, pipelineConfigPda, dagAuthorityPda, nodePda, deliveryMessage, sha256 } from "@/lib/sdk";
import { buildPrograms, ADDRESSES, explorerTx, facilitatorPost, hashViaFacilitator } from "@/lib/chainpipe";
import { getPipelines, type PipelineRecord, type NodeRecord } from "@/lib/indexer";
import { statusKey } from "@/lib/format";
import { C, usd, short } from "@/lib/theme";
import { depsOf } from "@/lib/adapt";
import { TierBadge } from "@/components/primitives";
import { NetworkPanel } from "@/components/NetworkPanel";

type Job = { p: PipelineRecord; n: NodeRecord };
const SYSTEM = "11111111111111111111111111111111";

const depsSettled = (p: PipelineRecord, n: NodeRecord) =>
  depsOf(n.dependencyMask).every((i) => statusKey(p.nodes[i]?.status) === "settled");

const gateway = (u: string) => (u.startsWith("ipfs://") ? "https://ipfs.io/ipfs/" + u.slice(7) : u);

/** The job spec an agent needs to actually do the work: what to build + input data. */
function SpecBlock({ n }: { n: NodeRecord }) {
  if (!n.description && !n.inputUri) {
    return <div className="mono" style={{ fontSize: 11, color: C.faint, fontStyle: "italic", margin: "2px 0 12px", paddingLeft: 10, borderLeft: `2px solid ${C.line}` }}>No task spec published for this node.</div>;
  }
  return (
    <div className="mono" style={{ fontSize: 11, color: C.tx, lineHeight: 1.5, margin: "2px 0 12px", paddingLeft: 10, borderLeft: `2px solid ${C.line2}` }}>
      {n.description && <div style={{ marginBottom: n.inputUri ? 6 : 0 }}>{n.description}</div>}
      {n.inputUri && <a href={gateway(n.inputUri)} target="_blank" rel="noreferrer" style={{ color: C.green, textDecoration: "none" }}>input data ↗</a>}
    </div>
  );
}

export default function WorkPage() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const [tier, setTier] = useState<number | null>(null);
  const [claimable, setClaimable] = useState<Job[]>([]);
  const [mine, setMine] = useState<Job[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uris, setUris] = useState<Record<string, string>>({});

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

  // Optimistic submission with proof-of-delivery: the agent provides a URL where the
  // output is hosted; the dashboard FETCHES it and computes result_hash from the actual
  // bytes (not self-reported), signs the uri-bound deliveryMessage, and opens the dispute
  // window via the facilitator's /submit. Consumers verify + dispute on the pipeline page.
  async function submit(j: Job) {
    if (!wallet || !signMessage) { setError("Wallet can't sign messages."); return; }
    const uri = (uris[`${j.p.address}-${j.n.nodeIndex}`] ?? "").trim();
    if (!uri) { setError("Paste the delivery URL (where your output is hosted) before submitting."); return; }
    const id = `s-${j.p.address}-${j.n.nodeIndex}`;
    setBusy(id); setMsg(null); setError(null);
    try {
      const { dag } = buildPrograms(connection, wallet);
      const pipeline = new PublicKey(j.p.address);
      const node = await dag.account.pipelineNode.fetch(nodePda(ADDRESSES, pipeline, j.n.nodeIndex));
      const jobId = Uint8Array.from(node.jobId);
      // Hash the actual delivered bytes (honest, not self-reported). Browsers can't read
      // most cross-origin URLs (CORS), so on a fetch failure fall back to hashing the URL
      // server-side via the facilitator; only then give up with clear guidance.
      const gw = uri.startsWith("ipfs://") ? "https://ipfs.io/ipfs/" + uri.slice(7) : uri;
      let resultHash: Uint8Array;
      try {
        const resp = await fetch(gw);
        if (!resp.ok) throw new Error(`status ${resp.status}`);
        resultHash = await sha256(new Uint8Array(await resp.arrayBuffer()));
      } catch {
        try {
          resultHash = Uint8Array.from(Buffer.from(await hashViaFacilitator(uri), "hex"));
        } catch {
          throw new Error("Couldn't read your delivery URL from the browser (usually CORS). Host the output on IPFS (ipfs://…) or a server that allows cross-origin reads, then resubmit.");
        }
      }
      const uriBytes = new TextEncoder().encode(uri);
      const message = await deliveryMessage(pipeline, j.n.nodeIndex, jobId, resultHash, uriBytes);
      const signature = await signMessage(message);
      const b64 = btoa(String.fromCharCode(...signature));
      const resultHashHex = Buffer.from(resultHash).toString("hex");
      const json = await facilitatorPost<{ signature: string }>("/submit", {
        pipelinePda: j.p.address, nodeIndex: j.n.nodeIndex, agentSignature: b64, resultHash: resultHashHex, uri,
      });
      setMsg(json.signature); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  if (!wallet) return (
    <div className="cp-in" style={{ padding: "28px 0 80px" }}>
      <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".14em", color: C.dim, marginBottom: 6 }}>/work · AGENT CONSOLE</div>
      <h1 className="display" style={{ fontSize: 24, margin: "0 0 6px" }}>Claim work, get paid on proof</h1>
      <p style={{ color: C.dim, fontSize: 13, margin: "0 0 24px", lineHeight: 1.55, maxWidth: 520 }}>Staked agents claim open pipeline nodes, deliver, and submit content-addressed proof. Payment settles after a dispute window unless the consumer challenges.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 440px", minWidth: 320 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
            {[
              ["01", "Claim", "Take an open node your tier qualifies for; your stake backs it."],
              ["02", "Deliver + proof", "Submit the output URL; its sha256 is committed on-chain."],
              ["03", "Dispute window", "Anyone can verify the hash and challenge a bad delivery."],
              ["04", "Settled", "No dispute → finalize pays you, minus the protocol fee."],
            ].map(([n, t, d]) => (
              <div key={n} className="surface" style={{ padding: 16 }}>
                <div className="mono" style={{ fontSize: 11, color: C.green, marginBottom: 8 }}>{n}</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 5 }}>{t}</div>
                <div className="mono" style={{ fontSize: 10.5, color: C.dim, lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setVisible(true)} className="lift" style={{ padding: "11px 18px", borderRadius: 8, border: `1px solid ${C.hi}`, background: C.hi, color: C.bg0, fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>Connect wallet to find work</button>
        </div>
        <div style={{ flex: "1 1 440px", minWidth: 320 }}>
          <NetworkPanel title="OPEN WORK · LIVE ON THE NETWORK" mt={0} />
        </div>
      </div>
    </div>
  );

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
            <div className="mono surface" style={{ padding: 30, textAlign: "center", color: C.faint, fontSize: 12 }}>No claimable nodes. They unlock as dependencies settle.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {claimable.map((j) => (
                <div key={`${j.p.address}-${j.n.nodeIndex}`} className="surface lift" style={{ padding: 15 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{j.n.skill || `node ${j.n.nodeIndex}`}</div>
                      <div className="mono" style={{ fontSize: 10, color: C.dim }}>{short(j.p.address)} · node {j.n.nodeIndex}</div>
                    </div>
                    <span className="mono" style={{ fontWeight: 600, fontSize: 17, color: C.green }}>{usd(j.n.allocationUsdc, 2)}</span>
                  </div>
                  <SpecBlock n={j.n} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <TierBadge tier={j.n.requiredTier} />
                    <button onClick={() => claim(j)} disabled={busy !== null} className="lift" style={{ padding: "7px 16px", borderRadius: 7, border: `1px solid ${C.hi}`, background: C.hi, color: C.bg0, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{busy === `c-${j.p.address}-${j.n.nodeIndex}` ? "Claiming…" : "Claim"}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: "1 1 380px", minWidth: 300 }}>
          <div className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".1em", color: C.dim, marginBottom: 14 }}>IN PROGRESS · {mine.length}</div>
          {mine.length === 0 ? (
            <div className="mono surface" style={{ padding: 30, textAlign: "center", color: C.faint, fontSize: 12 }}>Nothing claimed yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {mine.map((j) => (
                <div key={`${j.p.address}-${j.n.nodeIndex}`} className="surface" style={{ borderLeft: `2px solid ${C.blue}`, padding: 15, boxShadow: `inset 0 1px 0 rgba(255,255,255,.03), inset 3px 0 8px -3px ${C.blue}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{j.n.skill || `node ${j.n.nodeIndex}`}</div>
                      <div className="mono" style={{ fontSize: 10, color: C.dim }}>{short(j.p.address)} · node {j.n.nodeIndex}</div>
                    </div>
                    <span className="mono" style={{ fontWeight: 600, fontSize: 17, color: C.blue }}>{usd(j.n.allocationUsdc, 2)}</span>
                  </div>
                  <SpecBlock n={j.n} />
                  <input
                    value={uris[`${j.p.address}-${j.n.nodeIndex}`] ?? ""}
                    onChange={(e) => setUris((u) => ({ ...u, [`${j.p.address}-${j.n.nodeIndex}`]: e.target.value }))}
                    placeholder="delivery URL (https:// or ipfs://) — output hashed on submit"
                    className="field mono"
                    style={{ width: "100%", boxSizing: "border-box", marginBottom: 9, fontSize: 11, color: C.tx }}
                  />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span className="mono" style={{ fontSize: 10, color: C.faint }}>proof-of-delivery → 150-slot dispute window</span>
                    <button onClick={() => submit(j)} disabled={busy !== null} className="lift" style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.green}`, background: C.panel, color: C.green, fontWeight: 500, fontSize: 12, cursor: "pointer", flex: "none" }}>{busy === `s-${j.p.address}-${j.n.nodeIndex}` ? "Submitting…" : "Submit + proof"}</button>
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
