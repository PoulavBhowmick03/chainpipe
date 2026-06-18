// Example Solana agent — discovers Bazaar skills and exercises the x402 rail via the
// @poulav/x402-solana SDK (ed25519 payment auth → facilitator settle → reputation).
// Run: npm run scout
import { LedgerForgeClient } from "@poulav/x402-solana";
import { Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import os from "node:os";

const facilitatorUrl = process.env.FACILITATOR_URL ?? "https://ledgerforge-sol-facilitator.fly.dev";

function loadKeypair(): Keypair {
  const path = process.env.WALLET ?? `${os.homedir()}/.config/solana/id.json`;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

async function main() {
  const keypair = loadKeypair();
  const client = new LedgerForgeClient({ facilitatorUrl, keypair });
  console.log("agent:", keypair.publicKey.toBase58(), "· cluster: devnet");

  const skills = await client.listSkills().catch(() => []);
  console.log(`discovered ${skills.length} skill(s) in the Bazaar`);
  for (const s of skills.slice(0, 5)) {
    console.log(`  #${s.skillId} ${s.name} — score ${s.score}, ${s.totalJobs} jobs`);
  }

  // Full loop (see facilitator/scripts/e2e-devnet.mjs for the proven end-to-end run):
  //   const challenge = await client.getPaymentChallenge(skillId)
  //   const proof = client.signPayment(challenge, { recipient })   // ed25519
  //   const receipt = await client.facilitate(proof)               // complete_job + reputation
  console.log("Solana x402 agent ready.");
}

main().catch((e) => { console.error(e); process.exit(1); });
