import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  connection,
  enqueueWrite,
  getOperatorKeypair,
  PROGRAM_IDS,
} from "./config.js";
import {
  configPda,
  decodeJob,
  ixDiscriminator,
  jobPda,
  skillPda,
  u64le,
} from "./anchor.js";
import { usedNonces } from "./verifier.js";
import type { SolanaPaymentDetails, SolanaPaymentProof, SettlementResult } from "./types.js";

export function settlePayment(
  details: SolanaPaymentDetails,
  proof: SolanaPaymentProof,
): Promise<SettlementResult> {
  return enqueueWrite(() => _settlePayment(details, proof));
}

/**
 * Solana settlement model: the consumer has already deposited into a job-PDA vault
 * via `create_job` (SDK/dashboard, consumer-signed — Solana has no ERC-20 pull/
 * allowance). The facilitator (operator) verifies the ed25519 proof and releases the
 * vault by calling `complete_job`, then records reputation via `record_job_completion`.
 */
async function _settlePayment(
  _details: SolanaPaymentDetails,
  proof: SolanaPaymentProof,
): Promise<SettlementResult> {
  const operator = getOperatorKeypair();
  const auth = proof.authorization;
  const consumer = new PublicKey(auth.consumer);
  const escrow = PROGRAM_IDS.x402Escrow;

  const [jobAddr] = jobPda(consumer, auth.jobId, escrow);
  const jobInfo = await connection.getAccountInfo(jobAddr);
  if (!jobInfo) {
    throw new Error(
      `Job PDA ${jobAddr.toBase58()} not found. Consumer must create_job (deposit) before settlement.`,
    );
  }
  const job = decodeJob(Buffer.from(jobInfo.data));

  const [cfgAddr] = configPda(escrow);
  const providerToken = getAssociatedTokenAddressSync(job.paymentMint, job.provider, true);
  const operatorToken = getAssociatedTokenAddressSync(job.paymentMint, operator.publicKey, true);

  const completeData = Buffer.concat([ixDiscriminator("complete_job"), u64le(auth.jobId)]);
  const completeIx = new TransactionInstruction({
    programId: escrow,
    keys: [
      { pubkey: cfgAddr, isSigner: false, isWritable: false },
      { pubkey: jobAddr, isSigner: false, isWritable: true },
      { pubkey: job.vault, isSigner: false, isWritable: true },
      { pubkey: consumer, isSigner: false, isWritable: false },
      { pubkey: job.provider, isSigner: false, isWritable: false },
      { pubkey: providerToken, isSigner: false, isWritable: true },
      { pubkey: operatorToken, isSigner: false, isWritable: true },
      { pubkey: operator.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: completeData,
  });

  const completeSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(completeIx),
    [operator],
  );

  usedNonces.set(`${auth.consumer}:${auth.nonce}`, Number(auth.validBefore));

  const score =
    proof.reputationScore !== undefined
      ? Math.max(0, Math.min(100, Math.round(proof.reputationScore)))
      : 75;

  let reputationSignature: string | undefined;
  try {
    reputationSignature = await recordReputation(auth.skillId, score);
  } catch (err) {
    console.warn("reputation write failed:", err instanceof Error ? err.message : err);
  }

  return {
    settlementSignature: completeSig,
    completeJobSignature: completeSig,
    jobId: auth.jobId,
    reputationSignature,
    reputationScore: score,
  };
}

/** Records a settled job on skill_registry (facilitator-gated record_job_completion). */
async function recordReputation(skillId: number, score: number): Promise<string> {
  const operator = getOperatorKeypair();
  const registry = PROGRAM_IDS.skillRegistry;
  const [cfgAddr] = configPda(registry);
  const [skillAddr] = skillPda(skillId, registry);

  const data = Buffer.concat([ixDiscriminator("record_job_completion"), u64le(score)]);
  const ix = new TransactionInstruction({
    programId: registry,
    keys: [
      { pubkey: cfgAddr, isSigner: false, isWritable: false },
      { pubkey: skillAddr, isSigner: false, isWritable: true },
      { pubkey: operator.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });
  return sendAndConfirmTransaction(connection, new Transaction().add(ix), [operator]);
}

/** Called after a skill execution to write an output-derived score on-chain. */
export function scoreJob(skillId: number, score: number): Promise<{ reputationSignature?: string }> {
  return enqueueWrite(async () => {
    const clamped = Math.max(0, Math.min(100, Math.round(score)));
    try {
      const sig = await recordReputation(skillId, clamped);
      return { reputationSignature: sig };
    } catch (err) {
      console.warn("scoreJob failed:", err instanceof Error ? err.message : err);
      return {};
    }
  });
}
