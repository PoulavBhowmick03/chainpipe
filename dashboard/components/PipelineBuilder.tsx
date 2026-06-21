"use client";

import { useState } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import BN from "bn.js";
import { pipelinePda, nodePda, vaultAta, pipelineConfigPda } from "@/lib/sdk";
import { buildPrograms, ADDRESSES, explorerTx } from "@/lib/chainpipe";
import { C, usd } from "@/lib/theme";
import { DagCanvas, type DagNode } from "@/components/DagCanvas";

const SKILLS = ["code-gen", "data-fetch", "report-synthesis", "image-gen", "audio-transcribe"];
const SLOTS_PER_HOUR = 9000;

interface Draft { id: number; skill: string; alloc: number; deadline: number; tier: number; deps: number[] }

export function PipelineBuilder() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [nodes, setNodes] = useState<Draft[]>([
    { id: 1, skill: "data-fetch", alloc: 30, deadline: 6, tier: 1, deps: [] },
    { id: 2, skill: "code-gen", alloc: 60, deadline: 14, tier: 1, deps: [1] },
    { id: 3, skill: "report-synthesis", alloc: 40, deadline: 24, tier: 1, deps: [2] },
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
  const addNode = () => { const id = nextId; setNodes((ns) => [...ns, { id, skill: "data-fetch", alloc: 20, deadline: 24, tier: 1, deps: [] }]); setNextId(id + 1); setSel(id); };
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
      setResult({ sig, pda: pipeline.toBase58() });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const lbl = { fontFamily: "var(--font-geist-mono)", fontWeight: 500, fontSize: 10, letterSpacing: ".08em", color: C.dim, display: "block", marginBottom: 6 } as React.CSSProperties;
  const earlier = selNode ? nodes.slice(0, idx(selNode.id)) : [];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "stretch" }}>
      {/* canvas */}
      <div className="surface" style={{ flex: "3 1 460px", minWidth: 300, overflow: "hidden", display: "flex", flexDirection: "column", padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.line}`, background: C.bg }}>
          <span className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".1em", color: C.dim }}>DAG · {nodes.length} NODES</span>
          <div style={{ flex: 1 }} />
          <button onClick={addNode} className="lift" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 7, border: `1px solid ${C.line2}`, background: C.panel, color: C.hi, fontWeight: 500, fontSize: 12, cursor: "pointer" }}><span className="mono" style={{ color: C.green }}>+</span> Add node</button>
        </div>
        <DagCanvas nodes={dagNodes} onNodeClick={setSel} selId={sel} height={320} />
      </div>

      {/* sidebar */}
      <div style={{ flex: "1 1 290px", minWidth: 270, display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="surface-raised" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <span className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".12em", color: C.dim }}>BUDGET LOCKED</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="mono" style={{ fontWeight: 500, fontSize: 13, color: C.dim }}>$</span>
              <input type="number" value={budget} onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))} className="field mono" style={{ width: 74, fontWeight: 500, fontSize: 14, textAlign: "right" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <span className="mono" style={{ fontWeight: 600, fontSize: 30, letterSpacing: "-.02em", color: over ? C.red : C.hi }}>{usd(total * 1e6, 2)}</span>
            <span className="mono" style={{ fontSize: 12, color: C.dim }}>/ {usd(budget * 1e6, 0)}</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: C.bg0, overflow: "hidden", boxShadow: "inset 0 1px 2px rgba(0,0,0,.6)" }}><div style={{ height: "100%", width: Math.min(100, budget ? (total / budget) * 100 : 0) + "%", background: `linear-gradient(90deg, ${over ? C.red : C.green}55, ${over ? C.red : C.green})`, boxShadow: `0 0 10px ${over ? C.red : C.green}66`, transition: "width .3s var(--ease)" }} /></div>
          <div className="mono" style={{ fontSize: 11, color: over ? C.red : C.dim, marginTop: 8 }}>{over ? "over budget by " + usd(-remain * 1e6, 2) : usd(remain * 1e6, 2) + " unallocated"}</div>
        </div>

        {selNode ? (
          <div className="surface" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span className="mono" style={{ fontWeight: 500, fontSize: 11, letterSpacing: ".1em", color: C.tx }}>NODE {idx(selNode.id)}</span>
              <button onClick={() => removeNode(selNode.id)} className="mono" style={{ background: "none", border: "none", color: C.red, fontWeight: 500, fontSize: 11, cursor: "pointer" }}>remove</button>
            </div>
            <label style={lbl}>SKILL</label>
            <select value={selNode.skill} onChange={(e) => upd(selNode.id, "skill", e.target.value)} className="field" style={{ width: "100%", fontFamily: "var(--font-geist)", fontSize: 13, marginBottom: 14 }}>
              {SKILLS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}><label style={lbl}>ALLOC USDC</label><input type="number" value={selNode.alloc} onChange={(e) => upd(selNode.id, "alloc", Math.max(0, Number(e.target.value) || 0))} className="field mono" style={{ width: "100%", fontWeight: 500, fontSize: 13 }} /></div>
              <div style={{ flex: 1 }}><label style={lbl}>DEADLINE H</label><input type="number" value={selNode.deadline} onChange={(e) => upd(selNode.id, "deadline", Math.max(1, Number(e.target.value) || 1))} className="field mono" style={{ width: "100%", fontWeight: 500, fontSize: 13 }} /></div>
            </div>
            <label style={lbl}>REQUIRED TIER</label>
            <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
              {[1, 2, 3].map((tv) => (
                <button key={tv} onClick={() => upd(selNode.id, "tier", tv)} className="mono" style={{ flex: 1, padding: 7, borderRadius: 6, fontWeight: 500, fontSize: 12, cursor: "pointer", border: `1px solid ${selNode.tier === tv ? C.line2 : C.line}`, background: selNode.tier === tv ? C.raised : "transparent", color: selNode.tier === tv ? C.hi : C.dim }}>T{tv}</button>
              ))}
            </div>
            <label style={lbl}>DEPENDS ON</label>
            {earlier.length === 0 ? (
              <div className="mono" style={{ fontSize: 11, color: C.faint }}>root node — no earlier nodes</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {earlier.map((e) => {
                  const on = selNode.deps.includes(e.id);
                  return (
                    <button key={e.id} onClick={() => toggleDep(selNode.id, e.id)} className="mono" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: `1px solid ${on ? "#1d3a2c" : C.line}`, background: on ? "#0c1712" : C.panel, color: on ? C.green : C.tx }}>
                      <span>Node {idx(e.id)} · {e.skill}</span><span>{on ? "✓" : "+"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: 20, textAlign: "center", color: C.faint, fontSize: 12, lineHeight: 1.5 }}>Select a node to set allocation, deadline, tier &amp; dependencies.</div>
        )}

        <button onClick={create} disabled={busy || !wallet} className="lift" style={{ padding: 13, borderRadius: 8, border: `1px solid ${valid && wallet ? C.hi : C.line}`, fontWeight: 600, fontSize: 13, cursor: valid && wallet ? "pointer" : "not-allowed", background: valid && wallet ? C.hi : "transparent", color: valid && wallet ? C.bg0 : C.faint, boxShadow: valid && wallet ? "0 0 18px rgba(20,241,149,.12)" : "none" }}>
          {busy ? "Locking…" : !wallet ? "Connect wallet to create" : valid ? `Lock ${usd(total * 1e6, 2)} · create` : "Fix allocation to continue"}
        </button>
        {error && <div className="mono" style={{ fontSize: 11, color: C.red, textAlign: "center", wordBreak: "break-word" }}>{error}</div>}
        {result && (
          <div style={{ border: `1px solid #1d3a2c`, borderRadius: 10, padding: 14, background: "#0c1712" }}>
            <div className="mono" style={{ color: C.green, fontSize: 12, marginBottom: 4 }}>Pipeline created.</div>
            <div className="mono" style={{ fontSize: 11, color: C.tx, wordBreak: "break-all", marginBottom: 6 }}>{result.pda}</div>
            <a href={explorerTx(result.sig)} target="_blank" rel="noreferrer" className="mono" style={{ color: C.green, fontSize: 11 }}>View transaction ↗</a>
          </div>
        )}
      </div>
    </div>
  );
}
