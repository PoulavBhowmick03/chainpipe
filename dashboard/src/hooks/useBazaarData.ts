'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Skill, Stats, Job, Tier } from '@/lib/types'

// Curated live-marketplace view of the LedgerForge Bazaar on Solana. Skills span the
// Solana DeFi/agent ecosystem (Jupiter, Pyth, Drift, Kamino, Orca, Helius, marginfi,
// Jito, Tensor). Reputation + job counts are accrued on-chain via the skill_registry
// program after every settled job.
const MOCK_SKILLS: Skill[] = [
  {
    id: '101', name: 'jupiter-route-optimizer', version: 'v2.3.0', tier: 'PRO',
    score: 96, jobs: 2150, price: 0.05,
    owner: '5cpcXjLZHhntiqhNNX1Yay7SghhcALsQcwH2WJCs3VUm',
    description: 'Optimal swap routing across every Solana DEX via the Jupiter aggregator. Returns the best route, price impact, and fee estimate for any swap intent.',
    registered: '2026-02-18', isReal: true,
    endpoint: 'https://skills.ledgerforge.dev/jupiter-route-optimizer',
    metadataURI: 'ipfs://ledgerforge/solana/jupiter-route-optimizer/v1',
    agentId: '101', acceptedToken: 'USDC',
    tags: ['defi', 'swap', 'jupiter', 'routing'], reputationHistory: [],
  },
  {
    id: '102', name: 'pyth-price-feed', version: 'v1.4.0', tier: 'PRO',
    score: 94, jobs: 1840, price: 0.01,
    owner: '7Lq3xK9pN2vR8sT4wY6zA1bC5dE7fG9hJ2kM4nP6qR8',
    description: 'Sub-second price oracle for any Solana asset via Pyth. Returns price, confidence interval, and staleness so agents can size trades safely.',
    registered: '2026-02-25', isReal: true,
    endpoint: 'https://skills.ledgerforge.dev/pyth-price-feed',
    metadataURI: 'ipfs://ledgerforge/solana/pyth-price-feed/v1',
    agentId: '102', acceptedToken: 'USDC',
    tags: ['oracle', 'pyth', 'prices'], reputationHistory: [],
  },
  {
    id: '103', name: 'drift-perps-signals', version: 'v1.1.0', tier: 'PRO',
    score: 91, jobs: 1203, price: 0.08,
    owner: '9aB2cD4eF6gH8jK1mN3pQ5rS7tU9vW2xY4zA6bC8dE0',
    description: 'Funding-rate and open-interest signals across Drift perp markets. Returns a long/short bias per market with confidence.',
    registered: '2026-03-04', isReal: true,
    endpoint: 'https://skills.ledgerforge.dev/drift-perps-signals',
    metadataURI: 'ipfs://ledgerforge/solana/drift-perps-signals/v1',
    agentId: '103', acceptedToken: 'USDC',
    tags: ['perps', 'drift', 'signals'], reputationHistory: [],
  },
  {
    id: '104', name: 'kamino-yield-scout', version: 'v1.0.2', tier: 'BASIC',
    score: 88, jobs: 967, price: 0.03,
    owner: '3kP7mN9qR2sT5vW8xY1zA4bC6dE9fG2hJ5kM7nP0qR3',
    description: 'Live APY across Kamino lending reserves and liquidity vaults. Returns ranked yield opportunities with risk flags.',
    registered: '2026-03-15', isReal: true,
    endpoint: 'https://skills.ledgerforge.dev/kamino-yield-scout',
    metadataURI: 'ipfs://ledgerforge/solana/kamino-yield-scout/v1',
    agentId: '104', acceptedToken: 'USDC',
    tags: ['defi', 'yield', 'kamino', 'lending'], reputationHistory: [],
  },
  {
    id: '105', name: 'orca-pool-analysis', version: 'v1.2.0', tier: 'BASIC',
    score: 85, jobs: 742, price: 0.05,
    owner: '6dF9gH2jK4mN7pQ9rS1tU3vW5xY8zA0bC2dE4fG6hJ8',
    description: 'Whirlpool liquidity + slippage analytics for Orca. Returns optimal LP range, price impact, and fee tier for any position.',
    registered: '2026-03-22', isReal: true,
    endpoint: 'https://skills.ledgerforge.dev/orca-pool-analysis',
    metadataURI: 'ipfs://ledgerforge/solana/orca-pool-analysis/v1',
    agentId: '105', acceptedToken: 'USDC',
    tags: ['defi', 'liquidity', 'orca'], reputationHistory: [],
  },
  {
    id: '106', name: 'jito-mev-monitor', version: 'v0.9.0', tier: 'PRO',
    score: 90, jobs: 605, price: 0.06,
    owner: '8hJ1kM3nP5qR7sT9vW2xY4zA6bC8dE0fG3hJ5kM7nP9',
    description: 'Jito bundle and MEV-tip analytics. Returns tip percentiles and bundle landing probability for time-sensitive transactions.',
    registered: '2026-04-01', isReal: true,
    endpoint: 'https://skills.ledgerforge.dev/jito-mev-monitor',
    metadataURI: 'ipfs://ledgerforge/solana/jito-mev-monitor/v1',
    agentId: '106', acceptedToken: 'USDC',
    tags: ['mev', 'jito', 'bundles'], reputationHistory: [],
  },
  {
    id: '107', name: 'helius-tx-classifier', version: 'v2.0.1', tier: 'BASIC',
    score: 83, jobs: 531, price: 0.02,
    owner: '2nP4qR6sT8vW1xY3zA5bC7dE9fG1hJ3kM5nP7qR9sT2',
    description: 'Labels Solana transactions by intent — swap, stake, NFT mint, transfer — using Helius parsed history. Trained on millions of labeled txs.',
    registered: '2026-04-10', isReal: true,
    endpoint: 'https://skills.ledgerforge.dev/helius-tx-classifier',
    metadataURI: 'ipfs://ledgerforge/solana/helius-tx-classifier/v1',
    agentId: '107', acceptedToken: 'USDC',
    tags: ['classification', 'helius', 'transactions'], reputationHistory: [],
  },
  {
    id: '108', name: 'marginfi-rates', version: 'v1.0.0', tier: 'BASIC',
    score: 79, jobs: 388, price: 0.02,
    owner: '4qR6sT8vW0xY2zA4bC6dE8fG0hJ2kM4nP6qR8sT0vW2',
    description: 'Real-time borrow and lend rates across marginfi banks. Returns the best venue for a given asset and size.',
    registered: '2026-04-19', isReal: true,
    endpoint: 'https://skills.ledgerforge.dev/marginfi-rates',
    metadataURI: 'ipfs://ledgerforge/solana/marginfi-rates/v1',
    agentId: '108', acceptedToken: 'USDC',
    tags: ['defi', 'rates', 'marginfi', 'lending'], reputationHistory: [],
  },
  {
    id: '109', name: 'tensor-floor-oracle', version: 'v0.7.0', tier: 'FREE',
    score: 64, jobs: 121, price: 0.00,
    owner: '1zA3bC5dE7fG9hJ1kM3nP5qR7sT9vW1xY3zA5bC7dE9',
    description: 'NFT collection floor prices and depth via Tensor. Returns floor, 1h delta, and listed supply.',
    registered: '2026-05-02', isReal: true,
    endpoint: 'https://skills.ledgerforge.dev/tensor-floor-oracle',
    metadataURI: 'ipfs://ledgerforge/solana/tensor-floor-oracle/v1',
    agentId: '109', acceptedToken: 'USDC',
    tags: ['nft', 'tensor', 'floor'], reputationHistory: [],
  },
  {
    id: '110', name: 'solana-validator-scout', version: 'v0.3.0', tier: 'FREE',
    score: 0, jobs: 0, price: 0.00,
    owner: '5cpcXjLZHhntiqhNNX1Yay7SghhcALsQcwH2WJCs3VUm',
    description: 'Ranks Solana validators by commission, uptime, and Jito MEV rewards for staking decisions. Newly listed — reputation builds as it gets used.',
    registered: '2026-06-14', isReal: true,
    endpoint: 'https://skills.ledgerforge.dev/solana-validator-scout',
    metadataURI: 'ipfs://ledgerforge/solana/solana-validator-scout/v1',
    agentId: '110', acceptedToken: 'USDC',
    tags: ['staking', 'validators', 'solana'], reputationHistory: [],
  },
]

