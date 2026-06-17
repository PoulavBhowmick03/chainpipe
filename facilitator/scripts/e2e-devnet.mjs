// End-to-end LedgerForge flow against the LIVE devnet programs.
// Proves: register_skill → create_job (SPL deposit into job-PDA vault) →
// complete_job (payout + fee split) → record_job_completion (reputation) → read reputation.
// Uses a fresh test SPL mint (we control mint authority). Run from facilitator/:
//   node scripts/e2e-devnet.mjs
import {
  Connection, Keypair, PublicKey, SystemProgram,
  Transaction, TransactionInstruction, sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, createMint, createAccount, getOrCreateAssociatedTokenAccount,
  mintTo, getAccount,
} from "@solana/spl-token";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import os from "node:os";

const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
const conn = new Connection(RPC, "confirmed");
const ex = (s) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const load = (p) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));

const REGISTRY = new PublicKey("26Xf7wEPJbG6EJ5kfAXbkot75ekSWdvpJH2rws1DEaEF");
const ESCROW = new PublicKey("Ec48mwadrna8FC5rJ24K5R5fMVCBFBzhbbeFkf6skiYq");

const disc = (n) => createHash("sha256").update(`global:${n}`).digest().subarray(0, 8);
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const str = (s) => { const b = Buffer.from(s, "utf8"); const l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
const pda = (seeds, pid) => PublicKey.findProgramAddressSync(seeds, pid)[0];
const sig = (label, s) => console.log(`  ${label}: ${s}\n     ${ex(s)}`);

const operator = load(process.env.WALLET ?? `${os.homedir()}/.config/solana/id.json`); // = facilitator + authority
const id = Math.floor(Date.now() / 1000);
const skillId = id, jobId = id, amount = 1_000_000n, fee = amount * 20n / 10_000n;

async function fund(pubkey, sol) {
  const s = await sendAndConfirmTransaction(conn, new Transaction().add(
    SystemProgram.transfer({ fromPubkey: operator.publicKey, toPubkey: pubkey, lamports: sol * LAMPORTS_PER_SOL })), [operator]);
  return s;
}

(async () => {
  console.log("operator/facilitator:", operator.publicKey.toBase58(), "RPC:", RPC);
  const consumer = Keypair.generate(), provider = Keypair.generate();
  console.log("consumer:", consumer.publicKey.toBase58(), "provider:", provider.publicKey.toBase58());
  await fund(consumer.publicKey, 0.05);
  await fund(provider.publicKey, 0.05);

  // 1. Test SPL mint (6 dp), operator = mint authority
  console.log("\n[1] create test mint + token accounts");
  const mint = await createMint(conn, operator, operator.publicKey, null, 6);
  console.log("  mint:", mint.toBase58());
  const consumerAta = await getOrCreateAssociatedTokenAccount(conn, operator, mint, consumer.publicKey);
  const providerAta = await getOrCreateAssociatedTokenAccount(conn, operator, mint, provider.publicKey);
  const operatorAta = await getOrCreateAssociatedTokenAccount(conn, operator, mint, operator.publicKey);
  await mintTo(conn, operator, mint, consumerAta.address, operator, 10_000_000); // 10 tokens

  // 2. register_skill (provider signs)
  console.log("\n[2] register_skill");
  const skill = pda([Buffer.from("skill"), u64(skillId)], REGISTRY);
  const regData = Buffer.concat([disc("register_skill"), u64(skillId), mint.toBuffer(), u64(500000), str("https://skill.example/run")]);
  sig("register_skill", await sendAndConfirmTransaction(conn, new Transaction().add(new TransactionInstruction({
    programId: REGISTRY,
    keys: [
      { pubkey: pda([Buffer.from("config")], REGISTRY), isSigner: false, isWritable: true },
      { pubkey: skill, isSigner: false, isWritable: true },
      { pubkey: provider.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ], data: regData })), [provider]));

  // 3. create_job (consumer deposits into a job-PDA-owned vault)
  console.log("\n[3] create_job (consumer deposits", amount.toString(), "base units)");
  const job = pda([Buffer.from("job"), consumer.publicKey.toBuffer(), u64(jobId)], ESCROW);
  const vaultKp = Keypair.generate();
  await createAccount(conn, consumer, mint, job, vaultKp); // token acct owned by job PDA
  console.log("  vault:", vaultKp.publicKey.toBase58());
  const cjData = Buffer.concat([disc("create_job"), u64(jobId), u64(skillId), provider.publicKey.toBuffer(), u64(amount)]);
  sig("create_job", await sendAndConfirmTransaction(conn, new Transaction().add(new TransactionInstruction({
    programId: ESCROW,
    keys: [
      { pubkey: job, isSigner: false, isWritable: true },
      { pubkey: vaultKp.publicKey, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: consumerAta.address, isSigner: false, isWritable: true },
      { pubkey: consumer.publicKey, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ], data: cjData })), [consumer]));

  // 4. complete_job (operator releases: payout → provider, fee → operator)
  console.log("\n[4] complete_job (operator settles)");
  const cmpData = Buffer.concat([disc("complete_job"), u64(jobId)]);
  sig("complete_job", await sendAndConfirmTransaction(conn, new Transaction().add(new TransactionInstruction({
    programId: ESCROW,
    keys: [
      { pubkey: pda([Buffer.from("config")], ESCROW), isSigner: false, isWritable: false },
      { pubkey: job, isSigner: false, isWritable: true },
      { pubkey: vaultKp.publicKey, isSigner: false, isWritable: true },
      { pubkey: consumer.publicKey, isSigner: false, isWritable: false },
      { pubkey: provider.publicKey, isSigner: false, isWritable: false },
      { pubkey: providerAta.address, isSigner: false, isWritable: true },
      { pubkey: operatorAta.address, isSigner: false, isWritable: true },
      { pubkey: operator.publicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ], data: cmpData })), [operator]));

  // 5. record_job_completion (facilitator-gated reputation)
  console.log("\n[5] record_job_completion (reputation +85)");
  const recData = Buffer.concat([disc("record_job_completion"), u64(85)]);
  sig("record_job_completion", await sendAndConfirmTransaction(conn, new Transaction().add(new TransactionInstruction({
    programId: REGISTRY,
    keys: [
      { pubkey: pda([Buffer.from("config")], REGISTRY), isSigner: false, isWritable: false },
      { pubkey: skill, isSigner: false, isWritable: true },
      { pubkey: operator.publicKey, isSigner: true, isWritable: false },
    ], data: recData })), [operator]));

  // 6. verify balances + reputation
  console.log("\n[6] results");
  const pv = await getAccount(conn, providerAta.address), ov = await getAccount(conn, operatorAta.address);
  console.log(`  provider received: ${pv.amount} (expected ${amount - fee}); operator fee: ${ov.amount} (expected ${fee})`);
  const sd = (await conn.getAccountInfo(skill)).data;
  const totalJobs = sd.readBigUInt64LE(88), score = sd.readBigUInt64LE(96);
  console.log(`  skill #${skillId} reputation → total_jobs=${totalJobs} score=${score}`);
  console.log("\n✅ full loop executed on devnet. skill PDA:", skill.toBase58(), "job PDA:", job.toBase58());
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
