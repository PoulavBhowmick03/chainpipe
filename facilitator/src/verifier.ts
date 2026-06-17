import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { ALLOWED_MINTS } from "./config.js";
import { canonicalPaymentMessage } from "./anchor.js";
import type { SolanaPaymentDetails, SolanaPaymentProof } from "./types.js";

// replay protection for the demo server
const usedNonces = new Map<string, number>();
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const [key, expiry] of usedNonces.entries()) {
    if (expiry < now) usedNonces.delete(key);
  }
}, 5 * 60 * 1000);

export async function verifyPaymentProof(
  details: SolanaPaymentDetails,
  proof: SolanaPaymentProof,
): Promise<{ valid: boolean; error?: string }> {
  const auth = proof.authorization;

  if (!ALLOWED_MINTS.has(auth.mint)) {
    return { valid: false, error: `Mint ${auth.mint} is not an allowed payment token` };
  }
  if (!ALLOWED_MINTS.has(details.asset)) {
    return { valid: false, error: `Payment asset ${details.asset} is not an allowed token` };
  }
  if (BigInt(auth.amount) < BigInt(details.maxAmountRequired)) {
    return { valid: false, error: "Payment amount too small" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > auth.validBefore) {
    return { valid: false, error: "Payment proof expired" };
  }

  if (details.skillId !== auth.skillId) {
    return { valid: false, error: `skillId mismatch: ${details.skillId} vs ${auth.skillId}` };
  }
  if (details.asset !== auth.mint) {
    return { valid: false, error: `Token mismatch: ${details.asset} vs ${auth.mint}` };
  }

  // ed25519 signature over the canonical message, verified against the consumer key.
  let consumerKey: PublicKey;
  try {
    consumerKey = new PublicKey(auth.consumer);
  } catch {
    return { valid: false, error: "Invalid consumer public key" };
  }

  let signatureValid = false;
  try {
    const message = canonicalPaymentMessage(auth);
    const signature = bs58.decode(proof.signature);
    signatureValid = nacl.sign.detached.verify(message, signature, consumerKey.toBytes());
  } catch {
    return { valid: false, error: "Invalid payment signature encoding" };
  }
  if (!signatureValid) {
    return { valid: false, error: "Invalid payment signature" };
  }

  const nonceKey = `${auth.consumer}:${auth.nonce}`;
  if (usedNonces.has(nonceKey)) {
    return { valid: false, error: "Nonce already used — payment proof cannot be replayed" };
  }

  return { valid: true };
}

export { usedNonces };