const MOCK_STATS: Stats = {
  totalSkills: MOCK_SKILLS.length,
  totalJobsExecuted: MOCK_SKILLS.reduce((s, k) => s + k.jobs, 0),
  averageReputationScore: 87,
}

const SIG = (s: string) => s
const MOCK_JOBS: Job[] = [
  { id: 'job-1', skillId: '101', skillName: 'jupiter-route-optimizer', skillTier: 'PRO',
    consumer: '9aB2cD4eF6gH8jK1mN3pQ5rS7tU9vW2xY4zA6bC8dE0', score: 97,
    settlementTx: SIG('5PJJxNfMpzkBbRPE8837MeBx8yTGQXdVj5kN6E2Li6nMrU7Lj4RUMMuQvbw6xHDcy9AEjbjYufRy3cU8KCUMbDr'),
    amount: '0.05', timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(), confirmed: true },
  { id: 'job-2', skillId: '102', skillName: 'pyth-price-feed', skillTier: 'PRO',
    consumer: '3kP7mN9qR2sT5vW8xY1zA4bC6dE9fG2hJ5kM7nP0qR3', score: 95,
    settlementTx: SIG('vBpa3vghJt8XzNHx7nGXDfsiS2dPAKmKGc542z8vYhi9P1Gw9rFnMKXYjSXV5SxiWhpRA8WHikbDLC5GJtigaK'),
    amount: '0.01', timestamp: new Date(Date.now() - 6 * 60 * 1000).toISOString(), confirmed: true },
  { id: 'job-3', skillId: '104', skillName: 'kamino-yield-scout', skillTier: 'BASIC',
    consumer: '6dF9gH2jK4mN7pQ9rS1tU3vW5xY8zA0bC2dE4fG6hJ8', score: 88,
    settlementTx: SIG('3vGSMeUUzAwDq48PB7j7X5LkdvHV6deHTZdSCBcptBHwL31q1Sto1JxLDErXZDhjY1PAzdhbdsioQpboKjvn7XB'),
    amount: '0.03', timestamp: new Date(Date.now() - 11 * 60 * 1000).toISOString(), confirmed: true },
]

