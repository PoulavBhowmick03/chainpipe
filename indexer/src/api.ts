import express, { Request, Response } from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { Connection, PublicKey } from "@solana/web3.js";
import { DEVNET_ADDRESSES, ChainPipeAddresses } from "@chainpipe/solana";
import { Store } from "./store";
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
  res.json(out);
});

app.get("/pipelines/:pipelinePda", (req: Request, res: Response) => {
  const p = store.data.pipelines.find((x) => x.address === req.params.pipelinePda);
  if (!p) return res.status(404).json({ error: "pipeline not found" });
  res.json(p);
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
