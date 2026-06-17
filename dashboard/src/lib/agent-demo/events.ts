// Shared event-stream shape for the replay orchestrator. The timeline component
// subscribes to this stream and renders state machines per step. AgentEvent
// intentionally does not contain `Decision` because per-agent decision shapes differ;
// decisions are carried as `unknown` and rendered by an agent-specific component.

export interface SettlementSummary {
  skillId: number;
  skillName: string;
  jobId: string;
  /** Solana settlement transaction signature (base58), if available. */
  settlementSignature?: string;
  /** explorer.solana.com link (tx or program address). */
  explorerUrl: string;
  /** Computed by the composite scorer after output is received. */
  score?: number;
}

export type AgentEvent =
  | { type: "started" }
  | { type: "step-running"; stepIndex: number }
  | { type: "step-settled"; stepIndex: number; settlement: SettlementSummary; output: unknown }
  | { type: "step-skipped"; stepIndex: number; reason: string }
  | { type: "step-failed"; stepIndex: number; error: string }
  | { type: "decision"; decision: unknown }
  | { type: "completed"; totalSpent: bigint; settlements: SettlementSummary[] }
  | { type: "aborted"; reason: string };
