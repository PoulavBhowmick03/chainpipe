import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { DEVNET_ADDRESSES, ChainPipeAddresses } from "@chainpipe/solana";
import { readFileSync } from "fs";
import { homedir } from "os";
import * as dotenv from "dotenv";

dotenv.config();

function loadKeypair(path: string): Keypair {
  const resolved = path.replace(/^~/, homedir());
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(resolved, "utf-8"))));
}

export interface FacilitatorConfig {
  connection: Connection;
  facilitator: Keypair;
  operator: PublicKey;
  operatorTreasury: PublicKey;
  addresses: ChainPipeAddresses;
  port: number;
}

export function loadConfig(): FacilitatorConfig {
  const rpc = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");
  const facilitator = loadKeypair(process.env.FACILITATOR_KEYPAIR ?? "./keys/facilitator.json");
  const operator = new PublicKey(
    process.env.OPERATOR_PUBKEY ?? "5cpcXjLZHhntiqhNNX1Yay7SghhcALsQcwH2WJCs3VUm"
  );

  const addresses: ChainPipeAddresses = {
    ...DEVNET_ADDRESSES,
    usdcMint: process.env.CHAINPIPE_USDC_MINT
      ? new PublicKey(process.env.CHAINPIPE_USDC_MINT)
      : DEVNET_ADDRESSES.usdcMint,
  };

  const operatorTreasury = getAssociatedTokenAddressSync(addresses.usdcMint, operator);

  return {
    connection,
    facilitator,
    operator,
    operatorTreasury,
    addresses,
    port: Number(process.env.PORT ?? 3001),
  };
}
