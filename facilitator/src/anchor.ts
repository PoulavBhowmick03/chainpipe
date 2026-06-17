import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import type { PaymentAuthorization } from "./types.js";

/** Anchor instruction discriminator: sha256("global:<name>")[0..8]. */
export function ixDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

/** Little-endian u64 as an 8-byte Buffer. */
export function u64le(value: number | bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(value));
  return b;
}

export function configPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
}

export function jobPda(
  consumer: PublicKey,
  jobId: number | bigint,
  escrowProgram: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("job"), consumer.toBuffer(), u64le(jobId)],
    escrowProgram,
  );
}

export function skillPda(
  skillId: number | bigint,
  registryProgram: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("skill"), u64le(skillId)],
    registryProgram,
  );
}

/**
 * Decoded `Job` account (x402_escrow). Layout after the 8-byte discriminator:
 * job_id u64, skill_id u64, consumer Pubkey, provider Pubkey, payment_mint Pubkey,
 * vault Pubkey, amount u64, state u8, bump u8.
 */
export interface DecodedJob {
  jobId: bigint;
  skillId: bigint;
  consumer: PublicKey;
  provider: PublicKey;
  paymentMint: PublicKey;
  vault: PublicKey;
  amount: bigint;
  state: number;
}

export function decodeJob(data: Buffer): DecodedJob {
  let o = 8;
  const readU64 = () => {
    const v = data.readBigUInt64LE(o);
    o += 8;
    return v;
  };
  const readPubkey = () => {
    const pk = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    return pk;
  };
  const jobId = readU64();
  const skillId = readU64();
  const consumer = readPubkey();
  const provider = readPubkey();
  const paymentMint = readPubkey();
  const vault = readPubkey();
  const amount = readU64();
  const state = data.readUInt8(o);
  return { jobId, skillId, consumer, provider, paymentMint, vault, amount, state };
}

export const PAYMENT_DOMAIN = "LedgerForge-Solana";
export const PAYMENT_VERSION = "1";

/** Must byte-for-byte match the SDK's canonicalPaymentMessage. */
export function canonicalPaymentMessage(auth: PaymentAuthorization): Uint8Array {
  const lines = [
    PAYMENT_DOMAIN,
    PAYMENT_VERSION,
    auth.consumer,
    auth.provider,
    auth.mint,
    auth.amount,
    String(auth.skillId),
    String(auth.jobId),
    String(auth.nonce),
    String(auth.validBefore),
  ];
  return new TextEncoder().encode(lines.join("\n"));
}
