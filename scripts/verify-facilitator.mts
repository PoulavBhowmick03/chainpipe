/**
 * Verify the facilitator HTTP API against a running server on devnet.
 *
 *   POST /complete  → 200 + tx signature  (ed25519-signed by the claiming agent)
 *   POST /complete  → 409                  (replay guard: same job_id)
 *   POST /expire    → 200 + refundAmount   (overdue node)
 *
 * Prereq: facilitator running with CHAINPIPE_USDC_MINT set to the same mint this
 * script uses (default: the seeded mint, whose authority is the operator wallet).
 *
 * Usage:
 *   CHAINPIPE_USDC_MINT=<mint> node facilitator/dist/server.js &   # :3001
 *   CHAINPIPE_USDC_MINT=<mint> npx tsx scripts/verify-facilitator.mts
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
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import nacl from "tweetnacl";
import { readFileSync } from "fs";
import { homedir } from "os";
import { strict as assert } from "assert";
import { DEVNET_ADDRESSES, ChainPipeAddresses, stakeAndRegister, createPipeline, claimNode, getPipeline } from "@chainpipe/solana";

const USDC = 1_000_000;
const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const FAC = process.env.FACILITATOR_URL ?? "http://localhost:3001";
const THROTTLE = Number(process.env.E2E_THROTTLE_MS ?? 2500);
const beat = () => new Promise((r) => setTimeout(r, THROTTLE));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p.replace(/^~/, homedir()), "utf-8"))));
}

function completionMessage(pipeline: PublicKey, nodeIndex: number, jobId: Uint8Array): Uint8Array {
  return Uint8Array.from([...pipeline.toBytes(), nodeIndex & 0xff, ...jobId]);
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const operator = loadKeypair(process.env.ANCHOR_WALLET ?? `${homedir()}/.config/solana/id.json`);

  // Mint: env-provided (operator is its authority) or freshly created.
  let mint: PublicKey;
  if (process.env.CHAINPIPE_USDC_MINT) {
    mint = new PublicKey(process.env.CHAINPIPE_USDC_MINT);
  } else {
    mint = await createMint(connection, operator, operator.publicKey, null, 6);
    console.log("created mint:", mint.toBase58(), "(start facilitator with this mint!)");
  }
  const addresses: ChainPipeAddresses = { ...DEVNET_ADDRESSES, usdcMint: mint };

  // Confirm facilitator is up + agrees on the mint program set.
  const health = await (await fetch(`${FAC}/health`)).json();
  assert.equal(health.status, "ok", "facilitator /health not ok");
  console.log("facilitator /health ok @ slot", health.slot);

  // Fresh agent + consumer.
  const agent = Keypair.generate();
  const consumer = Keypair.generate();
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: agent.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL }),
      SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: consumer.publicKey, lamports: 0.2 * LAMPORTS_PER_SOL })
    ),
    [operator]
  );
  await beat();

  const agentAta = (await getOrCreateAssociatedTokenAccount(connection, operator, mint, agent.publicKey)).address;
  await beat();
  await mintTo(connection, operator, mint, agentAta, operator.publicKey, 10 * USDC);
  await beat();
  const consumerAta = (await getOrCreateAssociatedTokenAccount(connection, operator, mint, consumer.publicKey)).address;
  await beat();
  await mintTo(connection, operator, mint, consumerAta, operator.publicKey, 50 * USDC);
  await beat();

  await stakeAndRegister(connection, agent, BigInt(10 * USDC), mint, addresses);
  await beat();

  // 2-node pipeline: node0 far deadline (to /complete), node1 short (to /expire).
  const { pipelinePda } = await createPipeline(
    connection,
    consumer,
    [
      { allocationUsdc: BigInt(20 * USDC), deadlineSlotsFromNow: 100_000n, dependencyMask: 0n, requiredTier: 1 },
      { allocationUsdc: BigInt(15 * USDC), deadlineSlotsFromNow: 60n, dependencyMask: 0n, requiredTier: 1 },
    ],
    addresses
  );
  await beat();

  // Claim node 0 and node 1 with the agent.
  await claimNode(connection, agent, pipelinePda, 0, addresses);
  await beat();
  const claim1 = await claimNode(connection, agent, pipelinePda, 1, addresses);
  await beat();

  // --- POST /complete (node 0) ---
  const p = await getPipeline(connection, pipelinePda, addresses);
  const job0 = Uint8Array.from(p!.nodes[0].jobId);
  const sig0 = nacl.sign.detached(completionMessage(pipelinePda, 0, job0), agent.secretKey);
  const body = {
    pipelinePda: pipelinePda.toBase58(),
    nodeIndex: 0,
    agentSignature: Buffer.from(sig0).toString("base64"),
  };
  const r1 = await fetch(`${FAC}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j1 = await r1.json();
  assert.equal(r1.status, 200, `/complete expected 200, got ${r1.status}: ${JSON.stringify(j1)}`);
  assert.ok(j1.signature, "/complete returned no tx signature");
  console.log("✓ POST /complete →", r1.status, "tx", j1.signature, "scoreDelta", j1.scoreDelta, "ema", j1.newEmaScore);
  await beat();

  // --- POST /complete again → 409 replay ---
  const r2 = await fetch(`${FAC}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(r2.status, 409, `replay expected 409, got ${r2.status}`);
  console.log("✓ POST /complete (replay) →", r2.status, "(rejected)");
  await beat();

  // --- POST /expire (node 1) after deadline ---
  const node1 = (await getPipeline(connection, pipelinePda, addresses))!.nodes[1];
  const deadline = node1.deadlineSlot.toNumber();
  process.stdout.write("  …waiting for node 1 deadline ");
  while ((await connection.getSlot("confirmed")) <= deadline + 1) {
    process.stdout.write(".");
    await sleep(2500);
  }
  console.log("");
  const r3 = await fetch(`${FAC}/expire`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pipelinePda: pipelinePda.toBase58(), nodeIndex: 1 }) });
  const j3 = await r3.json();
  assert.equal(r3.status, 200, `/expire expected 200, got ${r3.status}: ${JSON.stringify(j3)}`);
  assert.ok(j3.signature && j3.refundAmount, "/expire missing fields");
  console.log("✓ POST /expire →", r3.status, "tx", j3.signature, "refund", j3.refundAmount, "slashed", j3.slashedAgent);
  void claim1;

  console.log("\n✅ Facilitator HTTP API verified: /complete, replay 409, /expire.");
}

main().catch((e) => {
  console.error("verify-facilitator failed:", e);
  process.exit(1);
});