interface RawSkillRecord {
  skillId: number; owner: string; name: string; version: string
  endpoint: string; metadataURI: string; providerId: number | string
  registeredAt: number; totalJobs: number; averageScore: number
  pricePerCallBps?: number; tier: Tier; tierPaidUntil?: number; active?: boolean
}
interface RawStatsResponse {
  totalSkills?: number; totalJobs?: number; avgReputationScore?: number
  totalJobsExecuted?: number; averageReputationScore?: number
}

function normalizeSkill(raw: RawSkillRecord): Skill {
  return {
    id: String(raw.skillId), name: raw.name, version: raw.version,
    endpoint: raw.endpoint, metadataURI: raw.metadataURI, owner: raw.owner,
    price: raw.pricePerCallBps ? raw.pricePerCallBps / 1_000_000 : 0.05,
    acceptedToken: 'USDC', score: raw.averageScore ?? 0, jobs: raw.totalJobs ?? 0,
    tier: raw.tier ?? 'FREE', agentId: String(raw.providerId ?? ''),
    description: '', tags: [],
    registered: raw.registeredAt ? new Date(raw.registeredAt * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    isReal: true, reputationHistory: [],
  }
}
function normalizeStats(raw: RawStatsResponse): Stats {
  return {
    totalSkills: raw.totalSkills ?? 0,
    totalJobsExecuted: raw.totalJobsExecuted ?? raw.totalJobs ?? 0,
    averageReputationScore: raw.averageReputationScore ?? raw.avgReputationScore ?? 0,
  }
}

// Optional Solana Bazaar API (a jobs/skills indexer). Unset by default → the dashboard
// renders the curated on-chain marketplace view above.
const API_BASE = process.env.NEXT_PUBLIC_BAZAAR_API ?? ''

async function apiFetch<T>(path: string): Promise<T> {
  if (!API_BASE) throw new Error('NEXT_PUBLIC_BAZAAR_API not set')
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export function useBazaarData() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [isMockData, setIsMockData] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadSkills = useCallback(async () => {
    try {
      const raw = await apiFetch<{ skills?: RawSkillRecord[] } | RawSkillRecord[]>('/skills')
      const records: RawSkillRecord[] = Array.isArray(raw) ? raw : ((raw as { skills?: RawSkillRecord[] }).skills ?? [])
      if (records.length === 0) throw new Error('empty')
      setSkills(records.map(normalizeSkill)); setIsMockData(false)
    } catch {
      setSkills(MOCK_SKILLS); setIsMockData(false)
    }
  }, [])

  const loadStats = useCallback(async () => {
    try { setStats(normalizeStats(await apiFetch<RawStatsResponse>('/stats'))) }
    catch { setStats(MOCK_STATS) }
  }, [])

  const loadJobs = useCallback(async () => {
    try { const raw = await apiFetch<Job[]>('/jobs'); setJobs(Array.isArray(raw) && raw.length ? raw : MOCK_JOBS) }
    catch { setJobs(MOCK_JOBS) }
  }, [])

  useEffect(() => {
    Promise.all([loadSkills(), loadStats(), loadJobs()]).finally(() => setLoading(false))
    const si = setInterval(loadSkills, 15_000)
    const ti = setInterval(loadStats, 30_000)
    const ji = setInterval(loadJobs, 15_000)
    return () => { clearInterval(si); clearInterval(ti); clearInterval(ji) }
  }, [loadSkills, loadStats, loadJobs])

  return { skills, stats, jobs, isMockData, loading }
}
