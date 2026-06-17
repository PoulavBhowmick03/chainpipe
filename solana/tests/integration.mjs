// Integration tests against the LIVE devnet programs (no anchor-CLI dependency).
// Covers money-handling + access-gated paths: happy-path settle + fee split, refund,
// and the negative guards (non-facilitator reputation write, self-dealing).
// Run from facilitator/ (for node_modules):  node ../solana/tests/integration.mjs
import {
  Connection, Keypair, PublicKey, SystemProgram,
  Transaction, TransactionInstruction, sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, getOrCreateAssociatedTokenAccount, mintTo, getAccount } from "@solana/spl-token";
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
// Retry-with-backoff wrapper so public-devnet 429 rate-limiting doesn't fail the suite.
const retry = async (fn, n = 8) => {
  for (let i = 0; i < n; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === n - 1 || !/429|Too Many|rate limit/i.test(e.message ?? "")) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
};
const send = (ixs, signers) => retry(() => sendAndConfirmTransaction(conn, new Transaction().add(...ixs), signers));
const mkAccount = (payer, mint, owner, kp) => retry(() => createAccount(conn, payer, mint, owner, kp));

let pass = 0, fail = 0;
const ok = (n) => { console.log(`  ✅ ${n}`); pass++; };
const bad = (n, e) => { console.log(`  ❌ ${n} — ${e}`); fail++; };
async function expectOk(n, fn) { try { await fn(); ok(n); } catch (e) { bad(n, e.message?.slice(0, 120)); } }
async function expectFail(n, fn) { try { await fn(); bad(n, "expected revert but succeeded"); } catch { ok(n + " (correctly rejected)"); } }

const fund = (pk, sol) => send([SystemProgram.transfer({ fromPubkey: op.publicKey, toPubkey: pk, lamports: sol * LAMPORTS_PER_SOL })], [op]);

