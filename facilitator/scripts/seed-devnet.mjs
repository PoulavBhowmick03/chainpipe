// Seeds the live devnet programs with realistic data for the demo/dashboard:
// registers several skills (2 providers) and runs real escrow-settled jobs so each
// skill accrues on-chain reputation. Run from facilitator/:  node scripts/seed-devnet.mjs
import {
  Connection, Keypair, PublicKey, SystemProgram,
  Transaction, TransactionInstruction, sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, ACCOUNT_SIZE, MINT_SIZE,
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction, createMintToInstruction, createInitializeAccount3Instruction,
} from "@solana/spl-token";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import os from "node:os";

const conn = new Connection(process.env.SOLANA_RPC ?? "https://api.devnet.solana.com", "confirmed");
const REGISTRY = new PublicKey("26Xf7wEPJbG6EJ5kfAXbkot75ekSWdvpJH2rws1DEaEF");
const ESCROW = new PublicKey("Ec48mwadrna8FC5rJ24K5R5fMVCBFBzhbbeFkf6skiYq");
const op = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.WALLET ?? `${os.homedir()}/.config/solana/id.json`, "utf8"))));

const disc = (n) => createHash("sha256").update(`global:${n}`).digest().subarray(0, 8);
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const sstr = (s) => { const b = Buffer.from(s, "utf8"); const l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
const pda = (seeds, pid) => PublicKey.findProgramAddressSync(seeds, pid)[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Swallow transient ws/429 noise that escapes promise-level retry (best-effort seed).
for (const ev of ["uncaughtException", "unhandledRejection"]) process.on(ev, (e) => {
  const m = String(e?.message ?? e);
  if (/429|Too Many|ws error|Unexpected server response/i.test(m)) return;
  console.error("FATAL:", m); process.exit(1);
});
const retry = async (fn, n = 10) => { for (let i = 0; i < n; i++) { try { return await fn(); } catch (e) { if (i === n - 1 || !/429|Too Many|rate|timeout|block height/i.test(e.message ?? "")) throw e; await sleep(1500 * (i + 1)); } } };
// Poll-based confirmation (no websocket subscription → no ws-error crashes).
const send = (ixs, signers) => retry(async () => {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: signers[0].publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
  tx.sign(...signers);
  const sig = await conn.sendRawTransaction(tx.serialize());
  for (let i = 0; i < 40; i++) {
    const st = (await conn.getSignatureStatus(sig)).value;
    if (st?.err) throw new Error("tx err " + JSON.stringify(st.err));
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return sig;
    await sleep(700);
  }
  throw new Error("confirm timeout");
});
const cfg = (pid) => pda([Buffer.from("config")], pid);

const SKILLS = [
  { endpoint: "https://skills.ledgerforge.dev/kamino-yield-scout", price: 250000, jobs: 6 },
  { endpoint: "https://skills.ledgerforge.dev/drift-perps-signals", price: 500000, jobs: 4 },
  { endpoint: "https://skills.ledgerforge.dev/pyth-price-feed", price: 100000, jobs: 3 },
  { endpoint: "https://skills.ledgerforge.dev/orca-pool-analysis", price: 750000, jobs: 1 },
  { endpoint: "https://skills.ledgerforge.dev/jito-mev-monitor", price: 300000, jobs: 0 },
];

(async () => {
  console.log("seeding devnet — operator/facilitator:", op.publicKey.toBase58());
  const consumer = Keypair.generate();
  const providers = [Keypair.generate(), Keypair.generate()];
  await send([SystemProgram.transfer({ fromPubkey: op.publicKey, toPubkey: consumer.publicKey, lamports: 0.4 * LAMPORTS_PER_SOL })], [op]);
  for (const p of providers) await send([SystemProgram.transfer({ fromPubkey: op.publicKey, toPubkey: p.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })], [op]);

  // create mint (manual, ws-free)
  const mintKp = Keypair.generate();
  const mintRent = await conn.getMinimumBalanceForRentExemption(MINT_SIZE);
  await send([
    SystemProgram.createAccount({ fromPubkey: op.publicKey, newAccountPubkey: mintKp.publicKey, lamports: mintRent, space: MINT_SIZE, programId: TOKEN_PROGRAM_ID }),
    createInitializeMint2Instruction(mintKp.publicKey, 6, op.publicKey, null),
  ], [op, mintKp]);
  const mint = mintKp.publicKey;
  const ata = (owner) => getAssociatedTokenAddressSync(mint, owner, true);
  const cAtaAddr = ata(consumer.publicKey), oAtaAddr = ata(op.publicKey);
  const provAddrs = providers.map((p) => ata(p.publicKey));
  await send([
    createAssociatedTokenAccountIdempotentInstruction(op.publicKey, cAtaAddr, consumer.publicKey, mint),
    createAssociatedTokenAccountIdempotentInstruction(op.publicKey, oAtaAddr, op.publicKey, mint),
    ...provAddrs.map((a, i) => createAssociatedTokenAccountIdempotentInstruction(op.publicKey, a, providers[i].publicKey, mint)),
    createMintToInstruction(mint, cAtaAddr, op.publicKey, 100_000_000),
  ], [op]);

  const base = Math.floor(Date.now() / 1000);
  let jobCounter = 0;
  for (let i = 0; i < SKILLS.length; i++) {
    const s = SKILLS[i], provider = providers[i % providers.length], pAtaAddr = provAddrs[i % providers.length];
    const skillId = base + i, skill = pda([Buffer.from("skill"), u64(skillId)], REGISTRY);
    await send([new TransactionInstruction({ programId: REGISTRY, keys: [
      { pubkey: cfg(REGISTRY), isSigner: false, isWritable: true }, { pubkey: skill, isSigner: false, isWritable: true },
      { pubkey: provider.publicKey, isSigner: true, isWritable: true }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }],
      data: Buffer.concat([disc("register_skill"), u64(skillId), mint.toBuffer(), u64(s.price), sstr(s.endpoint)]) })], [provider]);
    console.log(`\n[skill ${skillId}] ${s.endpoint}  price=${s.price}  → running ${s.jobs} job(s)`);

    for (let j = 0; j < s.jobs; j++) {
      const jobId = base + 1000 + (jobCounter++);
      const job = pda([Buffer.from("job"), consumer.publicKey.toBuffer(), u64(jobId)], ESCROW);
      const vault = Keypair.generate();
      const vRent = await conn.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);
      await send([
        SystemProgram.createAccount({ fromPubkey: consumer.publicKey, newAccountPubkey: vault.publicKey, lamports: vRent, space: ACCOUNT_SIZE, programId: TOKEN_PROGRAM_ID }),
        createInitializeAccount3Instruction(vault.publicKey, mint, job),
      ], [consumer, vault]);
      await send([new TransactionInstruction({ programId: ESCROW, keys: [
        { pubkey: job, isSigner: false, isWritable: true }, { pubkey: vault.publicKey, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: cAtaAddr, isSigner: false, isWritable: true },
        { pubkey: consumer.publicKey, isSigner: true, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }],
        data: Buffer.concat([disc("create_job"), u64(jobId), u64(skillId), provider.publicKey.toBuffer(), u64(s.price)]) })], [consumer]);
      await send([new TransactionInstruction({ programId: ESCROW, keys: [
        { pubkey: cfg(ESCROW), isSigner: false, isWritable: false }, { pubkey: job, isSigner: false, isWritable: true },
        { pubkey: vault.publicKey, isSigner: false, isWritable: true }, { pubkey: consumer.publicKey, isSigner: false, isWritable: false },
        { pubkey: provider.publicKey, isSigner: false, isWritable: false }, { pubkey: pAtaAddr, isSigner: false, isWritable: true },
        { pubkey: oAtaAddr, isSigner: false, isWritable: true }, { pubkey: op.publicKey, isSigner: true, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }],
        data: Buffer.concat([disc("complete_job"), u64(jobId)]) })], [op]);
      const score = 70 + ((j * 7 + i * 3) % 26); // 70..95
      await send([new TransactionInstruction({ programId: REGISTRY, keys: [
        { pubkey: cfg(REGISTRY), isSigner: false, isWritable: false }, { pubkey: skill, isSigner: false, isWritable: true },
        { pubkey: op.publicKey, isSigner: true, isWritable: false }],
        data: Buffer.concat([disc("record_job_completion"), u64(score)]) })], [op]);
      process.stdout.write(`  job ${j + 1}/${s.jobs} settled (score +${score})\n`);
    }
  }
  console.log("\n✅ seed complete. Run the indexer to see populated skills:  cd ../solana && node scripts/indexer.mjs");
})().catch((e) => { console.error("SEED FAILED:", e.message); process.exit(1); });
