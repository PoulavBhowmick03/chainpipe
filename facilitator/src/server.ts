import express, { Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { PublicKey } from "@solana/web3.js";
import {
  getPipeline,
  getAgentStake,
  getAgentReputation,
} from "@chainpipe/solana";

import { loadConfig } from "./config";
import { verifyCompletion, verifyExpirable } from "./verifier";
import { settleNode, expireOverdue } from "./settler";
import { scoreDelta } from "./scorer";
import { ReplayGuard } from "./replay";
import { serialize } from "./serialize";

const cfg = loadConfig();
const replay = new ReplayGuard(cfg.connection, cfg.addresses);

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? true }));

const limiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true });
app.use(["/complete", "/expire"], limiter);

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

app.post("/complete", async (req: Request, res: Response) => {
  try {
    const { pipelinePda, nodeIndex, agentSignature } = req.body ?? {};
    if (!pipelinePda || nodeIndex === undefined || !agentSignature) {
      return res.status(400).json({ error: "pipelinePda, nodeIndex, agentSignature required" });
    }
    const pipeline = new PublicKey(pipelinePda);
    const idx = Number(nodeIndex);

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

    const v = await verifyCompletion(
      cfg.connection,
      pipeline,
      idx,
      decodeSignature(agentSignature),
      cfg.addresses
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
      cfg.addresses
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
