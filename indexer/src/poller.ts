import { Connection } from "@solana/web3.js";
import {
  loadPrograms,
  getAgentsByTier,
  getPipeline,
  ChainPipeAddresses,
} from "@chainpipe/solana";
import { Store } from "./store";
import { serialize, computeStats, RawPipeline } from "./decoder";

/** One poll cycle: fetch agents + pipelines, decode, recompute stats, persist. */
export async function pollOnce(
  connection: Connection,
  addresses: ChainPipeAddresses,
  store: Store
): Promise<void> {
  const agents = await getAgentsByTier(connection, 1, addresses);

  const { dag } = loadPrograms(connection, addresses);
  const all = await dag.account.pipeline.all();
  const raw: RawPipeline[] = [];
  for (const p of all) {
    const full = await getPipeline(connection, p.publicKey, addresses);
    if (!full) continue;
    raw.push({ address: p.publicKey, ...full } as unknown as RawPipeline);
  }

  const stats = computeStats(agents, raw);
  store.update(raw.map(serialize), agents.map(serialize), stats, Date.now());
}

export function startPolling(
  connection: Connection,
  addresses: ChainPipeAddresses,
  store: Store,
  intervalMs = 5000
): NodeJS.Timeout {
  const tick = async () => {
    try {
      await pollOnce(connection, addresses, store);
    } catch (e) {
      console.error("[indexer] poll error:", String(e));
    }
  };
  void tick();
  return setInterval(tick, intervalMs);
}
