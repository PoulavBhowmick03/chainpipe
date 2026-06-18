/**
 * Initialize ChainPipe program configs on the configured cluster (devnet).
 *
 * Creates the three config PDAs and wires the cross-program CPI authority:
 *   - reputation_bridge: dag_escrow_authority = dag_escrow [b"dag_authority"] PDA
 *   - bonded_registry:   dag_escrow_authority = same PDA
 *   - dag_escrow:        facilitator_authority = keys/facilitator.json
 *
 * Idempotent: re-running skips already-initialized configs and (re)wires
 * authorities via the operator-only setters.
 *
 * Usage: npx tsx scripts/initialize-programs.mts
 */
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "fs";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const idl = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, "..", "target", "idl", `${name}.json`), "utf-8"));
const bondedIdl = idl("bonded_registry");
const dagIdl = idl("dag_escrow");
const repIdl = idl("reputation_bridge");

const SLASH_BPS = Number(process.env.STAKE_SLASH_BPS ?? 1500);
const COOLDOWN_SLOTS = Number(process.env.COOLDOWN_SLOTS ?? 60480);
const EMA_ALPHA_BPS = Number(process.env.EMA_ALPHA_BPS ?? 2000);
const FEE_BPS = Number(process.env.FEE_BPS ?? 20);
const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

function loadKeypair(path: string): Keypair {
  const resolved = path.replace(/^~/, homedir());
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(resolved, "utf-8")))
  );
}

async function main() {
  const walletPath = process.env.ANCHOR_WALLET ?? `${homedir()}/.config/solana/id.json`;
  const operator = loadKeypair(walletPath);
  const facilitator = loadKeypair("./keys/facilitator.json");

  const connection = new Connection(RPC, "confirmed");
  const wallet = new anchor.Wallet(operator);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const bonded = new anchor.Program(bondedIdl as anchor.Idl, provider);
  const dag = new anchor.Program(dagIdl as anchor.Idl, provider);
  const rep = new anchor.Program(repIdl as anchor.Idl, provider);

  const dagAuthPda = PublicKey.findProgramAddressSync(
    [Buffer.from("dag_authority")],
    dag.programId
  )[0];
  const brConfig = PublicKey.findProgramAddressSync([Buffer.from("config")], bonded.programId)[0];
  const rbConfig = PublicKey.findProgramAddressSync([Buffer.from("bridge_config")], rep.programId)[0];
  const deConfig = PublicKey.findProgramAddressSync([Buffer.from("pipeline_config")], dag.programId)[0];

  console.log("Operator   :", operator.publicKey.toBase58());
  console.log("Facilitator:", facilitator.publicKey.toBase58());
  console.log("dag_authority PDA:", dagAuthPda.toBase58());
  console.log("");

  const exists = async (pk: PublicKey) => (await connection.getAccountInfo(pk)) !== null;

  // reputation_bridge
  if (!(await exists(rbConfig))) {
    const tx = await rep.methods
      .initialize(dag.programId, dagAuthPda, EMA_ALPHA_BPS)
      .accounts({ bridgeConfig: rbConfig, operator: operator.publicKey })
      .rpc();
    console.log("reputation_bridge initialized:", tx);
  } else {
    const tx = await rep.methods
      .setDagEscrowAuthority(dagAuthPda)
      .accounts({ bridgeConfig: rbConfig, operator: operator.publicKey })
      .rpc();
    console.log("reputation_bridge already existed; authority set:", tx);
  }
  console.log("  BridgeConfig PDA:", rbConfig.toBase58());

  // bonded_registry
  if (!(await exists(brConfig))) {
    const tx = await bonded.methods
      .initialize(SLASH_BPS, new BN(COOLDOWN_SLOTS), dagAuthPda)
      .accounts({ config: brConfig, operator: operator.publicKey })
      .rpc();
    console.log("bonded_registry initialized:", tx);
  } else {
    const tx = await bonded.methods
      .setDagEscrowAuthority(dagAuthPda)
      .accounts({ config: brConfig, operator: operator.publicKey })
      .rpc();
    console.log("bonded_registry already existed; authority set:", tx);
  }
  console.log("  RegistryConfig PDA:", brConfig.toBase58());

  // dag_escrow
  if (!(await exists(deConfig))) {
    const tx = await dag.methods
      .initialize(FEE_BPS, facilitator.publicKey)
      .accounts({ pipelineConfig: deConfig, operator: operator.publicKey })
      .rpc();
    console.log("dag_escrow initialized:", tx);
  } else {
    console.log("dag_escrow config already exists (skipped)");
  }
  console.log("  PipelineConfig PDA:", deConfig.toBase58());

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
