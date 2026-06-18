/**
 * ChainPipe Seed Script — populates devnet with realistic demo state:
 *   - 5 bonded agents across tiers (with skill-tag labels, off-chain)
 *   - 3 pipelines: one Active, one Completed, one PartiallyRefunded
 *
 * Uses a fresh 6-decimal test mint (printed at the end). Point the indexer +
 * dashboard at it via CHAINPIPE_USDC_MINT / NEXT_PUBLIC_USDC_MINT to view the
 * seeded state.
 *
 * Usage: npx tsx scripts/seed-devnet.mts
 */
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
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
} from "@chainpipe/solana";

const USDC = 1_000_000;
const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const THROTTLE = Number(process.env.E2E_THROTTLE_MS ?? 2500);
const beat = () => new Promise((r) => setTimeout(r, THROTTLE));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadKeypair(path: string): Keypair {
  const p = path.replace(/^~/, homedir());
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf-8"))));
}

const SKILLS = ["code-gen", "data-fetch", "report-synthesis", "api-proxy", "nlp-summarization"];
const TIER_USDC = [10, 100, 1000, 100, 10];

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const operator = loadKeypair(process.env.ANCHOR_WALLET ?? `${homedir()}/.config/solana/id.json`);
  const facilitator = loadKeypair("./keys/facilitator.json");

  const mint = await createMint(connection, operator, operator.publicKey, null, 6);
  const addresses: ChainPipeAddresses = { ...DEVNET_ADDRESSES, usdcMint: mint };
  const operatorTreasury = (await getOrCreateAssociatedTokenAccount(connection, operator, mint, operator.publicKey)).address;
  await beat();

  console.log("Seeding ChainPipe devnet state");
  console.log("  test mint:", mint.toBase58(), "\n");

  // 5 agents
  const agents: { kp: Keypair; skill: string; tier: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const kp = Keypair.generate();
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: kp.publicKey, lamports: 0.08 * LAMPORTS_PER_SOL })
      ),
      [operator]
    );
    await beat();
    const ata = (await getOrCreateAssociatedTokenAccount(connection, operator, mint, kp.publicKey)).address;
    await beat();
    await mintTo(connection, operator, mint, ata, operator.publicKey, TIER_USDC[i] * USDC);
    await beat();
    const r = await stakeAndRegister(connection, kp, BigInt(TIER_USDC[i] * USDC), mint, addresses);
    agents.push({ kp, skill: SKILLS[i], tier: r.tier });
    console.log(`  agent ${i} [${SKILLS[i]}] tier ${r.tier} — ${kp.publicKey.toBase58()}`);
    await beat();
  }

  // A funded consumer
  const consumer = Keypair.generate();
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: consumer.publicKey, lamports: 0.4 * LAMPORTS_PER_SOL })
    ),
    [operator]
  );
  await beat();
  const consumerAta = (await getOrCreateAssociatedTokenAccount(connection, operator, mint, consumer.publicKey)).address;
  await beat();
  await mintTo(connection, operator, mint, consumerAta, operator.publicKey, 400 * USDC);
  await beat();

  const FAR = 200_000;
  const created: Record<string, string> = {};

  // Pipeline 1 — Completed (2 linear nodes both settled).
  {
    const { pipelinePda } = await createPipeline(
      connection,
      consumer,
      [
        { allocationUsdc: BigInt(20 * USDC), deadlineSlotsFromNow: BigInt(FAR), dependencyMask: 0n, requiredTier: 1 },
        { allocationUsdc: BigInt(15 * USDC), deadlineSlotsFromNow: BigInt(FAR), dependencyMask: 0b001n, requiredTier: 1 },
      ],
      addresses
    );
    await beat();
    await claimNode(connection, agents[0].kp, pipelinePda, 0, addresses); await beat();
    await completeNode(connection, facilitator, pipelinePda, 0, agents[0].kp.publicKey, 900, operatorTreasury, addresses); await beat();
    await claimNode(connection, agents[1].kp, pipelinePda, 1, addresses); await beat();
    await completeNode(connection, facilitator, pipelinePda, 1, agents[1].kp.publicKey, 800, operatorTreasury, addresses); await beat();
    created.completed = pipelinePda.toBase58();
    console.log("  pipeline (Completed):", created.completed);
  }

  // Pipeline 2 — Active (node 0 settled, node 1 still claimed/pending).
  {
    const { pipelinePda } = await createPipeline(
      connection,
      consumer,
      [
        { allocationUsdc: BigInt(30 * USDC), deadlineSlotsFromNow: BigInt(FAR), dependencyMask: 0n, requiredTier: 1 },
        { allocationUsdc: BigInt(20 * USDC), deadlineSlotsFromNow: BigInt(FAR), dependencyMask: 0b001n, requiredTier: 1 },
      ],
      addresses
    );
    await beat();
    await claimNode(connection, agents[2].kp, pipelinePda, 0, addresses); await beat();
    await completeNode(connection, facilitator, pipelinePda, 0, agents[2].kp.publicKey, 850, operatorTreasury, addresses); await beat();
    created.active = pipelinePda.toBase58();
    console.log("  pipeline (Active):", created.active);
  }

  // Pipeline 3 — PartiallyRefunded (node 1 claimed then expired).
  {
    const { pipelinePda } = await createPipeline(
      connection,
      consumer,
      [
        { allocationUsdc: BigInt(20 * USDC), deadlineSlotsFromNow: BigInt(FAR), dependencyMask: 0n, requiredTier: 1 },
        { allocationUsdc: BigInt(20 * USDC), deadlineSlotsFromNow: 60n, dependencyMask: 0n, requiredTier: 1 },
      ],
      addresses
    );
    await beat();
    await claimNode(connection, agents[3].kp, pipelinePda, 1, addresses); await beat();
    const p = await getPipeline(connection, pipelinePda, addresses);
    const deadline = p!.nodes[1].deadlineSlot.toNumber();
    while ((await connection.getSlot("confirmed")) <= deadline + 1) await sleep(2500);
    await expireNode(connection, facilitator, pipelinePda, 1, addresses); await beat();
    created.partial = pipelinePda.toBase58();
    console.log("  pipeline (PartiallyRefunded):", created.partial);
  }

  console.log("\n✅ Seed complete.");
  console.log("Point the indexer/dashboard at this mint:");
  console.log(`  CHAINPIPE_USDC_MINT=${mint.toBase58()}`);
  console.log(`  NEXT_PUBLIC_USDC_MINT=${mint.toBase58()}`);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
