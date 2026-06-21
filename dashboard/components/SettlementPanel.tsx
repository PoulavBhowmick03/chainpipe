"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { nodePda, settlementPda, verifyDelivery, DISPUTE_SLOTS } from "@/lib/sdk";
import { buildPrograms, ADDRESSES, FACILITATOR_URL, explorerTx } from "@/lib/chainpipe";
import { statusKey } from "@/lib/format";
import { C, short } from "@/lib/theme";
import type { PipelineRecord, NodeRecord } from "@/lib/indexer";

type Settlement = { uri: string; resultHash: string; submittedAtSlot: number; disputeUntil: number; disputed: boolean };
type Check = { ok: boolean; actualHash: string | null; reason?: string };

/**
 * Consumer-facing optimistic-settlement panel: for each Submitted/Disputed node it shows
 * the on-chain delivery proof (uri + result_hash), a trustless "Verify delivery" check,
 * a dispute-window countdown, and Dispute / Finalize actions.
 */
export function SettlementPanel({ p }: { p: PipelineRecord }) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { connected } = useWallet();
  const [slot, setSlot] = useState(0);
  const [sets, setSets] = useState<Record<number, Settlement>>({});
  const [checks, setChecks] = useState<Record<number, Check>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const open = p.nodes.filter((n) => ["submitted", "disputed"].includes(statusKey(n.status)));

  const refresh = useCallback(async () => {
    if (open.length === 0) return;
    setSlot(await connection.getSlot("confirmed").catch(() => 0));
    const next: Record<number, Settlement> = {};
    await Promise.all(open.map(async (n: NodeRecord) => {
      try {
        const r = await fetch(`${FACILITATOR_URL}/settlement/${p.address}/${n.nodeIndex}`);
        if (r.ok) next[n.nodeIndex] = await r.json();
      } catch { /* facilitator offline — panel degrades to status only */ }
    }));
    setSets(next);
  }, [connection, p.address, open.length]);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  async function verify(idx: number) {
    const s = sets[idx];
    if (!s) return;
    setBusy(idx); setErr(null);
    const c = await verifyDelivery(s.uri, s.resultHash);
    setChecks((m) => ({ ...m, [idx]: c }));
    setBusy(null);
  }

  async function dispute(idx: number) {
    if (!wallet) { setErr("Connect the consumer wallet to dispute."); return; }
    setBusy(idx); setMsg(null); setErr(null);
    try {
      const { dag } = buildPrograms(connection, wallet);
      const pipeline = new PublicKey(p.address);
      const node = nodePda(ADDRESSES, pipeline, idx);
      // reason_code: 0 = HashMismatch if our verify failed, else 2 = IncorrectOutput (subjective)
      const reasonCode = checks[idx] && !checks[idx].ok ? 0 : 2;
      const sig = await dag.methods.disputeNode(idx, Array(32).fill(0), reasonCode).accountsPartial({
        pipeline, node, settlement: settlementPda(ADDRESSES, node), consumer: wallet.publicKey,
      }).rpc();
      setMsg(sig); await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  async function finalize(idx: number) {
    setBusy(idx); setMsg(null); setErr(null);
    try {
      const r = await fetch(`${FACILITATOR_URL}/finalize`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ pipelinePda: p.address, nodeIndex: idx }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "finalize failed");
      setMsg(json.signature); await refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  if (open.length === 0) return null;

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 15 }}>
      <div className="mono" style={{ fontWeight: 500, fontSize: 10, letterSpacing: ".1em", color: C.blue, marginBottom: 10 }}>
        OPTIMISTIC SETTLEMENT · {open.length} in window
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {open.map((n) => {
          const idx = n.nodeIndex;
          const s = sets[idx];
          const c = checks[idx];
          const remaining = s ? s.disputeUntil - slot : 0;
          const windowOpen = remaining > 0;
          const disputed = s?.disputed || statusKey(n.status) === "disputed";
          return (
            <div key={idx} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>node {idx} {disputed ? "· disputed" : "· submitted"}</span>
                <span className="mono" style={{ fontSize: 10, color: windowOpen ? C.amber : C.dim }}>
                  {s ? (windowOpen ? `${remaining} slots to dispute` : "window closed") : "settlement n/a"}
                </span>
              </div>
              {s && (
                <div className="mono" style={{ fontSize: 10, color: C.dim, marginBottom: 8, wordBreak: "break-all" }}>
                  <div>uri: <span style={{ color: C.tx }}>{s.uri || "—"}</span></div>
                  <div>result_hash: {short(s.resultHash)}</div>
                  {c && (
                    <div style={{ color: c.ok ? C.green : C.red, marginTop: 3 }}>
                      {c.ok ? "✓ delivery verified — sha256 matches on-chain hash" : `✗ ${c.reason ?? "hash mismatch"}`}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => verify(idx)} disabled={busy !== null || !s} style={btn(C.line2, C.hi)}>
                  {busy === idx ? "…" : "Verify delivery"}
                </button>
                {windowOpen && !disputed && (
                  <button onClick={() => dispute(idx)} disabled={busy !== null || !connected} style={btn(C.red, C.red)}>
                    Dispute
                  </button>
                )}
                {!windowOpen && !disputed && (
                  <button onClick={() => finalize(idx)} disabled={busy !== null} style={btn(C.green, C.green)}>
                    Finalize (pay agent)
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {err && <p className="mono" style={{ color: C.red, fontSize: 11, marginTop: 10, wordBreak: "break-word" }}>{err}</p>}
      {msg && <a href={explorerTx(msg)} target="_blank" rel="noreferrer" className="mono" style={{ color: C.green, fontSize: 11, marginTop: 10, display: "inline-block" }}>View transaction ↗</a>}
    </div>
  );
}

const btn = (border: string, color: string): React.CSSProperties => ({
  padding: "6px 12px", borderRadius: 6, border: `1px solid ${border}`, background: C.panel,
  color, fontWeight: 500, fontSize: 11, cursor: "pointer",
});
