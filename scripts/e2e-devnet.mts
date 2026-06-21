/**
 * ChainPipe E2E Devnet Script
 *
 * Full lifecycle with real devnet transactions:
 *   1-3. Stake Agent A (Tier 1), B (Tier 2), C (Tier 3)
 *   4.   Create a 3-node pipeline (100 USDC locked)
 *   5.   Agent A claims + completes Node 0 (settlement + fee + reputation)
 *   6.   Agent C claims + completes Node 2 (Tier-3-gated, depends on Node 0)
 *   7.   Agent B claims Node 1, lets it expire → slash + failure reputation + refund
 *   8.   Final state: pipeline PartiallyRefunded, reputations + slash on-chain
 *
 * Uses a freshly-created 6-decimal test mint (the programs are mint-agnostic),
 * since Circle devnet USDC can't be minted to test agents.
 *
 * Usage: npx tsx scripts/e2e-devnet.mts
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { readFileSync } from "fs";
import { homedir } from "os";
import {
  DEVNET_ADDRESSES,
  ChainPipeAddresses,
  stakeAndRegister,
  createPipeline,
  claimNode,
  completeNode,
  expireNode,
  getPipeline,
  getAgentReputation,
  getAgentStake,
  submitCompletion,
  finalizeNode,
  disputeNode,
  resolveDispute,
  getSettlement,
  decodeUri,
  DISPUTE_SLOTS,
} from "@chainpipe/solana";
import { createHash } from "crypto";

const USDC = 1_000_000;
const sha256 = (s: string) => new Uint8Array(createHash("sha256").update(s).digest());
const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const ex = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

function loadKeypair(path: string): Keypair {
  const p = path.replace(/^~/, homedir());
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf-8"))));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Public devnet RPC is aggressively rate-limited; throttle between operations.
const THROTTLE = Number(process.env.E2E_THROTTLE_MS ?? 2500);
const beat = () => sleep(THROTTLE);

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const operator = loadKeypair(process.env.ANCHOR_WALLET ?? `${homedir()}/.config/solana/id.json`);
  const facilitator = loadKeypair("./keys/facilitator.json");

  console.log("ChainPipe E2E — devnet");
  console.log("  operator   ", operator.publicKey.toBase58());
  console.log("  facilitator", facilitator.publicKey.toBase58());

  // Fund facilitator + ephemeral actors from the operator wallet.
  const consumer = Keypair.generate();
  const agentA = Keypair.generate();
  const agentB = Keypair.generate();
  const agentC = Keypair.generate();

  const fund = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: facilitator.publicKey, lamports: 0.3 * LAMPORTS_PER_SOL }),
    SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: consumer.publicKey, lamports: 0.25 * LAMPORTS_PER_SOL }),
    SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: agentA.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL }),
    SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: agentB.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL }),
    SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: agentC.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL })
  );
  await sendAndConfirmTransaction(connection, fund, [operator]);
  await beat();

  // Fresh test mint; programs accept any mint as the stake/payment token.
  const mint = await createMint(connection, operator, operator.publicKey, null, 6);
  await beat();
  const addresses: ChainPipeAddresses = { ...DEVNET_ADDRESSES, usdcMint: mint };
  console.log("  test mint  ", mint.toBase58(), "\n");

  // Seed token balances.
  const operatorTreasury = (await getOrCreateAssociatedTokenAccount(connection, operator, mint, operator.publicKey)).address;
  const consumerAta = (await getOrCreateAssociatedTokenAccount(connection, operator, mint, consumer.publicKey)).address;
  await beat();
  await mintTo(connection, operator, mint, consumerAta, operator.publicKey, 200 * USDC);
  await beat();
  for (const [agent, amt] of [[agentA, 10], [agentB, 100], [agentC, 1000]] as const) {
    const ata = (await getOrCreateAssociatedTokenAccount(connection, operator, mint, agent.publicKey)).address;
    await beat();
    await mintTo(connection, operator, mint, ata, operator.publicKey, amt * USDC);
    await beat();
  }

  // 1-3: stake
  const tiers: Record<string, number> = {};
  for (const [label, agent, amt] of [["A", agentA, 10], ["B", agentB, 100], ["C", agentC, 1000]] as const) {
    const r = await stakeAndRegister(connection, agent, BigInt(amt * USDC), mint, addresses);
    tiers[label] = r.tier;
    console.log(`[${label === "A" ? 1 : label === "B" ? 2 : 3}/8] Staked Agent ${label} (${amt} USDC)`);
    console.log("  ✓ Tx:", ex(r.signature));
    console.log(`  ✓ Tier: ${r.tier}\n`);
    await beat();
  }

  // 4: create pipeline — node0 (40, no dep), node1 (35, no dep, short deadline),
  //    node2 (25, depends on node0, requires Tier 3)
  const SHORT = 70; // ~28s
  const FAR = 100_000;
  const { signature: createSig, pipelinePda, nodePdas } = await createPipeline(
    connection,
    consumer,
    [
      { allocationUsdc: BigInt(40 * USDC), deadlineSlotsFromNow: BigInt(FAR), dependencyMask: 0n, requiredTier: 1 },
      { allocationUsdc: BigInt(35 * USDC), deadlineSlotsFromNow: BigInt(SHORT), dependencyMask: 0n, requiredTier: 1 },
      { allocationUsdc: BigInt(25 * USDC), deadlineSlotsFromNow: BigInt(FAR), dependencyMask: 0b001n, requiredTier: 3 },
    ],
    addresses
  );
  console.log("[4/8] Created 3-node pipeline (100 USDC locked)");
  console.log("  ✓ Tx:", ex(createSig));
  console.log("  ✓ Pipeline:", pipelinePda.toBase58(), "\n");
  await beat();

  // B claims node 1 immediately (before its short deadline).
  const claimB = await claimNode(connection, agentB, pipelinePda, 1, addresses);
  console.log("[5/8] Agent B claims Node 1 (will be left to expire)");
  console.log("  ✓ Claim Tx:", ex(claimB.signature), "\n");
  await beat();

  // A claims + completes node 0.
  await claimNode(connection, agentA, pipelinePda, 0, addresses);
  await beat();
  const compA = await completeNode(connection, facilitator, pipelinePda, 0, agentA.publicKey, 1000, operatorTreasury, addresses);
  const repA = await getAgentReputation(connection, agentA.publicKey, addresses);
  console.log("[6/8] Agent A claims + completes Node 0 (40 USDC, 20bps fee)");
  console.log("  ✓ Complete Tx:", ex(compA.signature));
  console.log(`  ✓ Agent A EMA: ${repA?.emaScore}\n`);
  await beat();

  // C claims + completes node 2 (Tier-3 gated, depends on settled node 0).
  await claimNode(connection, agentC, pipelinePda, 2, addresses);
  await beat();
  const compC = await completeNode(connection, facilitator, pipelinePda, 2, agentC.publicKey, 700, operatorTreasury, addresses);
  const repC = await getAgentReputation(connection, agentC.publicKey, addresses);
  console.log("[7/8] Agent C claims + completes Node 2 (Tier-3 gated)");
  console.log("  ✓ Complete Tx:", ex(compC.signature));
  console.log(`  ✓ Agent C EMA: ${repC?.emaScore}\n`);

  // Wait for node 1 deadline, then expire (slash B + failure + refund).
  const before = await getPipeline(connection, pipelinePda, addresses);
  const deadline = before!.nodes[1].deadlineSlot.toNumber();
  process.stdout.write("  …waiting for Node 1 deadline to pass ");
  while ((await connection.getSlot("confirmed")) <= deadline + 1) {
    process.stdout.write(".");
    await sleep(2000);
  }
  console.log("");
  const consumerBefore = Number((await getAccount(connection, consumerAta)).amount);
  const expSig = await expireNode(connection, facilitator, pipelinePda, 1, addresses);
  const stakeB = await getAgentStake(connection, agentB.publicKey, addresses);
  const repB = await getAgentReputation(connection, agentB.publicKey, addresses);
  const consumerAfter = Number((await getAccount(connection, consumerAta)).amount);
  console.log("[8/8] Expire Node 1 → slash Agent B + failure reputation + refund");
  console.log("  ✓ Expire Tx:", ex(expSig.signature));
  console.log(`  ✓ Consumer refunded + slash: ${((consumerAfter - consumerBefore) / USDC).toFixed(2)} USDC`);
  console.log(`  ✓ Agent B stake after slash: ${(stakeB!.stakeAmount.toNumber() / USDC).toFixed(2)} USDC (tier ${stakeB!.tier})\n`);

  // ── Optimistic settlement + proof-of-delivery demo ────────────────────────
  // A second pipeline showing: submit_completion (with content-addressed delivery
  // proof) → dispute within window → arbiter resolve, and → finalize after window.
  console.log("\n── OPTIMISTIC SETTLEMENT + PROOF-OF-DELIVERY ──\n");
  const PROOF_NONCE = BigInt(Date.now());
  const proof = await createPipeline(
    connection, consumer,
    [
      { allocationUsdc: BigInt(20 * USDC), deadlineSlotsFromNow: 5_000n, dependencyMask: 0n, requiredTier: 1 },
      { allocationUsdc: BigInt(15 * USDC), deadlineSlotsFromNow: 5_000n, dependencyMask: 0n, requiredTier: 1 },
    ],
    addresses, PROOF_NONCE
  );
  console.log("[proof 1/4] Created 2-node pipeline:", ex(proof.signature));
  await beat();

  // Node 0: agent A submits a delivery (uri + sha256), consumer accepts (finalize after window).
  await claimNode(connection, agentA, proof.pipelinePda, 0, addresses);
  await beat();
  const uri0 = "ipfs://bafkreigooddeliverynode0proofofdelivery";
  const sub0 = await submitCompletion(connection, facilitator, proof.pipelinePda, 0, agentA.publicKey, 900, addresses, sha256(uri0 + ":payload"), uri0);
  const set0 = await getSettlement(connection, proof.pipelinePda, 0, addresses);
  console.log("[proof 2/4] Agent A submits Node 0 w/ delivery proof:", ex(sub0.signature));
  console.log(`  ✓ uri: ${decodeUri(set0!.uri as number[], set0!.uriLen)}  (dispute window ${DISPUTE_SLOTS} slots)`);
  await beat();

  // Node 1: agent B submits, consumer disputes (hash mismatch), arbiter upholds → refund + slash.
  await claimNode(connection, agentB, proof.pipelinePda, 1, addresses);
  await beat();
  const uri1 = "ipfs://bafkreibaddeliverynode1willbedisputed";
  await submitCompletion(connection, facilitator, proof.pipelinePda, 1, agentB.publicKey, 800, addresses, sha256(uri1 + ":claimed"), uri1);
  await beat();
  const disp = await disputeNode(connection, consumer, proof.pipelinePda, 1, addresses, sha256("hash-mismatch"), 0);
  const consBefore = Number((await getAccount(connection, consumerAta)).amount);
  const resolved = await resolveDispute(connection, facilitator, proof.pipelinePda, 1, agentB.publicKey, true, operatorTreasury, addresses);
  const consAfter = Number((await getAccount(connection, consumerAta)).amount);
  console.log("[proof 3/4] Consumer disputes Node 1 → arbiter upholds → refund + slash");
  console.log("  ✓ Dispute Tx:", ex(disp.signature));
  console.log("  ✓ Resolve Tx:", ex(resolved.signature));
  console.log(`  ✓ Consumer refunded + slash: ${((consAfter - consBefore) / USDC).toFixed(2)} USDC`);

  // Finalize Node 0 once its dispute window elapses (permissionless payout).
  const ready = Number(set0!.submittedAtSlot) + DISPUTE_SLOTS + 2;
  process.stdout.write("  …waiting for Node 0 dispute window to elapse ");
  while ((await connection.getSlot("confirmed")) < ready) { process.stdout.write("."); await sleep(2000); }
  console.log("");
  const fin = await finalizeNode(connection, facilitator, proof.pipelinePda, 0, agentA.publicKey, operatorTreasury, addresses);
  const proofFinal = await getPipeline(connection, proof.pipelinePda, addresses);
  console.log("[proof 4/4] Finalize Node 0 (no dispute) → agent paid + completion recorded");
  console.log("  ✓ Finalize Tx:", ex(fin.signature));
  console.log(`  ✓ Proof pipeline: ${Object.keys(proofFinal!.status)[0]} (settled ${proofFinal!.nodesSettled}, expired ${proofFinal!.nodesExpired})\n`);

  // Final state
  const finalP = await getPipeline(connection, pipelinePda, addresses);
  const treasury = Number((await getAccount(connection, operatorTreasury)).amount);
  console.log("FINAL STATE");
  console.log("  Pipeline:", pipelinePda.toBase58(), "—", Object.keys(finalP!.status)[0]);
  console.log(`  Nodes settled: ${finalP!.nodesSettled}, expired: ${finalP!.nodesExpired}`);
  console.log(`  Agent A: settled=${repA?.totalSettled}, ema=${repA?.emaScore}`);
  console.log(`  Agent B: failed=${repB?.totalFailed}, ema=${repB?.emaScore}, slashed`);
  console.log(`  Agent C: settled=${repC?.totalSettled}, ema=${repC?.emaScore}`);
  console.log(`  Operator fees collected: ${(treasury / USDC).toFixed(4)} USDC`);
  console.log("\n✅ E2E complete — all transactions confirmed on devnet.");
}

main().catch((e) => {
  console.error("E2E failed:", e);
  process.exit(1);
});