(async () => {
  console.log("integration tests vs devnet — operator:", op.publicKey.toBase58());
  const consumer = Keypair.generate(), provider = Keypair.generate();
  await fund(consumer.publicKey, 0.06); await fund(provider.publicKey, 0.02);
  const mint = await retry(() => createMint(conn, op, op.publicKey, null, 6));
  const cAta = await retry(() => getOrCreateAssociatedTokenAccount(conn, op, mint, consumer.publicKey));
  const pAta = await retry(() => getOrCreateAssociatedTokenAccount(conn, op, mint, provider.publicKey));
  const oAta = await retry(() => getOrCreateAssociatedTokenAccount(conn, op, mint, op.publicKey));
  await retry(() => mintTo(conn, op, mint, cAta.address, op, 20_000_000));

  const sid = Math.floor(Date.now() / 1000);
  const skill = pda([Buffer.from("skill"), u64(sid)], REGISTRY);
  const rcfg = pda([Buffer.from("config")], REGISTRY), ecfg = pda([Buffer.from("config")], ESCROW);

  // register a skill (provider)
  await expectOk("register_skill", () => send([new TransactionInstruction({ programId: REGISTRY, keys: [
    { pubkey: rcfg, isSigner: false, isWritable: true }, { pubkey: skill, isSigner: false, isWritable: true },
    { pubkey: provider.publicKey, isSigner: true, isWritable: true }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }],
    data: Buffer.concat([disc("register_skill"), u64(sid), mint.toBuffer(), u64(500000), sstr("https://s.example/run")]) })], [provider]));

  // GUARD: non-facilitator cannot write reputation (random signer as facilitator)
  const rando = Keypair.generate(); await fund(rando.publicKey, 0.02);
  await expectFail("record_job_completion rejects non-facilitator", () => send([new TransactionInstruction({ programId: REGISTRY, keys: [
    { pubkey: rcfg, isSigner: false, isWritable: false }, { pubkey: skill, isSigner: false, isWritable: true },
    { pubkey: rando.publicKey, isSigner: true, isWritable: false }], data: Buffer.concat([disc("record_job_completion"), u64(50)]) })], [rando]));

  // GUARD: self-dealing rejected (provider == consumer)
  const jidSelf = sid + 1, jobSelf = pda([Buffer.from("job"), consumer.publicKey.toBuffer(), u64(jidSelf)], ESCROW);
  const vSelf = Keypair.generate(); await mkAccount(consumer, mint,jobSelf, vSelf);
  await expectFail("create_job rejects self-dealing", () => send([new TransactionInstruction({ programId: ESCROW, keys: [
    { pubkey: jobSelf, isSigner: false, isWritable: true }, { pubkey: vSelf.publicKey, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: cAta.address, isSigner: false, isWritable: true },
    { pubkey: consumer.publicKey, isSigner: true, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }],
    data: Buffer.concat([disc("create_job"), u64(jidSelf), u64(sid), consumer.publicKey.toBuffer(), u64(1_000_000)]) })], [consumer]));

  // HAPPY: create_job + complete_job, assert fee split + reputation
  const jid = sid + 2, job = pda([Buffer.from("job"), consumer.publicKey.toBuffer(), u64(jid)], ESCROW);
  const vault = Keypair.generate(); await mkAccount(consumer, mint,job, vault);
  const amt = 2_000_000n, fee = amt * 20n / 10_000n;
  const pBefore = (await getAccount(conn, pAta.address)).amount;
  await expectOk("create_job (deposit)", () => send([new TransactionInstruction({ programId: ESCROW, keys: [
    { pubkey: job, isSigner: false, isWritable: true }, { pubkey: vault.publicKey, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: cAta.address, isSigner: false, isWritable: true },
    { pubkey: consumer.publicKey, isSigner: true, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }],
    data: Buffer.concat([disc("create_job"), u64(jid), u64(sid), provider.publicKey.toBuffer(), u64(amt)]) })], [consumer]));

  // GUARD: non-operator cannot complete_job
  await expectFail("complete_job rejects non-operator", () => send([new TransactionInstruction({ programId: ESCROW, keys: [
    { pubkey: ecfg, isSigner: false, isWritable: false }, { pubkey: job, isSigner: false, isWritable: true },
    { pubkey: vault.publicKey, isSigner: false, isWritable: true }, { pubkey: consumer.publicKey, isSigner: false, isWritable: false },
    { pubkey: provider.publicKey, isSigner: false, isWritable: false }, { pubkey: pAta.address, isSigner: false, isWritable: true },
    { pubkey: oAta.address, isSigner: false, isWritable: true }, { pubkey: rando.publicKey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }], data: Buffer.concat([disc("complete_job"), u64(jid)]) })], [rando]));

  // complete_job by operator
  await expectOk("complete_job (operator)", () => send([new TransactionInstruction({ programId: ESCROW, keys: [
    { pubkey: ecfg, isSigner: false, isWritable: false }, { pubkey: job, isSigner: false, isWritable: true },
    { pubkey: vault.publicKey, isSigner: false, isWritable: true }, { pubkey: consumer.publicKey, isSigner: false, isWritable: false },
    { pubkey: provider.publicKey, isSigner: false, isWritable: false }, { pubkey: pAta.address, isSigner: false, isWritable: true },
    { pubkey: oAta.address, isSigner: false, isWritable: true }, { pubkey: op.publicKey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }], data: Buffer.concat([disc("complete_job"), u64(jid)]) })], [op]));

  const pAfter = (await getAccount(conn, pAta.address)).amount;
  (pAfter - pBefore === amt - fee) ? ok(`fee split correct (provider +${amt - fee}, fee ${fee})`) : bad("fee split", `got +${pAfter - pBefore}`);

  // GUARD: double-complete rejected (job no longer Locked)
  await expectFail("complete_job rejects double-settle", () => send([new TransactionInstruction({ programId: ESCROW, keys: [
    { pubkey: ecfg, isSigner: false, isWritable: false }, { pubkey: job, isSigner: false, isWritable: true },
    { pubkey: vault.publicKey, isSigner: false, isWritable: true }, { pubkey: consumer.publicKey, isSigner: false, isWritable: false },
    { pubkey: provider.publicKey, isSigner: false, isWritable: false }, { pubkey: pAta.address, isSigner: false, isWritable: true },
    { pubkey: oAta.address, isSigner: false, isWritable: true }, { pubkey: op.publicKey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }], data: Buffer.concat([disc("complete_job"), u64(jid)]) })], [op]));

  // REFUND: a second job, refunded to consumer
  const jidR = sid + 3, jobR = pda([Buffer.from("job"), consumer.publicKey.toBuffer(), u64(jidR)], ESCROW);
  const vR = Keypair.generate(); await mkAccount(consumer, mint,jobR, vR);
  await send([new TransactionInstruction({ programId: ESCROW, keys: [
    { pubkey: jobR, isSigner: false, isWritable: true }, { pubkey: vR.publicKey, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: cAta.address, isSigner: false, isWritable: true },
    { pubkey: consumer.publicKey, isSigner: true, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }],
    data: Buffer.concat([disc("create_job"), u64(jidR), u64(sid), provider.publicKey.toBuffer(), u64(1_500_000)]) })], [consumer]);
  const cBefore = (await getAccount(conn, cAta.address)).amount;
  await expectOk("refund_job (operator) returns funds", () => send([new TransactionInstruction({ programId: ESCROW, keys: [
    { pubkey: ecfg, isSigner: false, isWritable: false }, { pubkey: jobR, isSigner: false, isWritable: true },
    { pubkey: vR.publicKey, isSigner: false, isWritable: true }, { pubkey: consumer.publicKey, isSigner: false, isWritable: false },
    { pubkey: cAta.address, isSigner: false, isWritable: true }, { pubkey: op.publicKey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }], data: Buffer.concat([disc("refund_job"), u64(jidR)]) })], [op]));
  const cAfter = (await getAccount(conn, cAta.address)).amount;
  (cAfter - cBefore === 1_500_000n) ? ok("refund returned full amount") : bad("refund amount", `got +${cAfter - cBefore}`);

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR:", e.message); process.exit(1); });
