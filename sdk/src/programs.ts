import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";

import bondedIdl from "./idl/bonded_registry.json";
import dagIdl from "./idl/dag_escrow.json";
import repIdl from "./idl/reputation_bridge.json";
import type { BondedRegistry } from "./idl/bonded_registry";
import type { DagEscrow } from "./idl/dag_escrow";
import type { ReputationBridge } from "./idl/reputation_bridge";
import type { ChainPipeAddresses } from "./addresses";

export interface ChainPipePrograms {
  provider: anchor.AnchorProvider;
  bonded: anchor.Program<BondedRegistry>;
  dag: anchor.Program<DagEscrow>;
  rep: anchor.Program<ReputationBridge>;
}

function withAddress<T>(idl: unknown, address: string): T {
  return { ...(idl as Record<string, unknown>), address } as T;
}

/** Build the three Anchor programs against `addresses`, signing as `payer`
 *  (a throwaway keypair is used for read-only access when `payer` is omitted). */
export function loadPrograms(
  connection: Connection,
  addresses: ChainPipeAddresses,
  payer?: Keypair
): ChainPipePrograms {
  const wallet = new anchor.Wallet(payer ?? Keypair.generate());
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });

  const bonded = new anchor.Program<BondedRegistry>(
    withAddress<BondedRegistry>(bondedIdl, addresses.bondedRegistry.toBase58()),
    provider
  );
  const dag = new anchor.Program<DagEscrow>(
    withAddress<DagEscrow>(dagIdl, addresses.dagEscrow.toBase58()),
    provider
  );
  const rep = new anchor.Program<ReputationBridge>(
    withAddress<ReputationBridge>(repIdl, addresses.reputationBridge.toBase58()),
    provider
  );
  return { provider, bonded, dag, rep };
}
