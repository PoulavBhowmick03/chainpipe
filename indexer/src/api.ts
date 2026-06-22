import express, { Request, Response } from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import nacl from "tweetnacl";
import { Connection, PublicKey } from "@solana/web3.js";
import { DEVNET_ADDRESSES, ChainPipeAddresses } from "@chainpipe/solana";
import { Store, type NodeSpec } from "./store";
import { startPolling } from "./poller";

dotenv.config();

const rpc = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const port = Number(process.env.INDEXER_PORT ?? 3002);
const connection = new Connection(rpc, "confirmed");
const addresses: ChainPipeAddresses = {
  ...DEVNET_ADDRESSES,
  usdcMint: process.env.CHAINPIPE_USDC_MINT
    ? new PublicKey(process.env.CHAINPIPE_USDC_MINT)
    : DEVNET_ADDRESSES.usdcMint,
};

const store = new Store(process.env.INDEXER_STORE ?? "./indexer/data/store.json");

const STATUS_KEY: Record<string, string> = {
  active: "active",
  completed: "completed",
  partial: "partiallyRefunded",
  cancelled: "cancelled",
};

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ?? true }));
app.use(express.json({ limit: "256kb" }));

// Canonical message a consumer signs to attach job specs to their pipeline's nodes.
// MUST byte-match the dashboard's specMessage().
function specMessage(
  pipeline: string,
  specs: { nodeIndex: number; skill: string; description: string; inputUri: string }[]
): Uint8Array {
  const body = [...specs]
    .sort((a, b) => a.nodeIndex - b.nodeIndex)
    .map((s) => `${s.nodeIndex}${s.skill}${s.description}${s.inputUri}`)
    .join("\n");
  return new TextEncoder().encode(`chainpipe-spec\n${pipeline}\n${body}`);
}

// Merge stored specs into a pipeline's nodes — only if the recorded signer matches the
// pipeline's real on-chain consumer (so a spec can't be spoofed for someone else's pipeline).
function withSpecs(p: any) {
  const entry = store.data.specs?.[p.address];
  if (!entry || entry.consumer !== p.consumer) return p;
  return { ...p, nodes: (p.nodes ?? []).map((n: any) => ({ ...n, ...(entry.nodes[n.nodeIndex] ?? {}) })) };
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", updatedAt: store.data.updatedAt, rpc });
});

app.get("/stats", (_req: Request, res: Response) => {
  res.json(store.data.stats ?? {});
});

app.get("/pipelines", (req: Request, res: Response) => {
  let out = store.data.pipelines;
  const consumer = req.query.consumer as string | undefined;
  const status = req.query.status as string | undefined;
  if (consumer) out = out.filter((p) => p.consumer === consumer);
  if (status && STATUS_KEY[status]) {
    out = out.filter((p) => Object.keys(p.status ?? {})[0] === STATUS_KEY[status]);
  }
  res.json(out.map(withSpecs));
});

app.get("/pipelines/:pipelinePda", (req: Request, res: Response) => {
  const p = store.data.pipelines.find((x) => x.address === req.params.pipelinePda);
  if (!p) return res.status(404).json({ error: "pipeline not found" });
  res.json(withSpecs(p));
});

// Attach consumer-signed job specs (skill / description / input URI) to a pipeline's nodes.
// Signature proves the caller holds `consumer`; binding to the pipeline's real consumer is
// enforced at read time in withSpecs(). This is the "what to build" layer the chain omits.
app.post("/spec", (req: Request, res: Response) => {
  try {
    const { pipelinePda, consumer, signature, specs } = req.body ?? {};
    if (!pipelinePda || !consumer || !signature || !Array.isArray(specs)) {
      return res.status(400).json({ error: "pipelinePda, consumer, signature, specs[] required" });
    }
    const msg = specMessage(pipelinePda, specs);
    const ok = nacl.sign.detached.verify(msg, Buffer.from(signature, "base64"), new PublicKey(consumer).toBytes());
    if (!ok) return res.status(401).json({ error: "signature does not match consumer" });
    const nodes: Record<number, NodeSpec> = {};
    for (const s of specs) {
      nodes[Number(s.nodeIndex)] = {
        skill: String(s.skill ?? "").slice(0, 64),
        description: String(s.description ?? "").slice(0, 600),
        inputUri: String(s.inputUri ?? "").slice(0, 300),
      };
    }
    store.setSpecs(pipelinePda, consumer, nodes);
    res.json({ ok: true, nodes: Object.keys(nodes).length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/agents", (req: Request, res: Response) => {
  let out = store.data.agents;
  const minTier = req.query.minTier ? Number(req.query.minTier) : undefined;
  const minScore = req.query.minScore ? Number(req.query.minScore) : undefined;
  if (minTier !== undefined) out = out.filter((a) => a.tier >= minTier);
  if (minScore !== undefined)
    out = out.filter((a) => (a.reputation ? a.reputation.emaScore : 0) >= minScore);
  res.json(out);
});

app.get("/agents/:agentPubkey", (req: Request, res: Response) => {
  const a = store.data.agents.find(
    (x) => x.agent === req.params.agentPubkey || x.address === req.params.agentPubkey
  );
  if (!a) return res.status(404).json({ error: "agent not found" });
  res.json(a);
});

if (require.main === module) {
  startPolling(connection, addresses, store, Number(process.env.POLL_INTERVAL_MS ?? 5000));
  app.listen(port, () => {
    console.log(`ChainPipe indexer on :${port} (polling ${rpc} every 5s)`);
  });
}

export { app, store };
