import express from "express";
import cors from "cors";
import helmet from "helmet";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { verifyPaymentProof } from "./verifier.js";
import { settlePayment, scoreJob } from "./settler.js";
import {
  PORT,
  CLUSTER,
  connection,
  getOperatorKeypair,
  PROGRAM_IDS,
} from "./config.js";
import { configPda, ixDiscriminator, skillPda, u64le } from "./anchor.js";
import type { SolanaPaymentDetails, SolanaPaymentProof, FacilitateResponse } from "./types.js";

function encodeString(s: string): Buffer {
  const bytes = Buffer.from(s, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", network: "solana", cluster: CLUSTER, version: "1.0.0" });
});

app.get("/payment-details", (req, res) => {
  const { resource, skillId, amount, asset } = req.query;
  const defaultMint = [...(process.env.ALLOWED_MINTS ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU").split(",")][0];
  res.json({
    scheme: "solana-ed25519",
    cluster: CLUSTER,
    maxAmountRequired: (amount as string) ?? "1000000",
    resource: (resource as string) ?? "",
    description: "LedgerForge x402 payment on Solana",
    payTo: process.env.PROVIDER_ADDRESS ?? "",
    maxTimeoutSeconds: 60,
    asset: (asset as string) ?? defaultMint,
    skillId: parseInt((skillId as string) ?? "0"),
  } satisfies SolanaPaymentDetails);
});

app.post("/facilitate", async (req, res) => {
  const proof = req.body as SolanaPaymentProof;
  if (!proof?.authorization || !proof?.signature) {
    res.status(400).json({ success: false, error: "Missing payment proof" } satisfies FacilitateResponse);
    return;
  }

  const details: SolanaPaymentDetails = {
    scheme: "solana-ed25519",
    cluster: proof.cluster,
    maxAmountRequired: proof.authorization.amount,
    resource: "",
    description: "",
    payTo: proof.authorization.provider,
    maxTimeoutSeconds: 60,
    asset: proof.authorization.mint,
    skillId: proof.authorization.skillId,
  };

  try {
    const { valid, error } = await verifyPaymentProof(details, proof);
    if (!valid) {
      res.status(402).json({ success: false, error } satisfies FacilitateResponse);
      return;
    }

    const result = await settlePayment(details, proof);
    console.log(`settled job=${result.jobId} skill=${details.skillId} sig=${result.settlementSignature}`);
    res.json({
      success: true,
      settlementSignature: result.settlementSignature,
      accessToken: `settled:${result.settlementSignature}:${Date.now()}`,
      jobId: result.jobId,
      completeJobSignature: result.completeJobSignature,
      reputationSignature: result.reputationSignature,
      reputationScore: result.reputationScore,
    } satisfies FacilitateResponse);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("settlement error:", message);
    res.status(500).json({ success: false, error: message } satisfies FacilitateResponse);
  }
});

app.post("/score", async (req, res) => {
  const { skillId, score } = req.body as { skillId?: unknown; score?: unknown };
  const id = Number(skillId);
  const s = Number(score);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(s)) {
    res.status(400).json({ error: "skillId (positive int) and score (0-100) required" });
    return;
  }
  try {
    const result = await scoreJob(id, s);
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Operator-registered skill (demo): registers a skill PDA with the operator as provider.
app.post("/register", async (req, res) => {
  const { skillId, endpoint, price, mint } = req.body as {
    skillId?: number; endpoint?: string; price?: string; mint?: string;
  };
  if (!skillId || !endpoint) {
    res.status(400).json({ error: "skillId and endpoint are required" });
    return;
  }
  try {
    const operator = getOperatorKeypair();
    const registry = PROGRAM_IDS.skillRegistry;
    const [cfgAddr] = configPda(registry);
    const [skillAddr] = skillPda(skillId, registry);
    const paymentMint = new PublicKey(mint ?? process.env.PROVIDER_ADDRESS ?? operator.publicKey.toBase58());
    const priceUnits = BigInt(Math.round(parseFloat(price ?? "0") * 1_000_000));

    const data = Buffer.concat([
      ixDiscriminator("register_skill"),
      u64le(skillId),
      paymentMint.toBuffer(),
      u64le(priceUnits),
      encodeString(endpoint),
    ]);
    const ix = new TransactionInstruction({
      programId: registry,
      keys: [
        { pubkey: cfgAddr, isSigner: false, isWritable: true },
        { pubkey: skillAddr, isSigner: false, isWritable: true },
        { pubkey: operator.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [operator]);
    console.log(`registered skill=${skillId} sig=${sig}`);
    res.json({ skillId, signature: sig });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`facilitator listening on ${PORT}`);
  console.log(`network: Solana ${CLUSTER}`);
  console.log(`health: http://localhost:${PORT}/health`);
});

export default app;
