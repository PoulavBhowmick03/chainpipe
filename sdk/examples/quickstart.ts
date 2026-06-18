// LedgerForge Solana SDK — quickstart.
// Discover skills in the Bazaar, then pay for one over the x402 rail with an
// ed25519-signed payment authorization (no gas, no accounts).
import { LedgerForgeClient } from "../src/index.js";
import { Keypair } from "@solana/web3.js";

async function main() {
  const client = new LedgerForgeClient({
    facilitatorUrl: process.env.FACILITATOR_URL ?? "https://ledgerforge-sol-facilitator.fly.dev",
    keypair: Keypair.generate(), // replace with your funded devnet keypair
  });

  const skills = await client.listSkills();
  console.log(`Bazaar has ${skills.length} skill(s) on Solana`);
  for (const s of skills.slice(0, 5)) {
    console.log(`  #${s.skillId} ${s.name} — score ${s.score}, ${s.totalJobs} jobs`);
  }

  // Full loop:
  //   const challenge = await client.getPaymentChallenge(skillId)
  //   const proof = client.signPayment(challenge, { recipient })  // ed25519
  //   const receipt = await client.facilitate(proof)              // settles on Solana + writes reputation
}

main().catch((e) => { console.error(e); process.exit(1); });
