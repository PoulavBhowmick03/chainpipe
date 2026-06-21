/**
 * One-time Phase 15 hardening migration of the three live config PDAs on devnet.
 *
 * Grows each config to its hardened layout (realloc) and seeds the new fields with
 * safe defaults via the operator-only migrate_* instructions:
 *   - dag_escrow::migrate_pipeline_config  → version, paused=false, dispute_slots=150, pending_operator=∅
 *   - bonded_registry::migrate_registry_config → version, max_slash_bps=10000, pending_operator=∅
 *   - reputation_bridge::migrate_bridge_config → version, pending_operator=∅
 *
 * Idempotent: each migrate_* rejects with AlreadyMigrated (version!=0) if already run,
 * which this script treats as success.
 *
 * Run AFTER deploying the hardened program binaries, BEFORE transferring upgrade
 * authority to the multisig (see SECURITY.md runbook).
 *
 * Usage: npx tsx scripts/migrate-configs.mts
 */
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const idl = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, "..", "target", "idl", `${name}.json`), "utf-8"));

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path.replace(/^~/, homedir()), "utf-8"))));
}

async function tryMigrate(label: string, run: () => Promise<string>) {
  try {
    const tx = await run();
    console.log(`  ${label}: migrated — ${tx}`);
  } catch (e) {
    const msg = String((e as { message?: string }).message ?? e);
    if (msg.includes("AlreadyMigrated")) console.log(`  ${label}: already migrated (skipped)`);
    else throw e;
  }
}

async function main() {
  const operator = loadKeypair(process.env.ANCHOR_WALLET ?? `${homedir()}/.config/solana/id.json`);
  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(operator), { commitment: "confirmed" });
  anchor.setProvider(provider);

  const bonded = new anchor.Program(idl("bonded_registry") as anchor.Idl, provider);
  const dag = new anchor.Program(idl("dag_escrow") as anchor.Idl, provider);
  const rep = new anchor.Program(idl("reputation_bridge") as anchor.Idl, provider);

  const deConfig = PublicKey.findProgramAddressSync([Buffer.from("pipeline_config")], dag.programId)[0];
  const brConfig = PublicKey.findProgramAddressSync([Buffer.from("config")], bonded.programId)[0];
  const rbConfig = PublicKey.findProgramAddressSync([Buffer.from("bridge_config")], rep.programId)[0];

  console.log("Operator:", operator.publicKey.toBase58(), "\n");

  await tryMigrate("dag_escrow PipelineConfig", () =>
    dag.methods.migratePipelineConfig().accounts({ pipelineConfig: deConfig, operator: operator.publicKey }).rpc()
  );
  await tryMigrate("bonded_registry RegistryConfig", () =>
    bonded.methods.migrateRegistryConfig().accounts({ config: brConfig, operator: operator.publicKey }).rpc()
  );
  await tryMigrate("reputation_bridge BridgeConfig", () =>
    rep.methods.migrateBridgeConfig().accounts({ bridgeConfig: rbConfig, operator: operator.publicKey }).rpc()
  );

  console.log("\nDone. Record tx sigs + new config sizes in DEPLOYED.md.");
}

main().catch((e) => { console.error(e); process.exit(1); });
