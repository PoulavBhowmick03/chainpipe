"use client";

import { useState } from "react";
import { useConnection, useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import BN from "bn.js";
import { pipelinePda, nodePda, vaultAta, pipelineConfigPda } from "@/lib/sdk";
import { buildPrograms, ADDRESSES, explorerTx } from "@/lib/chainpipe";
import { specMessage, postSpec, type NodeSpecInput } from "@/lib/indexer";
import { C, usd } from "@/lib/theme";
import { DagCanvas, type DagNode } from "@/components/DagCanvas";

const SKILLS = ["code-gen", "data-fetch", "report-synthesis", "image-gen", "audio-transcribe"];
const SLOTS_PER_HOUR = 9000;

interface Draft { id: number; skill: string; alloc: number; deadline: number; tier: number; deps: number[]; description: string; inputUri: string }

export function PipelineBuilder() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { signMessage } = useWallet();
  const [nodes, setNodes] = useState<Draft[]>([
    { id: 1, skill: "data-fetch", alloc: 30, deadline: 6, tier: 1, deps: [], description: "", inputUri: "" },
    { id: 2, skill: "code-gen", alloc: 60, deadline: 14, tier: 1, deps: [1], description: "", inputUri: "" },
    { id: 3, skill: "report-synthesis", alloc: 40, deadline: 24, tier: 1, deps: [2], description: "", inputUri: "" },
  ]);
  const [budget, setBudget] = useState(200);
  const [sel, setSel] = useState<number | null>(1);
  const [nextId, setNextId] = useState(4);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sig: string; pda: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const idx = (id: number) => nodes.findIndex((n) => n.id === id);
  const total = nodes.reduce((a, n) => a + (Number(n.alloc) || 0), 0);
  const remain = budget - total;
  const over = remain < 0;
  const valid = nodes.length > 0 && !over && nodes.every((n) => n.alloc > 0);
  const selNode = nodes.find((n) => n.id === sel) || null;

  const upd = (id: number, f: keyof Draft, v: number | string) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, [f]: v } : n)));
  const addNode = () => { const id = nextId; setNodes((ns) => [...ns, { id, skill: "data-fetch", alloc: 20, deadline: 24, tier: 1, deps: [], description: "", inputUri: "" }]); setNextId(id + 1); setSel(id); };
  const removeNode = (id: number) => { setNodes((ns) => ns.filter((n) => n.id !== id).map((n) => ({ ...n, deps: n.deps.filter((d) => d !== id) }))); setSel(null); };
  const toggleDep = (id: number, dep: number) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, deps: n.deps.includes(dep) ? n.deps.filter((d) => d !== dep) : [...n.deps, dep] } : n)));

  const dagNodes: DagNode[] = nodes.map((n) => ({ id: n.id, label: String(idx(n.id)), title: n.skill, allocStr: (Number(n.alloc) || 0).toFixed(2), statusShort: "DRAFT", agentStr: "tier ≥" + n.tier, tier: n.tier, deps: n.deps, status: "pending" }));

  async function create() {
    if (!wallet) { setError("Connect a wallet first."); return; }
    if (!valid) return;
    setBusy(true); setError(null); setResult(null);
    try {
      // Pre-check the consumer actually holds the budget, so we fail with a clear message
      // instead of a raw Anchor error mid-transaction.
      const ata = getAssociatedTokenAddressSync(ADDRESSES.usdcMint, wallet.publicKey);
      const bal = await connection.getTokenAccountBalance(ata).then((b) => b.value.uiAmount ?? 0).catch(() => 0);
      if (bal < total) {
        setError(`Insufficient USDC: you hold ${bal.toFixed(2)}, this pipeline locks ${total.toFixed(2)}. Get devnet USDC from the faucet on the Stake page.`);
        setBusy(false);
        return;
      }
      const { dag } = buildPrograms(connection, wallet);
      const nonce = BigInt(Date.now());
      const pipeline = pipelinePda(ADDRESSES, wallet.publicKey, nonce);
      const nodePdas = nodes.map((_, i) => nodePda(ADDRESSES, pipeline, i));
      const configs = nodes.map((n) => {
        let mask = 0;
        n.deps.forEach((d) => { const di = idx(d); if (di >= 0 && di < idx(n.id)) mask |= 1 << di; });
        return { allocationUsdc: new BN(Math.round(n.alloc * 1_000_000)), deadlineSlotsFromNow: new BN(Math.round(n.deadline * SLOTS_PER_HOUR)), dependencyMask: new BN(mask), requiredTier: n.tier };
      });
      const sig = await dag.methods.createPipeline(configs, new BN(nonce.toString())).accountsPartial({
        pipelineConfig: pipelineConfigPda(ADDRESSES), pipeline, consumer: wallet.publicKey, stakeMint: ADDRESSES.usdcMint,
        consumerTokenAccount: getAssociatedTokenAddressSync(ADDRESSES.usdcMint, wallet.publicKey),
        vault: vaultAta(ADDRESSES.usdcMint, pipeline), tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      }).remainingAccounts(nodePdas.map((pubkey) => ({ pubkey, isWritable: true, isSigner: false }))).rpc();
      const pda = pipeline.toBase58();
      setResult({ sig, pda });
      // Publish the per-node job specs (what each agent must build) — consumer-signed so
      // they can't be forged, stored off-chain by the indexer. Best-effort: a failure here
      // never undoes the on-chain pipeline.
      try {
        if (signMessage) {
          const specs: NodeSpecInput[] = nodes.map((n, i) => ({ nodeIndex: i, skill: n.skill, description: n.description.trim(), inputUri: n.inputUri.trim() }));
          const sigBytes = await signMessage(specMessage(pda, specs));
          await postSpec(pda, wallet.publicKey.toBase58(), btoa(String.fromCharCode(...sigBytes)), specs);
        }
      } catch { /* spec publish is non-fatal */ }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const lbl = { fontFamily: "var(--font-geist-mono)", fontWeight: 500, fontSize: 12, letterSpacing: ".05em", color: C.dim, display: "block", marginBottom: 7, textTransform: "uppercase" } as React.CSSProperties;
  const earlier = selNode ? nodes.slice(0, idx(selNode.id)) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
      {/* ── left: specification + ledger appropriation (4 cols) ── */}
      <aside className="lg:col-span-4 flex flex-col gap-10 lg:sticky lg:top-[88px]">
        {/* ledger appropriation */}
        <section className="border border-ink p-6 flex flex-col gap-5">
          <h3 className="mono text-[12px] text-slate uppercase tracking-widest border-b border-mist pb-2">Ledger Appropriation</h3>
          <div className="flex justify-between items-baseline">
            <span className="mono text-[12px] text-slate uppercase">Budget Locked</span>
            <div className="flex items-center gap-1">
              <span className="mono text-[13px] text-slate">$</span>
              <input type="number" value={budget} onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))} className="field mono" style={{ width: 84, fontWeight: 500, fontSize: 14, textAlign: "right" }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="mono" style={{ fontWeight: 600, fontSize: 28, letterSpacing: "-.01em", color: over ? C.red : C.hi }}>{usd(total * 1e6, 2)}</span>
              <span className="mono text-[12px] text-slate">/ {usd(budget * 1e6, 0)}</span>
            </div>
            <div style={{ height: 5, background: C.bg, border: `1px solid ${C.line}`, overflow: "hidden" }}>
              <div style={{ height: "100%", width: Math.min(100, budget ? (total / budget) * 100 : 0) + "%", background: over ? C.red : C.green, transition: "width .3s var(--ease)" }} />
            </div>
            <div className="mono text-[11px] mt-2" style={{ color: over ? C.red : C.dim }}>{over ? "over budget by " + usd(-remain * 1e6, 2) : usd(remain * 1e6, 2) + " unallocated"}</div>
          </div>
          <button onClick={create} disabled={busy || !wallet} className="mono" style={{ padding: "13px 16px", border: "none", fontWeight: 600, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", cursor: valid && wallet ? "pointer" : "not-allowed", background: valid && wallet ? C.green : C.line, color: valid && wallet ? C.bg0 : C.faint, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span>{busy ? "Locking…" : !wallet ? "Connect wallet" : valid ? `Lock ${usd(total * 1e6, 2)} & deploy` : "Fix allocation"}</span>
            <span>→</span>
          </button>
          {error && <div className="mono" style={{ fontSize: 11, color: C.red, wordBreak: "break-word" }}>{error}</div>}
          {result && (
            <div style={{ border: `1px solid ${C.green}`, padding: 14, background: "rgba(203,90,96,0.12)" }}>
              <div className="mono" style={{ color: C.green, fontSize: 12, marginBottom: 4 }}>Pipeline created.</div>
              <div className="mono" style={{ fontSize: 11, color: C.tx, wordBreak: "break-all", marginBottom: 6 }}>{result.pda}</div>
              <a href={explorerTx(result.sig)} target="_blank" rel="noreferrer" className="mono" style={{ color: C.green, fontSize: 11, textDecoration: "underline" }}>View transaction ↗</a>
            </div>
          )}
        </section>

        {/* node specification */}
        <section>
          <div className="masthead-rule w-full mb-4" />
          <h2 className="font-serif text-[28px] font-semibold uppercase tracking-tight mb-5">01 / Specification</h2>
          {selNode ? (
            <div>
              <div className="flex justify-between items-center mb-4">
                <span className="mono text-[12px] text-slate uppercase tracking-wider">Node {idx(selNode.id)}</span>
                <button onClick={() => removeNode(selNode.id)} className="mono" style={{ background: "none", border: "none", color: C.red, fontWeight: 500, fontSize: 11, cursor: "pointer", textTransform: "uppercase", letterSpacing: ".05em" }}>Purge</button>
              </div>
              <label style={lbl}>Skill</label>
              <select value={selNode.skill} onChange={(e) => upd(selNode.id, "skill", e.target.value)} className="field" style={{ width: "100%", fontFamily: "var(--font-geist-mono)", fontSize: 13, marginBottom: 16 }}>
                {SKILLS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <label style={lbl}>Task · what the agent must deliver</label>
              <textarea
                value={selNode.description}
                onChange={(e) => upd(selNode.id, "description", e.target.value)}
                placeholder="e.g. Transcribe the audio at the input URL to a clean .txt; output the transcript file."
                rows={3}
                className="field mono"
                style={{ width: "100%", boxSizing: "border-box", fontSize: 12, lineHeight: 1.5, color: C.tx, marginBottom: 16, resize: "vertical" }}
              />
              <label style={lbl}>Input URL <span style={{ color: C.faint, textTransform: "none" }}>(optional — data the agent works from)</span></label>
              <input
                value={selNode.inputUri}
                onChange={(e) => upd(selNode.id, "inputUri", e.target.value)}
                placeholder="https:// or ipfs://"
                className="field mono"
                style={{ width: "100%", boxSizing: "border-box", fontSize: 12, color: C.tx, marginBottom: 16 }}
              />
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1 }}><label style={lbl}>Alloc USDC</label><input type="number" value={selNode.alloc} onChange={(e) => upd(selNode.id, "alloc", Math.max(0, Number(e.target.value) || 0))} className="field mono" style={{ width: "100%", fontWeight: 500, fontSize: 13 }} /></div>
                <div style={{ flex: 1 }}><label style={lbl}>Deadline H</label><input type="number" value={selNode.deadline} onChange={(e) => upd(selNode.id, "deadline", Math.max(1, Number(e.target.value) || 1))} className="field mono" style={{ width: "100%", fontWeight: 500, fontSize: 13 }} /></div>
              </div>
              <label style={lbl}>Required Tier</label>
              <div style={{ display: "flex", gap: 0, marginBottom: 16, border: `1px solid ${C.line}` }}>
                {[1, 2, 3].map((tv) => (
                  <button key={tv} onClick={() => upd(selNode.id, "tier", tv)} className="mono" style={{ flex: 1, padding: 8, border: "none", borderLeft: tv > 1 ? `1px solid ${C.line}` : "none", fontWeight: 500, fontSize: 12, cursor: "pointer", background: selNode.tier === tv ? C.hi : "transparent", color: selNode.tier === tv ? C.bg0 : C.dim }}>T{tv}</button>
                ))}
              </div>
              <label style={lbl}>Depends On</label>
              {earlier.length === 0 ? (
                <div className="mono" style={{ fontSize: 11, color: C.faint }}>root node — no earlier nodes</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0, border: `1px solid ${C.line}` }}>
                  {earlier.map((e, i) => {
                    const on = selNode.deps.includes(e.id);
                    return (
                      <button key={e.id} onClick={() => toggleDep(selNode.id, e.id)} className="mono" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 10px", borderTop: i > 0 ? `1px solid ${C.line}` : "none", fontSize: 12, cursor: "pointer", border: "none", background: on ? "rgba(203,90,96,0.12)" : "transparent", color: on ? C.green : C.tx }}>
                        <span>Node {idx(e.id)} · {e.skill}</span><span>{on ? "✓" : "+"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div style={{ border: `1px dashed ${C.line}`, padding: 20, textAlign: "center", color: C.faint, fontSize: 12, lineHeight: 1.5 }} className="mono">Select a node in the topography to set its task, allocation, deadline, tier &amp; dependencies.</div>
          )}
        </section>
      </aside>

      {/* ── right: topography (8 cols) ── */}
      <div className="lg:col-span-8 flex flex-col gap-6">
        <div className="masthead-rule w-full" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-mist pb-4">
          <h2 className="font-serif text-[32px] font-semibold uppercase tracking-tight">02 / Topography</h2>
          <div className="flex border border-mist">
            <div className="px-4 py-2 flex items-center gap-2 border-r border-mist">
              <span className="mono text-[12px] text-slate uppercase">Status</span>
              <span className="w-2 h-2 bg-oxblood-deep" />
              <span className="mono text-[13px] text-ink">DRAFTING</span>
            </div>
            <div className="px-4 py-2 flex items-center gap-2">
              <span className="mono text-[12px] text-slate uppercase">Nodes</span>
              <span className="mono text-[13px] text-ink">{String(nodes.length).padStart(2, "0")}</span>
            </div>
          </div>
        </div>
        <div className="border border-mist relative overflow-hidden flex flex-col" style={{ background: C.panel }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-mist">
            <span className="mono text-[12px] text-slate uppercase tracking-wider">DAG · {nodes.length} nodes</span>
            <div className="flex-1" />
            <button onClick={addNode} className="btn-outline mono" style={{ padding: "6px 12px", fontSize: 12, letterSpacing: ".05em", textTransform: "uppercase" }}>+ Add node</button>
          </div>
          <DagCanvas nodes={dagNodes} onNodeClick={setSel} selId={sel} height={520} />
        </div>
      </div>
    </div>
  );
}
