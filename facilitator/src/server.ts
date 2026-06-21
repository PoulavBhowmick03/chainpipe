import express, { Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import {
  getPipeline,
  getAgentStake,
  getAgentReputation,
  getSettlement,
  decodeUri,
  DISPUTE_SLOTS,
} from "@chainpipe/solana";

import { loadConfig } from "./config";
import { verifyCompletion, verifyExpirable } from "./verifier";
import { settleNode, expireOverdue, submitNode, finalizeOverdue, resolveNode } from "./settler";
import { scoreDelta } from "./scorer";
import { ReplayGuard } from "./replay";
import { serialize } from "./serialize";

const cfg = loadConfig();
const replay = new ReplayGuard(cfg.connection, cfg.addresses);

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? true }));

const limiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true });
app.use(["/complete", "/expire", "/submit", "/finalize", "/resolve"], limiter);

const faucetLimiter = rateLimit({ windowMs: 60_000, limit: 6, standardHeaders: true });
app.use(["/faucet"], faucetLimiter);

const FAUCET_CAP = 1000 * 1_000_000; // 1000 test USDC per request

function decodeSignature(s: string): Uint8Array {
  // Accept base64 (default) — falls back to comma-separated byte array.
  if (s.includes(",")) return Uint8Array.from(s.split(",").map((n) => Number(n)));
  return Uint8Array.from(Buffer.from(s, "base64"));
}

app.get("/health", async (_req: Request, res: Response) => {
  try {
    const slot = await cfg.connection.getSlot("confirmed");
    res.json({
      status: "ok",
      slot,
      facilitator: cfg.facilitator.publicKey.toBase58(),
      usdcMint: cfg.addresses.usdcMint.toBase58(),
      programs: {
        bonded_registry: cfg.addresses.bondedRegistry.toBase58(),
        dag_escrow: cfg.addresses.dagEscrow.toBase58(),
        reputation_bridge: cfg.addresses.reputationBridge.toBase58(),
      },
    });
  } catch (e) {
    res.status(500).json({ status: "error", error: String(e) });
  }
});

