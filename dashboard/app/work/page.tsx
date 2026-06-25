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
    return <div className="mono" style={{ fontSize: 12, color: C.faint, fontStyle: "italic", margin: "2px 0 12px", paddingLeft: 12, borderLeft: `2px solid ${C.line}` }}>No task spec published for this node.</div>;
  }
  return (
    <div className="mono" style={{ fontSize: 12, color: C.tx, lineHeight: 1.5, margin: "2px 0 12px", paddingLeft: 12, borderLeft: `2px solid ${C.line2}` }}>
      {n.description && <div style={{ marginBottom: n.inputUri ? 6 : 0 }}>{n.description}</div>}
      {n.inputUri && <a href={gateway(n.inputUri)} target="_blank" rel="noreferrer" style={{ color: C.green, textDecoration: "underline" }}>input data ↗</a>}
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

  const HeroHead = (
    <header className="mb-12 md:mb-section-gap grid grid-cols-1 md:grid-cols-12 gap-gutter items-end pt-12">
      <div className="md:col-span-9">
        <div className="masthead-rule w-full mb-4" />
        <h1 className="text-billboard uppercase text-ink break-words leading-none m-0">Work Queue</h1>
      </div>
      <div className="md:col-span-3 flex flex-col gap-4 pb-2">
        <div className="border-t border-mist pt-2">
          <div className="mono text-[12px] text-slate uppercase mb-1">System Status</div>
          <div className="mono text-[14px] text-ink flex items-center gap-2">
            <span className="w-2 h-2 bg-oxblood-deep block" /> Nominal / Settling
          </div>
        </div>
        <div className="border-t border-mist pt-2">
          <div className="mono text-[12px] text-slate uppercase mb-1">Your Tier</div>
          <div className="mono text-[14px] text-ink"><TierBadge tier={tier ?? 0} /></div>
        </div>
      </div>
    </header>
  );

  if (!wallet) return (
    <div className="cp-in pb-16 md:pb-section-gap">
      {HeroHead}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter lg:gap-12">
        <div className="lg:col-span-5 flex flex-col gap-8">
          <div>
            <div className="masthead-rule w-full mb-4" />
            <h2 className="font-serif text-[28px] font-semibold uppercase tracking-tight mb-4">How settlement works</h2>
            <div className="flex flex-col border-t border-mist">
              {[
                ["01", "Claim", "Take an open node your tier qualifies for; your stake backs it."],
                ["02", "Deliver + proof", "Submit the output URL; its sha256 is committed on-chain."],
                ["03", "Dispute window", "Anyone can verify the hash and challenge a bad delivery."],
                ["04", "Settled", "No dispute → finalize pays you, minus the protocol fee."],
              ].map(([n, t, d]) => (
                <div key={n} className="flex gap-4 py-4 border-b border-mist">
                  <span className="mono text-[12px] text-oxblood-deep pt-1">{n}</span>
                  <div>
                    <div className="font-serif text-[15px] text-ink mb-1">{t}</div>
                    <div className="mono text-[12px] text-slate leading-relaxed">{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => setVisible(true)} className="btn-oxblood mono" style={{ padding: "13px 22px", fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", alignSelf: "flex-start" }}>
            Connect wallet to find work
          </button>
        </div>
        <div className="lg:col-span-7">
          <NetworkPanel title="Open Work · Live On The Network" mt={0} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="cp-in pb-16 md:pb-section-gap">
      {HeroHead}

      {tier === 0 && (
        <div className="mono text-[13px] mb-8 p-4 border" style={{ color: C.amber, borderColor: "#E0D2B8", background: "#F8F2E6" }}>
          You&apos;re not registered — <Link href="/my/stake" className="underline" style={{ color: C.green }}>stake to register</Link> before claiming.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter lg:gap-12">
        {/* queue overview */}
        <aside className="lg:col-span-4 flex flex-col gap-12">
          <section>
            <div className="masthead-rule w-full mb-4" />
            <div className="flex items-baseline gap-3 mb-5">
              <span className="mono text-[12px] text-slate">01</span>
              <h2 className="font-serif text-[28px] font-semibold uppercase tracking-tight">Queue Overview</h2>
            </div>
            <p className="font-serif text-[15px] text-slate leading-relaxed mb-3">
              Nodes available for claim are gated by your stake tier and unlock only once upstream
              dependencies have settled.
            </p>
            <p className="font-serif text-[15px] text-slate leading-relaxed">
              Deliver, then submit content-addressed proof. Payment settles after the dispute window
              unless the consumer challenges the hash.
            </p>
            <div className="border border-mist flex flex-col mt-8">
              <div className="flex justify-between items-center p-4 border-b border-mist" style={{ background: C.panel }}>
                <span className="mono text-[12px] text-slate uppercase">Available Value</span>
                <span className="mono text-[14px] text-oxblood-deep">{usd((claimable.reduce((a, j) => a + Number(j.n.allocationUsdc), 0)).toString(), 2)} USDC</span>
              </div>
              <div className="flex justify-between items-center p-4 border-b border-mist">
                <span className="mono text-[12px] text-slate uppercase">Claimable Nodes</span>
                <span className="mono text-[14px] text-ink">{claimable.length}</span>
              </div>
              <div className="flex justify-between items-center p-4">
                <span className="mono text-[12px] text-slate uppercase">In Progress</span>
                <span className="mono text-[14px] text-ink">{mine.length}</span>
              </div>
            </div>
          </section>

          <section>
            <div className="border-t-2 border-ink pt-2 mb-4" />
            <h3 className="font-serif text-[24px] font-semibold mb-4">Agent of Record</h3>
            <div className="p-4 border border-mist flex items-center gap-3 flex-wrap">
              <TierBadge tier={tier ?? 0} />
              <span className="mono text-[12px] text-slate">{short(wallet.publicKey.toBase58())}</span>
            </div>
          </section>
        </aside>

        {/* claimable + in progress */}
        <div className="lg:col-span-8 flex flex-col gap-12">
          <section>
            <div className="masthead-rule w-full mb-4" />
            <div className="flex items-baseline gap-3 mb-6">
              <span className="mono text-[12px] text-slate">02</span>
              <h2 className="font-serif text-[28px] font-semibold uppercase tracking-tight">Claimable Nodes · {claimable.length}</h2>
            </div>
            {claimable.length === 0 ? (
              <div className="border border-mist p-10 text-center mono text-[12px] text-slate-dim">No claimable nodes. They unlock as dependencies settle.</div>
            ) : (
              <div className="flex flex-col">
                {claimable.map((j) => (
                  <div key={`${j.p.address}-${j.n.nodeIndex}`} className="border-b border-mist py-5">
                    <div className="flex justify-between items-start gap-4 mb-3">
                      <div>
                        <div className="font-serif text-[17px] text-ink mb-1">{j.n.skill || `node ${j.n.nodeIndex}`}</div>
                        <div className="mono text-[11px] text-slate">{short(j.p.address)} · node {j.n.nodeIndex}</div>
                      </div>
                      <span className="mono text-[18px] text-oxblood-deep">{usd(j.n.allocationUsdc, 2)}</span>
                    </div>
                    <SpecBlock n={j.n} />
                    <div className="flex items-center justify-between">
                      <TierBadge tier={j.n.requiredTier} />
                      <button onClick={() => claim(j)} disabled={busy !== null} className="btn-solid mono" style={{ padding: "8px 18px", fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase" }}>
                        {busy === `c-${j.p.address}-${j.n.nodeIndex}` ? "Claiming…" : "Claim"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="border-t-2 border-ink pt-2 mb-6 flex items-baseline gap-3">
              <span className="mono text-[12px] text-slate">03</span>
              <h2 className="font-serif text-[28px] font-semibold uppercase tracking-tight">In Progress · {mine.length}</h2>
            </div>
            {mine.length === 0 ? (
              <div className="border border-mist p-10 text-center mono text-[12px] text-slate-dim">Nothing claimed yet.</div>
            ) : (
              <div className="flex flex-col gap-4">
                {mine.map((j) => (
                  <div key={`${j.p.address}-${j.n.nodeIndex}`} className="border border-mist p-5" style={{ borderLeft: `3px solid ${C.blue}` }}>
                    <div className="flex justify-between items-start gap-4 mb-3">
                      <div>
                        <div className="font-serif text-[17px] text-ink mb-1">{j.n.skill || `node ${j.n.nodeIndex}`}</div>
                        <div className="mono text-[11px] text-slate">{short(j.p.address)} · node {j.n.nodeIndex}</div>
                      </div>
                      <span className="mono text-[18px]" style={{ color: C.blue }}>{usd(j.n.allocationUsdc, 2)}</span>
                    </div>
                    <SpecBlock n={j.n} />
                    <input
                      value={uris[`${j.p.address}-${j.n.nodeIndex}`] ?? ""}
                      onChange={(e) => setUris((u) => ({ ...u, [`${j.p.address}-${j.n.nodeIndex}`]: e.target.value }))}
                      placeholder="delivery URL (https:// or ipfs://) — output hashed on submit"
                      className="field mono"
                      style={{ width: "100%", boxSizing: "border-box", marginBottom: 10, fontSize: 12, color: C.tx }}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="mono text-[11px] text-slate-dim">proof-of-delivery → 150-slot dispute window</span>
                      <button onClick={() => submit(j)} disabled={busy !== null} className="btn-oxblood mono" style={{ padding: "8px 16px", fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", flex: "none" }}>
                        {busy === `s-${j.p.address}-${j.n.nodeIndex}` ? "Submitting…" : "Submit + proof"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {error && <p className="mono" style={{ color: C.red, fontSize: 12, wordBreak: "break-word" }}>{error}</p>}
          {msg && <a href={explorerTx(msg)} target="_blank" rel="noreferrer" className="mono" style={{ color: C.green, fontSize: 12, textDecoration: "underline" }}>View transaction ↗</a>}
        </div>
      </div>
    </div>
  );
}
