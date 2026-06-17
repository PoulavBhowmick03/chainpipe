// Replay orchestrator (Solana): emits the same AgentEvent stream as a live run
// but synthesizes a recorded walk over the agent's skill steps, linking each
// settlement to the deployed programs on Solana devnet. This avoids needing an
// in-browser funded wallet. A full per-job replay (reading settled Job PDAs +
// their tx signatures) is a follow-up once a Solana jobs-indexer HTTP API exists
// — see MIGRATION.md.

import type { AgentEvent, SettlementSummary } from './events'
import type { AgentSpec } from './specs'

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet'
const ESCROW_PROGRAM = 'Ec48mwadrna8FC5rJ24K5R5fMVCBFBzhbbeFkf6skiYq'
const programExplorer = `https://explorer.solana.com/address/${ESCROW_PROGRAM}?cluster=${CLUSTER}`

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Async iterable mirroring a live run, with simulated pacing, against Solana data. */
export async function* runReplay<T>(
  spec: AgentSpec<T>,
  opts: { stepDelayMs?: number } = {},
): AsyncIterable<AgentEvent> {
  const stepDelay = opts.stepDelayMs ?? 1200
  yield { type: 'started' }

  const settlements: SettlementSummary[] = []
  const outputs: unknown[] = new Array(spec.steps.length).fill(undefined)

  for (let i = 0; i < spec.steps.length; i++) {
    const step = spec.steps[i]
    yield { type: 'step-running', stepIndex: i }
    await sleep(stepDelay)

    const settlement: SettlementSummary = {
      skillId: step.skillId,
      skillName: step.label,
      jobId: `replay-${step.skillId}-${i}`,
      settlementSignature: undefined,
      explorerUrl: programExplorer,
    }
    settlements.push(settlement)
    outputs[i] = { __replay: true }

    yield { type: 'step-settled', stepIndex: i, settlement, output: outputs[i] }
  }

  yield {
    type: 'decision',
    decision: {
      action: 'REPLAY',
      reason:
        'Recorded walk of the agent’s skill steps against the deployed Solana programs (devnet). ' +
        'Each step maps to register → create_job → complete_job → record_job_completion on-chain; ' +
        'see DEPLOYED.md for executed-flow tx signatures and the live Bazaar for current reputation.',
      confidence: 100,
    },
  }

  yield {
    type: 'completed',
    totalSpent: spec.pricePerCall * BigInt(settlements.length),
    settlements,
  }
}