// Devnet faucet: mint test stake-USDC to any wallet so it can self-register as
// an agent. The facilitator holds this mint's authority (devnet only).
app.post("/faucet", async (req: Request, res: Response) => {
  try {
    if ((process.env.FAUCET_ENABLED ?? "true") !== "true") {
      return res.status(403).json({ error: "faucet disabled" });
    }
    const { owner, amount } = req.body ?? {};
    if (!owner) return res.status(400).json({ error: "owner required" });
    const ownerPk = new PublicKey(owner);
    const requested = Number(amount ?? 100);
    if (!Number.isFinite(requested) || requested <= 0) {
      return res.status(400).json({ error: "invalid amount" });
    }
    const amt = Math.min(Math.round(requested * 1_000_000), FAUCET_CAP);

    const ata = await getOrCreateAssociatedTokenAccount(
      cfg.connection,
      cfg.facilitator,
      cfg.addresses.usdcMint,
      ownerPk
    );
    const signature = await mintTo(
      cfg.connection,
      cfg.facilitator,
      cfg.addresses.usdcMint,
      ata.address,
      cfg.facilitator,
      amt
    );
    res.json({
      signature,
      ata: ata.address.toBase58(),
      mint: cfg.addresses.usdcMint.toBase58(),
      amount: amt,
      explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/complete", async (req: Request, res: Response) => {
  try {
    const { pipelinePda, nodeIndex, agentSignature, resultHash } = req.body ?? {};
    if (!pipelinePda || nodeIndex === undefined || !agentSignature) {
      return res.status(400).json({ error: "pipelinePda, nodeIndex, agentSignature required" });
    }
    const pipeline = new PublicKey(pipelinePda);
    const idx = Number(nodeIndex);
    // Optional proof-of-delivery commitment (base64/hex/byte-array); zeros if absent.
    const resultHashBytes = new Uint8Array(32);
    if (resultHash) resultHashBytes.set(decodeSignature(resultHash).slice(0, 32));

    // Replay guard first: if the node's job_id is already recorded on-chain (or
    // seen in-memory), reject as a replay before any other validation.
    const pre = await getPipeline(cfg.connection, pipeline, cfg.addresses);
    const preNode = pre?.nodes[idx];
    if (preNode) {
      const jid = Uint8Array.from(preNode.jobId);
      if (await replay.isReplay(jid)) {
        return res.status(409).json({ error: "job already recorded (replay)" });
      }
    }

    const uriComplete = typeof (req.body?.uri) === "string" ? req.body.uri : "";
    const v = await verifyCompletion(
      cfg.connection,
      pipeline,
      idx,
      decodeSignature(agentSignature),
      resultHashBytes,
      cfg.addresses,
      uriComplete
    );
    if (!v.ok || !v.node || !v.agent || !v.jobId) {
      return res.status(400).json({ error: v.reason ?? "verification failed" });
    }

    if (await replay.isReplay(v.jobId)) {
      return res.status(409).json({ error: "job already recorded (replay)" });
    }

    const slot = await cfg.connection.getSlot("confirmed");
    const delta = scoreDelta(slot, v.node.deadlineSlot.toNumber());

    const { signature } = await settleNode(
      cfg.connection,
      cfg.facilitator,
      pipeline,
      idx,
      v.agent,
      delta,
      cfg.operatorTreasury,
      cfg.addresses,
      resultHashBytes
    );
    replay.markRecorded(v.jobId);

    const rep = await getAgentReputation(cfg.connection, v.agent, cfg.addresses);
    res.json({
      signature,
      scoreDelta: delta,
      newEmaScore: rep ? rep.emaScore : null,
      explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/expire", async (req: Request, res: Response) => {
  try {
    const { pipelinePda, nodeIndex } = req.body ?? {};
    if (!pipelinePda || nodeIndex === undefined) {
      return res.status(400).json({ error: "pipelinePda, nodeIndex required" });
    }
    const pipeline = new PublicKey(pipelinePda);
    const idx = Number(nodeIndex);

    const v = await verifyExpirable(cfg.connection, pipeline, idx, cfg.addresses);
    if (!v.ok || !v.node) {
      return res.status(400).json({ error: v.reason ?? "not expirable" });
    }
    const slashedAgent = "claimed" in v.node.status ? v.node.agent.toBase58() : null;

    const { signature, refundAmount } = await expireOverdue(
      cfg.connection,
      cfg.facilitator,
      pipeline,
      idx,
      cfg.addresses
    );
    res.json({
      signature,
      refundAmount: refundAmount.toString(),
      slashedAgent,
      explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Optimistic settlement step 1: submit a completion attestation + delivery proof,
// opening the dispute window. No payout until /finalize (or /resolve). The agent's
// ed25519 signature covers (pipeline ‖ nodeIndex ‖ jobId ‖ resultHash) — Phase 14
// extends the signed message to also bind the uri.
app.post("/submit", async (req: Request, res: Response) => {
  try {
    const { pipelinePda, nodeIndex, agentSignature, resultHash, uri } = req.body ?? {};
    if (!pipelinePda || nodeIndex === undefined || !agentSignature) {
      return res.status(400).json({ error: "pipelinePda, nodeIndex, agentSignature required" });
    }
    const pipeline = new PublicKey(pipelinePda);
    const idx = Number(nodeIndex);
    const resultHashBytes = new Uint8Array(32);
    if (resultHash) resultHashBytes.set(decodeSignature(resultHash).slice(0, 32));
    const uriStr = typeof uri === "string" ? uri : "";

    const v = await verifyCompletion(
      cfg.connection,
      pipeline,
      idx,
      decodeSignature(agentSignature),
      resultHashBytes,
      cfg.addresses,
      uriStr
    );
    if (!v.ok || !v.node || !v.agent || !v.jobId) {
      return res.status(400).json({ error: v.reason ?? "verification failed" });
    }
    if (await replay.isReplay(v.jobId)) {
      return res.status(409).json({ error: "job already recorded (replay)" });
    }

    const slot = await cfg.connection.getSlot("confirmed");
    const delta = scoreDelta(slot, v.node.deadlineSlot.toNumber());
    const { signature, settlementPda } = await submitNode(
      cfg.connection,
      cfg.facilitator,
      pipeline,
      idx,
      v.agent,
      delta,
      cfg.addresses,
      resultHashBytes,
      uriStr
    );
    res.json({
      signature,
      settlementPda: settlementPda.toBase58(),
      disputeUntil: slot + DISPUTE_SLOTS,
      scoreDelta: delta,
      explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Optimistic settlement step 2 (permissionless): finalize a submitted node after its
// dispute window elapses with no dispute — pays the agent + records completion.
app.post("/finalize", async (req: Request, res: Response) => {
  try {
    const { pipelinePda, nodeIndex } = req.body ?? {};
    if (!pipelinePda || nodeIndex === undefined) {
      return res.status(400).json({ error: "pipelinePda, nodeIndex required" });
    }
    const pipeline = new PublicKey(pipelinePda);
    const idx = Number(nodeIndex);
    const p = await getPipeline(cfg.connection, pipeline, cfg.addresses);
    const node = p?.nodes[idx];
    if (!node) return res.status(404).json({ error: "node not found" });
    if (!("submitted" in node.status)) {
      return res.status(400).json({ error: "node is not in Submitted state" });
    }
    const { signature } = await finalizeOverdue(
      cfg.connection,
      cfg.facilitator,
      pipeline,
      idx,
      node.agent,
      cfg.operatorTreasury,
      cfg.addresses
    );
    res.json({ signature, explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet` });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Arbiter (facilitator authority, v1) resolves a disputed node. upheld=true → refund
// consumer + slash agent; upheld=false → settle + pay agent. v2 roadmap: decentralized arbiter.
app.post("/resolve", async (req: Request, res: Response) => {
  try {
    const { pipelinePda, nodeIndex, upheld } = req.body ?? {};
    if (!pipelinePda || nodeIndex === undefined || upheld === undefined) {
      return res.status(400).json({ error: "pipelinePda, nodeIndex, upheld required" });
    }
    const pipeline = new PublicKey(pipelinePda);
    const idx = Number(nodeIndex);
    const p = await getPipeline(cfg.connection, pipeline, cfg.addresses);
    const node = p?.nodes[idx];
    if (!node) return res.status(404).json({ error: "node not found" });
    if (!("disputed" in node.status)) {
      return res.status(400).json({ error: "node is not in Disputed state" });
    }
    const { signature } = await resolveNode(
      cfg.connection,
      cfg.facilitator,
      pipeline,
      idx,
      node.agent,
      Boolean(upheld),
      cfg.operatorTreasury,
      cfg.addresses
    );
    res.json({ signature, upheld: Boolean(upheld), explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet` });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Read a node's settlement (delivery proof + dispute window state).
app.get("/settlement/:pipelinePda/:nodeIndex", async (req: Request, res: Response) => {
  try {
    const pipeline = new PublicKey(req.params.pipelinePda);
    const idx = Number(req.params.nodeIndex);
    const s = await getSettlement(cfg.connection, pipeline, idx, cfg.addresses);
    if (!s) return res.status(404).json({ error: "settlement not found" });
    res.json({
      uri: decodeUri(s.uri as number[], s.uriLen),
      resultHash: Buffer.from(s.resultHash as number[]).toString("hex"),
      submittedAtSlot: Number(s.submittedAtSlot),
      disputeUntil: Number(s.submittedAtSlot) + DISPUTE_SLOTS,
      disputed: s.disputed,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/pipeline/:pipelinePda", async (req: Request, res: Response) => {
  try {
    const pipeline = new PublicKey(req.params.pipelinePda);
    const p = await getPipeline(cfg.connection, pipeline, cfg.addresses);
    if (!p) return res.status(404).json({ error: "pipeline not found" });
    const { nodes, ...pipelineFields } = p;
    res.json({ pipeline: serialize(pipelineFields), nodes: serialize(nodes) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/agent/:agentPubkey", async (req: Request, res: Response) => {
  try {
    const agent = new PublicKey(req.params.agentPubkey);
    const [stake, reputation] = await Promise.all([
      getAgentStake(cfg.connection, agent, cfg.addresses),
      getAgentReputation(cfg.connection, agent, cfg.addresses),
    ]);
    res.json({ stake: serialize(stake), reputation: serialize(reputation) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

if (require.main === module) {
  app.listen(cfg.port, () => {
    console.log(`ChainPipe facilitator on :${cfg.port}`);
    console.log(`  facilitator ${cfg.facilitator.publicKey.toBase58()}`);
    console.log(`  dag_escrow  ${cfg.addresses.dagEscrow.toBase58()}`);
  });
}

export { app };
