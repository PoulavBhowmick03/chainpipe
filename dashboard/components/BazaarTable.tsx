"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAgents, type AgentRecord } from "@/lib/indexer";
import { usdc, shortKey, ema } from "@/lib/format";

type SortKey = "score" | "stake" | "settled";

export function BazaarTable() {
  const [agents, setAgents] = useState<AgentRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minTier, setMinTier] = useState(0);
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState<SortKey>("score");
  const [page, setPage] = useState(0);
  const PAGE = 20;

  useEffect(() => {
    getAgents()
      .then(setAgents)
      .catch((e) => setError(String(e)));
  }, []);

  const rows = useMemo(() => {
    if (!agents) return [];
    const filtered = agents.filter(
      (a) => a.tier >= minTier && (a.reputation?.emaScore ?? 0) >= minScore
    );
    filtered.sort((a, b) => {
      if (sort === "stake") return Number(b.stakeAmount) - Number(a.stakeAmount);
      if (sort === "settled")
        return (b.reputation?.totalSettled ?? 0) - (a.reputation?.totalSettled ?? 0);
      return (b.reputation?.emaScore ?? 0) - (a.reputation?.emaScore ?? 0);
    });
    return filtered;
  }, [agents, minTier, minScore, sort]);

  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);

  if (error)
    return <p className="text-red-300">Could not reach indexer. Is it running? ({error})</p>;
  if (!agents) return <p className="text-white/50">Loading agents…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          <div className="text-white/60 text-xs mb-1">Min tier</div>
          <select
            className="input"
            value={minTier}
            onChange={(e) => setMinTier(Number(e.target.value))}
          >
            <option value={0}>Any</option>
            <option value={1}>Tier 1+</option>
            <option value={2}>Tier 2+</option>
            <option value={3}>Tier 3</option>
          </select>
        </label>
        <label className="text-sm">
          <div className="text-white/60 text-xs mb-1">Min score</div>
          <input
            type="number"
            className="input w-28"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
          />
        </label>
        <label className="text-sm">
          <div className="text-white/60 text-xs mb-1">Sort by</div>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="score">Reputation</option>
            <option value="stake">Stake</option>
            <option value="settled">Jobs settled</option>
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="text-white/50">No agents match. Seed the registry or relax filters.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-white/50 text-left">
            <tr>
              <th className="py-2">Agent</th>
              <th>Tier</th>
              <th>EMA</th>
              <th>Stake</th>
              <th>Settled</th>
              <th>Failed</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((a) => (
              <tr key={a.agent} className="border-t border-white/10">
                <td className="py-2">
                  <Link href={`/agent/${a.agent}`} className="font-mono hover:text-accent">
                    {shortKey(a.agent, 6)}
                  </Link>
                </td>
                <td>{a.tier}</td>
                <td>{ema(a.reputation?.emaScore ?? 0)}</td>
                <td>{usdc(a.stakeAmount)}</td>
                <td className="text-accent">{a.reputation?.totalSettled ?? 0}</td>
                <td className="text-red-300">{a.reputation?.totalFailed ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rows.length > PAGE && (
        <div className="flex gap-2 items-center text-sm">
          <button className="btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Prev
          </button>
          <span className="text-white/60">
            Page {page + 1} / {Math.ceil(rows.length / PAGE)}
          </span>
          <button
            className="btn-ghost"
            disabled={(page + 1) * PAGE >= rows.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
