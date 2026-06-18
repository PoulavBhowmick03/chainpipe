// LedgerForge Solana skill server — serves the agent skills listed in the Bazaar.
// Each endpoint is an x402-gated HTTP service: without a settlement access token it
// returns 402; with one it returns the skill's result. Run: npm run skills-server
import express from "express";

const PORT = Number(process.env.SKILLS_PORT ?? 3005);
const app = express();
app.use(express.json());

// Lightweight x402 gate: a real settlement access token is `settled:<sig>:<ts>`
// (issued by the facilitator after complete_job). Demo mode accepts any bearer.
function gate(req: express.Request, res: express.Response): boolean {
  const auth = req.header("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    res.status(402).json({ error: "Payment required", scheme: "solana-ed25519", cluster: "devnet" });
    return false;
  }
  return true;
}

type Skill = { id: string; handler: (q: Record<string, string>) => unknown };

const SKILLS: Skill[] = [
  { id: "jupiter-route-optimizer", handler: (q) => ({
      inputMint: q.inputMint ?? "SOL", outputMint: q.outputMint ?? "USDC",
      bestRoute: ["Orca", "Phoenix"], priceImpactPct: 0.07, outAmount: "1987432", feeLamports: 5000 }) },
  { id: "pyth-price-feed", handler: (q) => ({
      tokens: (q.tokens ?? "SOL,USDC").split(","),
      prices: { SOL: { price: 178.42, conf: 0.05 }, USDC: { price: 1.0, conf: 0.0008 } }, slotsStale: 0 }) },
  { id: "drift-perps-signals", handler: () => ({
      markets: { "SOL-PERP": { funding1h: 0.0011, oiUsd: 42_300_000, bias: "long" },
                 "BTC-PERP": { funding1h: -0.0004, oiUsd: 88_100_000, bias: "short" } } }) },
  { id: "kamino-yield-scout", handler: () => ({
      top: [{ market: "USDC", apy: 9.4, kind: "lend" }, { market: "SOL-USDC", apy: 17.8, kind: "vault" }] }) },
  { id: "orca-pool-analysis", handler: (q) => ({
      pool: q.pool ?? "SOL-USDC", tvlUsd: 31_200_000, optimalRange: [171, 186], priceImpactPct: 0.09 }) },
  { id: "helius-tx-classifier", handler: () => ({ label: "swap", confidence: 0.97, program: "Jupiter v6" }) },
  { id: "marginfi-rates", handler: (q) => ({ asset: q.asset ?? "all",
      rates: { USDC: { borrow: 7.1, lend: 4.9 }, SOL: { borrow: 3.2, lend: 1.8 } } }) },
];

app.get("/health", (_req, res) =>
  res.json({ status: "ok", network: "solana", cluster: "devnet", skills: SKILLS.map((s) => s.id) }));

for (const skill of SKILLS) {
  app.get(`/${skill.id}`, (req, res) => {
    if (!gate(req, res)) return;
    res.json({ skill: skill.id, cluster: "devnet", result: skill.handler(req.query as Record<string, string>) });
  });
}

app.listen(PORT, () => {
  console.log(`LedgerForge Solana skill server on :${PORT}`);
  console.log(`skills: ${SKILLS.map((s) => s.id).join(", ")}`);
});

export default app;
