/**
 * Test the self-serve onboarding flow exactly as the platform does it:
 *   1. A brand-new (uninitialized) wallet
 *   2. POST /faucet on the live facilitator → mints test USDC + creates its ATA
 *   3. stake_and_register signed by that wallet → creates its AgentStake (Tier 1)
 *
 * Proves any uninitialized wallet can initialize by interacting with the platform.
 *
 * Usage: npx tsx scripts/test-onboarding.mts [walletToAlsoFaucet]
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
import { readFileSync } from "fs";
import { homedir } from "os";
import { strict as assert } from "assert";
import { DEVNET_ADDRESSES, ChainPipeAddresses, stakeAndRegister, getAgentStake } from "@chainpipe/solana";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const FAC = process.env.FACILITATOR_URL ?? "https://chainpipe-facilitator.fly.dev";
const MINT = process.env.CHAINPIPE_USDC_MINT ?? "8BPRrfsXT3FZUvxW5v5ctq8Q5moZinNu7eFR4gtFPxz1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p.replace(/^~/, homedir()), "utf-8"))));
}

async function faucet(owner: string, amount = 100) {
  const res = await fetch(`${FAC}/faucet`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ owner, amount }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`faucet ${res.status}: ${JSON.stringify(j)}`);
  return j;
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const operator = loadKeypair(process.env.ANCHOR_WALLET ?? `${homedir()}/.config/solana/id.json`);
  const addresses: ChainPipeAddresses = { ...DEVNET_ADDRESSES, usdcMint: new PublicKey(MINT) };

  // 1. Fresh, uninitialized wallet (a real devnet keypair).
  const fresh = Keypair.generate();
  console.log("Fresh wallet:", fresh.publicKey.toBase58());
  assert.equal(await getAgentStake(connection, fresh.publicKey, addresses), null, "should start uninitialized");

  // SOL for the stake tx (PDA + vault ATA rent + fee) — in-browser the user's wallet has this.
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: fresh.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })
    ),
    [operator]
  );
  await sleep(1500);

  // 2. Platform faucet → test USDC + ATA.
  const f = await faucet(fresh.publicKey.toBase58(), 100);
  console.log("✓ /faucet →", f.amount / 1_000_000, "USDC, ata", f.ata);
  console.log("  tx:", `https://explorer.solana.com/tx/${f.signature}?cluster=devnet`);
  await sleep(2000);

  // 3. Self-register as a Tier-1 agent (signed by the fresh wallet).
  const r = await stakeAndRegister(connection, fresh, 10_000_000n, addresses.usdcMint, addresses);
  console.log("✓ stake_and_register → tier", r.tier);
  console.log("  tx:", `https://explorer.solana.com/tx/${r.signature}?cluster=devnet`);

  const stake = await getAgentStake(connection, fresh.publicKey, addresses);
  assert.ok(stake, "AgentStake should now exist");
  assert.equal(stake!.tier, 1, "should be Tier 1");
  console.log(`\n✅ Uninitialized wallet initialized via the platform: Tier ${stake!.tier}, staked ${Number(stake!.stakeAmount) / 1_000_000} USDC.`);

  // Also faucet the user's wallet if provided, so they can finish in-browser.
  const userWallet = process.argv[2];
  if (userWallet) {
    await sleep(2000);
    const uf = await faucet(userWallet, 100);
    console.log(`\n✓ Fauceted user wallet ${userWallet}: ${uf.amount / 1_000_000} test USDC (ata ${uf.ata}).`);
    console.log("  Connect it at https://chainpipe.vercel.app/my/stake and click 'Stake & register'.");
  }
}

main().catch((e) => {
  console.error("onboarding test failed:", e);
  process.exit(1);
});
