import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import { BondedRegistry } from "../target/types/bonded_registry";

const TIER1 = 10_000_000; // 10 USDC (6 decimals)
const TIER2 = 100_000_000; // 100 USDC
const TIER3 = 1_000_000_000; // 1000 USDC
const COOLDOWN_SLOTS = 20; // tiny for tests; production uses 60480
const SLASH_BPS = 1500;

describe("bonded_registry", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.bondedRegistry as anchor.Program<BondedRegistry>;
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  // dagAuth simulates dag_escrow's CPI signer PDA (a keypair we control here).
  const dagAuth = Keypair.generate();
  const attacker = Keypair.generate();
  const consumer = Keypair.generate();

  let mint: PublicKey;
  let consumerAta: PublicKey;

  const configPda = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  )[0];

  const stakePda = (agent: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("agent_stake"), agent.toBuffer()],
      program.programId
    )[0];
  const vaultOf = (agent: PublicKey) =>
    getAssociatedTokenAddressSync(mint, stakePda(agent), true);

  async function airdrop(pk: PublicKey, sol: number) {
    const sig = await connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }

  // Create a funded agent with an ATA holding `tokens` base units.
  async function newAgent(tokens: number): Promise<Keypair> {
    const agent = Keypair.generate();
    await airdrop(agent.publicKey, 2);
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      agent.publicKey
    );
    if (tokens > 0) {
      await mintTo(connection, payer, mint, ata.address, payer.publicKey, tokens);
    }
    return agent;
  }

  async function stake(agent: Keypair, amount: number) {
    return program.methods
      .stakeAndRegister(new BN(amount))
      .accountsPartial({
        agentStake: stakePda(agent.publicKey),
        agent: agent.publicKey,
        stakeMint: mint,
        agentTokenAccount: getAssociatedTokenAddressSync(mint, agent.publicKey),
        vault: vaultOf(agent.publicKey),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([agent])
      .rpc();
  }

  async function expectError(p: Promise<any>, code: string) {
    try {
      await p;
      assert.fail(`expected error ${code} but tx succeeded`);
    } catch (e: any) {
      const msg = e.toString() + JSON.stringify(e.logs ?? "");
      assert.include(msg, code, `expected error ${code}, got: ${msg}`);
    }
  }

  before(async () => {
    await airdrop(provider.wallet.publicKey, 50);
    mint = await createMint(connection, payer, payer.publicKey, null, 6);
    const cAta = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      consumer.publicKey
    );
    consumerAta = cAta.address;
  });

  it("initializes registry config with correct operator, slash_bps, cooldown_slots", async () => {
    await program.methods
      .initialize(SLASH_BPS, new BN(COOLDOWN_SLOTS), dagAuth.publicKey)
      .accountsPartial({
        config: configPda,
        operator: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.registryConfig.fetch(configPda);
    assert.equal(cfg.operator.toBase58(), provider.wallet.publicKey.toBase58());
    assert.equal(cfg.slashBps, SLASH_BPS);
    assert.equal(cfg.cooldownSlots.toNumber(), COOLDOWN_SLOTS);
    assert.equal(cfg.dagEscrowAuthority.toBase58(), dagAuth.publicKey.toBase58());
  });

  it("stakes USDC and assigns Tier 1 (10 USDC)", async () => {
    const agent = await newAgent(TIER1);
    await stake(agent, TIER1);
    const s = await program.account.agentStake.fetch(stakePda(agent.publicKey));
    assert.equal(s.tier, 1);
    assert.equal(s.stakeAmount.toNumber(), TIER1);
    const vault = await getAccount(connection, vaultOf(agent.publicKey));
    assert.equal(Number(vault.amount), TIER1);
  });

  it("stakes USDC and assigns Tier 2 (100 USDC)", async () => {
    const agent = await newAgent(TIER2);
    await stake(agent, TIER2);
    const s = await program.account.agentStake.fetch(stakePda(agent.publicKey));
    assert.equal(s.tier, 2);
  });

  it("stakes USDC and assigns Tier 3 (1000 USDC)", async () => {
    const agent = await newAgent(TIER3);
    await stake(agent, TIER3);
    const s = await program.account.agentStake.fetch(stakePda(agent.publicKey));
    assert.equal(s.tier, 3);
  });

  it("add_stake upgrades from Tier 1 to Tier 2 correctly", async () => {
    const agent = await newAgent(TIER2); // mint 100 total, stake 10 then add 90
    await stake(agent, TIER1);
    let s = await program.account.agentStake.fetch(stakePda(agent.publicKey));
    assert.equal(s.tier, 1);

    await program.methods
      .addStake(new BN(TIER2 - TIER1))
      .accountsPartial({
        agentStake: stakePda(agent.publicKey),
        agent: agent.publicKey,
        stakeMint: mint,
        agentTokenAccount: getAssociatedTokenAddressSync(mint, agent.publicKey),
        vault: vaultOf(agent.publicKey),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([agent])
      .rpc();

    s = await program.account.agentStake.fetch(stakePda(agent.publicKey));
    assert.equal(s.tier, 2);
    assert.equal(s.stakeAmount.toNumber(), TIER2);
  });

  it("request_unstake fails when open_jobs > 0", async () => {
    const agent = await newAgent(TIER1);
    await stake(agent, TIER1);

    // dag_escrow (simulated by dagAuth) opens a job on this agent.
    await program.methods
      .incrementOpenJobs()
      .accountsPartial({
        config: configPda,
        agentStake: stakePda(agent.publicKey),
        dagAuthority: dagAuth.publicKey,
      })
      .signers([dagAuth])
      .rpc();

    await expectError(
      program.methods
        .requestUnstake()
        .accountsPartial({ agentStake: stakePda(agent.publicKey), agent: agent.publicKey })
        .signers([agent])
        .rpc(),
      "HasOpenJobs"
    );
  });

  // Shared agent for the unstake-cooldown pair of tests.
  let unstaker: Keypair;

  it("execute_unstake fails before cooldown elapses", async () => {
    unstaker = await newAgent(TIER1);
    await stake(unstaker, TIER1);
    await program.methods
      .requestUnstake()
      .accountsPartial({ agentStake: stakePda(unstaker.publicKey), agent: unstaker.publicKey })
      .signers([unstaker])
      .rpc();

    await expectError(
      program.methods
        .executeUnstake()
        .accountsPartial({
          config: configPda,
          agentStake: stakePda(unstaker.publicKey),
          agent: unstaker.publicKey,
          stakeMint: mint,
          vault: vaultOf(unstaker.publicKey),
          agentTokenAccount: getAssociatedTokenAddressSync(mint, unstaker.publicKey),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([unstaker])
        .rpc(),
      "CooldownNotElapsed"
    );
  });

  it("execute_unstake succeeds after cooldown and transfers full stake back", async () => {
    const requestedSlot = await connection.getSlot("confirmed");
    // Wait until the chain advances past the cooldown window.
    while ((await connection.getSlot("confirmed")) < requestedSlot + COOLDOWN_SLOTS + 2) {
      await new Promise((r) => setTimeout(r, 400));
    }

    const ata = getAssociatedTokenAddressSync(mint, unstaker.publicKey);
    const before = Number((await getAccount(connection, ata)).amount);

    await program.methods
      .executeUnstake()
      .accountsPartial({
        config: configPda,
        agentStake: stakePda(unstaker.publicKey),
        agent: unstaker.publicKey,
        stakeMint: mint,
        vault: vaultOf(unstaker.publicKey),
        agentTokenAccount: ata,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([unstaker])
      .rpc();

    const after = Number((await getAccount(connection, ata)).amount);
    assert.equal(after - before, TIER1, "full stake returned");
    const s = await program.account.agentStake.fetch(stakePda(unstaker.publicKey));
    assert.equal(s.stakeAmount.toNumber(), 0);
    assert.equal(s.tier, 0);
  });

  it("slash_stake transfers correct bps amount to consumer", async () => {
    const agent = await newAgent(TIER3);
    await stake(agent, TIER3);

    const before = Number((await getAccount(connection, consumerAta)).amount);
    const jobId = Array.from(Buffer.alloc(32, 9));

    await program.methods
      .slashStake(jobId, SLASH_BPS)
      .accountsPartial({
        config: configPda,
        agentStake: stakePda(agent.publicKey),
        stakeMint: mint,
        vault: vaultOf(agent.publicKey),
        consumerTokenAccount: consumerAta,
        dagAuthority: dagAuth.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([dagAuth])
      .rpc();

    const after = Number((await getAccount(connection, consumerAta)).amount);
    const expectedSlash = Math.floor((TIER3 * SLASH_BPS) / 10_000); // 150 USDC
    assert.equal(after - before, expectedSlash);

    const s = await program.account.agentStake.fetch(stakePda(agent.publicKey));
    assert.equal(s.stakeAmount.toNumber(), TIER3 - expectedSlash);
    assert.equal(s.totalSlashed, 1);
  });

  it("slash_stake downgrades tier if stake falls below threshold", async () => {
    const agent = await newAgent(TIER2);
    await stake(agent, TIER2);
    let s = await program.account.agentStake.fetch(stakePda(agent.publicKey));
    assert.equal(s.tier, 2);

    // Slash 90% → 10 USDC remains → Tier 1.
    await program.methods
      .slashStake(Array.from(Buffer.alloc(32, 1)), 9000)
      .accountsPartial({
        config: configPda,
        agentStake: stakePda(agent.publicKey),
        stakeMint: mint,
        vault: vaultOf(agent.publicKey),
        consumerTokenAccount: consumerAta,
        dagAuthority: dagAuth.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([dagAuth])
      .rpc();

    s = await program.account.agentStake.fetch(stakePda(agent.publicKey));
    assert.equal(s.stakeAmount.toNumber(), TIER1);
    assert.equal(s.tier, 1, "downgraded from Tier 2 to Tier 1");
  });

  it("slash_stake fails with UnauthorizedCaller if not signed by dag_escrow", async () => {
    const agent = await newAgent(TIER2);
    await stake(agent, TIER2);

    await expectError(
      program.methods
        .slashStake(Array.from(Buffer.alloc(32, 2)), SLASH_BPS)
        .accountsPartial({
          config: configPda,
          agentStake: stakePda(agent.publicKey),
          stakeMint: mint,
          vault: vaultOf(agent.publicKey),
          consumerTokenAccount: consumerAta,
          dagAuthority: attacker.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([attacker])
        .rpc(),
      "UnauthorizedCaller"
    );
  });

  it("agent cannot stake below minimum (< 10 USDC)", async () => {
    const agent = await newAgent(5_000_000); // 5 USDC
    await expectError(stake(agent, 5_000_000), "StakeTooLow");
  });
});
