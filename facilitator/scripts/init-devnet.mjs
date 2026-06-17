// Initializes the three LedgerForge programs on the configured cluster.
// Run from the facilitator dir (uses its @solana/web3.js): `node scripts/init-devnet.mjs`
// Authority/operator = the local Solana keypair (~/.config/solana/id.json) unless WALLET is set.
import {
  Connection, Keypair, PublicKey, SystemProgram,
  Transaction, TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import os from "node:os";

const RPC = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
const conn = new Connection(RPC, "confirmed");
const walletPath = process.env.WALLET ?? `${os.homedir()}/.config/solana/id.json`;
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8"))));

const PROGRAMS = {
  skill_registry: new PublicKey("26Xf7wEPJbG6EJ5kfAXbkot75ekSWdvpJH2rws1DEaEF"),
  x402_escrow: new PublicKey("Ec48mwadrna8FC5rJ24K5R5fMVCBFBzhbbeFkf6skiYq"),
  bazaar_listings: new PublicKey("HnnH4asvgvAqyBnZKD6SVPMHEwTPTEBq2ZYU995j4Jt3"),
};
const USDC = new PublicKey(
  (process.env.ALLOWED_MINTS ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU").split(",")[0],
);

const disc = (n) => createHash("sha256").update(`global:${n}`).digest().subarray(0, 8);
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const cfgPda = (pid) => PublicKey.findProgramAddressSync([Buffer.from("config")], pid)[0];

async function initialize(pid, data) {
  const ix = new TransactionInstruction({
    programId: pid,
    keys: [
      { pubkey: cfgPda(pid), isSigner: false, isWritable: true },
      { pubkey: kp.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  return sendAndConfirmTransaction(conn, new Transaction().add(ix), [kp]);
}

const op = kp.publicKey;
console.log("authority/operator:", op.toBase58(), "RPC:", RPC);

// skill_registry.initialize(facilitator)
console.log("skill_registry:", await initialize(
  PROGRAMS.skill_registry, Buffer.concat([disc("initialize"), op.toBuffer()])));
// x402_escrow.initialize(operator, fee_bps=20)
console.log("x402_escrow:", await initialize(
  PROGRAMS.x402_escrow, Buffer.concat([disc("initialize"), op.toBuffer(), u16(20)])));
// bazaar_listings.initialize(fee_mint, fee_amount=0, treasury=operator)
console.log("bazaar_listings:", await initialize(
  PROGRAMS.bazaar_listings, Buffer.concat([disc("initialize"), USDC.toBuffer(), u64(0), op.toBuffer()])));

console.log("done — all three config PDAs initialized.");
