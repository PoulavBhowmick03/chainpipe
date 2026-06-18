const BASE = process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://localhost:3002";

export interface Stats {
  totalPipelines: number;
  activePipelines: number;
  totalNodesSettled: number;
  totalUsdcSettled: string;
  totalUsdcRefunded: string;
  totalAgentsStaked: number;
  totalStakeValueUsdc: string;
}

export interface AgentRecord {
  address: string;
  agent: string;
  stakeMint: string;
  stakeAmount: string;
  tier: number;
  openJobs: number;
  totalSettled: number;
  totalSlashed: number;
  reputation: {
    emaScore: number;
    totalSettled: number;
    totalFailed: number;
  } | null;
}

export interface NodeRecord {
  nodeIndex: number;
  agent: string;
  allocationUsdc: string;
  deadlineSlot: string;
  dependencyMask: string;
  status: Record<string, unknown>;
  requiredTier: number;
  jobId: number[];
}

export interface PipelineRecord {
  address: string;
  consumer: string;
  totalNodes: number;
  totalUsdcLocked: string;
  nodesSettled: number;
  nodesExpired: number;
  status: Record<string, unknown>;
  nonce: string;
  nodes: NodeRecord[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`indexer ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export const getStats = () => get<Stats>("/stats");
export const getAgents = (q = "") => get<AgentRecord[]>(`/agents${q}`);
export const getAgent = (pk: string) => get<AgentRecord>(`/agents/${pk}`);
export const getPipelines = (q = "") => get<PipelineRecord[]>(`/pipelines${q}`);
export const getPipeline = (pda: string) => get<PipelineRecord>(`/pipelines/${pda}`);
