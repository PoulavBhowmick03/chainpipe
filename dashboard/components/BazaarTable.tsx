"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAgents, type AgentRecord } from "@/lib/indexer";
import { usdC, short } from "@/lib/theme";
import { repScore, agentTitle } from "@/lib/adapt";
import { TierBadge } from "@/components/primitives";

type SortKey = "rep" | "stake" | "jobs";

export function BazaarTable({ initialAgents }: { initialAgents?: AgentRecord[] }) {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentRecord[] | null>(initialAgents ?? null);
  const [tier, setTier] = useState(0);
  const [minRep, setMinRep] = useState(0);
  const [sort, setSort] = useState<SortKey>("rep");
  const [dir, setDir] = useState(-1);

  useEffect(() => {
    getAgents().then(setAgents).catch(() => setAgents(initialAgents ?? []));
  }, [initialAgents]);

  const rows = useMemo(() => {
    const list = (agents ?? []).filter((a) => a.reputation).filter((a) => (tier === 0 || a.tier === tier) && a.reputation!.emaScore / 100 >= minRep);
    const key = (a: AgentRecord) => (sort === "rep" ? a.reputation!.emaScore : sort === "stake" ? Number(a.stakeAmount) : a.reputation!.totalSettled);
    return list.sort((a, b) => (key(a) - key(b)) * dir);
  }, [agents, tier, minRep, sort, dir]);

  const setSortKey = (k: SortKey) => { if (sort === k) setDir(-dir); else { setSort(k); setDir(-1); } };
  const arrow = (k: SortKey) => (sort === k ? (dir < 0 ? " ↓" : " ↑") : "");

  const tierRows: [number, string][] = [[0, "All Agents"], [1, "Tier 1"], [2, "Tier 2"], [3, "Tier 3"]];

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-gutter gap-y-12">
      {/* filters */}
      <aside className="md:col-span-3 flex flex-col gap-8">
        <div>
          <h2 className="mono text-[12px] text-slate uppercase mb-6 tracking-widest">01 / Filters</h2>
          <ul className="flex flex-col border-t border-mist">
            {tierRows.map(([v, l]) => (
              <li key={v} className="border-b border-mist">
                <button
                  onClick={() => setTier(v)}
                  className="mono text-[14px] uppercase block w-full text-left py-3 transition-colors"
                  style={{ color: tier === v ? "#14F195" : "#F1ECE5" }}
                >
                  {l}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mono text-[12px] text-slate uppercase mb-3 tracking-widest">Min Reputation</h3>
          <div className="flex items-center gap-3 border-b border-ink pb-2">
            <input type="range" min={0} max={100} value={minRep} onChange={(e) => setMinRep(Number(e.target.value))} className="flex-1" />
            <span className="mono text-[14px] text-ink w-10 text-right">{minRep}%</span>
          </div>
        </div>

        <div>
          <h3 className="mono text-[12px] text-slate uppercase mb-3 tracking-widest">Sort By</h3>
          <div className="flex flex-col border-t border-mist">
            {([["rep", "Reputation"], ["stake", "Total Stake"], ["jobs", "Jobs Settled"]] as [SortKey, string][]).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setSortKey(k)}
                className="mono text-[13px] uppercase text-left py-2 border-b border-mist transition-colors"
                style={{ color: sort === k ? "#14F195" : "#F1ECE5" }}
              >
                {l}{arrow(k)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mono text-[12px] text-slate uppercase mb-3 tracking-widest">Stake Required</h3>
          <div className="border-b border-ink pb-2 mono text-[14px] text-ink">Min 10,000 USDC</div>
        </div>
      </aside>

      {/* registry */}
      <section className="md:col-span-9 flex flex-col">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="mono text-[12px] text-slate uppercase tracking-widest">02 / Agent Registry</h2>
          <span className="mono text-[12px] text-slate-dim">{rows.length} agents</span>
        </div>
        <div className="w-full overflow-x-auto scroll-x">
          <table className="w-full text-left border-collapse" style={{ minWidth: 640 }}>
            <thead>
              <tr className="bg-linen">
                <th className="font-serif text-[15px] text-slate border-b border-mist py-4 pr-4 font-normal">Agent Identity</th>
                <th className="font-serif text-[15px] text-slate border-b border-mist py-4 px-4 font-normal">Tier</th>
                <th className="font-serif text-[15px] text-slate border-b border-mist py-4 px-4 font-normal text-right cursor-pointer" onClick={() => setSortKey("rep")}>Reputation{arrow("rep")}</th>
                <th className="font-serif text-[15px] text-slate border-b border-mist py-4 px-4 font-normal text-right cursor-pointer" onClick={() => setSortKey("stake")}>Total Stake{arrow("stake")}</th>
                <th className="font-serif text-[15px] text-slate border-b border-mist py-4 pl-4 font-normal text-right cursor-pointer" onClick={() => setSortKey("jobs")}>Success / Fail{arrow("jobs")}</th>
              </tr>
            </thead>
            <tbody>
              {!agents && (
                <tr><td colSpan={5} className="py-5 mono text-[12px] text-slate-dim">Loading registry…</td></tr>
              )}
              {agents && rows.length === 0 && (
                <tr><td colSpan={5} className="py-5 mono text-[12px] text-slate-dim">No agents match these filters.</td></tr>
              )}
              {rows.map((a) => {
                const score = Number(repScore(a));
                const low = score < 90;
                return (
                  <tr
                    key={a.agent}
                    onClick={() => router.push(`/agent/${a.agent}`)}
                    className="border-b border-mist hover:bg-paper-dim transition-colors group cursor-pointer"
                  >
                    <td className="border-b border-mist py-5 pr-4">
                      <div className="flex flex-col sm:flex-row sm:items-baseline gap-x-3">
                        <span className="mono text-[13px] text-slate-dim w-24 shrink-0 truncate">{short(a.agent)}</span>
                        <span className="font-serif text-[15px] text-ink group-hover:text-oxblood-deep transition-colors">{agentTitle(a)}</span>
                      </div>
                    </td>
                    <td className="py-5 px-4"><TierBadge tier={a.tier} /></td>
                    <td className="py-5 px-4 text-right mono text-[14px]" style={{ color: low ? "#F2555A" : "#14F195" }}>{repScore(a)}%</td>
                    <td className="py-5 px-4 text-right mono text-[14px] text-ink">{usdC(a.stakeAmount)}</td>
                    <td className="py-5 pl-4 text-right mono text-[14px] text-ink">
                      {(a.reputation?.totalSettled ?? 0).toLocaleString()} / {a.reputation?.totalFailed ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
