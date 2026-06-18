import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Connection, Keypair, PublicKey, TransactionSignature } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { ChainPipeAddresses } from "./addresses";
import { loadPrograms } from "./programs";
import { agentStakePda, registryConfigPda, vaultAta } from "./pdas";
import type { BondedRegistry } from "./idl/bonded_registry";

export type AgentStake = anchor.IdlAccounts<BondedRegistry>["agentStake"];

export async function stakeAndRegister(
  connection: Connection,
  agent: Keypair,
  stakeAmount: bigint,
  stakeMint: PublicKey,
  addresses: ChainPipeAddresses
): Promise<{ signature: TransactionSignature; agentStakePda: PublicKey; tier: number }> {
  const { bonded } = loadPrograms(connection, addresses, agent);
  const stakePda = agentStakePda(addresses, agent.publicKey);
  const signature = await bonded.methods
    .stakeAndRegister(new BN(stakeAmount.toString()))
    .accountsPartial({
      agentStake: stakePda,
      agent: agent.publicKey,
      stakeMint,
      agentTokenAccount: getAssociatedTokenAddressSync(stakeMint, agent.publicKey),
      vault: vaultAta(stakeMint, stakePda),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([agent])
    .rpc();
  const stake = await bonded.account.agentStake.fetch(stakePda);
  return { signature, agentStakePda: stakePda, tier: stake.tier };
}

export async function addStake(
  connection: Connection,
  agent: Keypair,
  additionalAmount: bigint,
  stakeMint: PublicKey,
  addresses: ChainPipeAddresses
): Promise<{ signature: TransactionSignature; tier: number }> {
  const { bonded } = loadPrograms(connection, addresses, agent);
  const stakePda = agentStakePda(addresses, agent.publicKey);
  const signature = await bonded.methods
    .addStake(new BN(additionalAmount.toString()))
    .accountsPartial({
      agentStake: stakePda,
      agent: agent.publicKey,
      stakeMint,
      agentTokenAccount: getAssociatedTokenAddressSync(stakeMint, agent.publicKey),
      vault: vaultAta(stakeMint, stakePda),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([agent])
    .rpc();
  const stake = await bonded.account.agentStake.fetch(stakePda);
  return { signature, tier: stake.tier };
}

export async function requestUnstake(
  connection: Connection,
  agent: Keypair,
  addresses: ChainPipeAddresses
): Promise<{ signature: TransactionSignature }> {
  const { bonded } = loadPrograms(connection, addresses, agent);
  const signature = await bonded.methods
    .requestUnstake()
    .accountsPartial({ agentStake: agentStakePda(addresses, agent.publicKey), agent: agent.publicKey })
    .signers([agent])
    .rpc();
  return { signature };
}

export async function executeUnstake(
  connection: Connection,
  agent: Keypair,
  stakeMint: PublicKey,
  addresses: ChainPipeAddresses
): Promise<{ signature: TransactionSignature }> {
  const { bonded } = loadPrograms(connection, addresses, agent);
  const stakePda = agentStakePda(addresses, agent.publicKey);
  const signature = await bonded.methods
    .executeUnstake()
    .accountsPartial({
      config: registryConfigPda(addresses),
      agentStake: stakePda,
      agent: agent.publicKey,
      stakeMint,
      vault: vaultAta(stakeMint, stakePda),
      agentTokenAccount: getAssociatedTokenAddressSync(stakeMint, agent.publicKey),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([agent])
    .rpc();
  return { signature };
}

export async function getAgentStake(
  connection: Connection,
  agentPubkey: PublicKey,
  addresses: ChainPipeAddresses
): Promise<AgentStake | null> {
  const { bonded } = loadPrograms(connection, addresses);
  return bonded.account.agentStake.fetchNullable(agentStakePda(addresses, agentPubkey));
}
