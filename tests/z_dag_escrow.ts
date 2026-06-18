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
import { DagEscrow } from "../target/types/dag_escrow";
import { BondedRegistry } from "../target/types/bonded_registry";
import { ReputationBridge } from "../target/types/reputation_bridge";

const USDC = 1_000_000; // 1 USDC in base units
const T1 = 10 * USDC;
const FEE_BPS = 20;
const FAR = 100_000; // deadline slots: effectively never expires in a test
const SHORT = 25; // deadline slots: expires within a few seconds

describe("dag_escrow (integration)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const de = anchor.workspace.dagEscrow as anchor.Program<DagEscrow>;
  const br = anchor.workspace.bondedRegistry as anchor.Program<BondedRegistry>;
  const rb = anchor.workspace.reputationBridge as anchor.Program<ReputationBridge>;
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const facilitator = Keypair.generate();
  const consumer = Keypair.generate();

  let mint: PublicKey;
  let consumerAta: PublicKey;
  let operatorTreasury: PublicKey;

  const dagAuthPda = PublicKey.findProgramAddressSync(
    [Buffer.from("dag_authority")],
    de.programId
  )[0];
  const pipelineConfigPda = PublicKey.findProgramAddressSync(
    [Buffer.from("pipeline_config")],
    de.programId
  )[0];
  const brConfigPda = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    br.programId
  )[0];
  const rbConfigPda = PublicKey.findProgramAddressSync(
    [Buffer.from("bridge_config")],
    rb.programId
  )[0];

  const nonceBuf = (n: number) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(n));
    return b;
  };
  const pipelinePda = (n: number) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("pipeline"), consumer.publicKey.toBuffer(), nonceBuf(n)],
      de.programId
    )[0];
  const nodePda = (pipeline: PublicKey, idx: number) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("node"), pipeline.toBuffer(), Buffer.from([idx])],
      de.programId
    )[0];
  const brStakePda = (a: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("agent_stake"), a.toBuffer()],
      br.programId
    )[0];
  const brVault = (a: PublicKey) =>
    getAssociatedTokenAddressSync(mint, brStakePda(a), true);
  const rbRepPda = (a: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("reputation"), a.toBuffer()],
      rb.programId
    )[0];
  const rbJobPda = (jobId: Buffer) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("job_record"), jobId],
      rb.programId
    )[0];

  async function airdrop(pk: PublicKey, sol: number) {
    const sig = await connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }

  // Agents: keypair + USDC ATA seeded, staked into bonded_registry at given amount.
  async function makeAgent(stakeAmount: number): Promise<Keypair> {
    const a = Keypair.generate();
    await airdrop(a.publicKey, 2);
    const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, a.publicKey);
    await mintTo(connection, payer, mint, ata.address, payer.publicKey, stakeAmount);
    await br.methods
      .stakeAndRegister(new BN(stakeAmount))
      .accountsPartial({
        agentStake: brStakePda(a.publicKey),
        agent: a.publicKey,
        stakeMint: mint,
        agentTokenAccount: ata.address,
        vault: brVault(a.publicKey),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([a])
      .rpc();
    return a;
  }

  type NodeCfg = { alloc: number; deadline: number; deps: number; tier: number };
  async function createPipeline(nonce: number, nodes: NodeCfg[]) {
    const pipeline = pipelinePda(nonce);
    const nodePdas = nodes.map((_, i) => nodePda(pipeline, i));
    await de.methods
      .createPipeline(
        nodes.map((n) => ({
          allocationUsdc: new BN(n.alloc),
          deadlineSlotsFromNow: new BN(n.deadline),
          dependencyMask: new BN(n.deps),
          requiredTier: n.tier,
        })),
        new BN(nonce)
      )
      .accountsPartial({
        pipeline,
        consumer: consumer.publicKey,
        stakeMint: mint,
        consumerTokenAccount: consumerAta,
        vault: getAssociatedTokenAddressSync(mint, pipeline, true),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .remainingAccounts(
        nodePdas.map((pk) => ({ pubkey: pk, isWritable: true, isSigner: false }))
      )
      .signers([consumer])
      .rpc();
    return { pipeline, nodePdas };
  }

  async function claim(agent: Keypair, pipeline: PublicKey, idx: number) {
    await de.methods
      .claimNode(idx)
      .accountsPartial({
        pipelineConfig: pipelineConfigPda,
        pipeline,
        node: nodePda(pipeline, idx),
        agent: agent.publicKey,
        agentStake: brStakePda(agent.publicKey),
        registryConfig: brConfigPda,
        dagAuthority: dagAuthPda,
        bondedRegistryProgram: br.programId,
      })
      .signers([agent])
      .rpc();
    const node = await de.account.pipelineNode.fetch(nodePda(pipeline, idx));
    return Buffer.from(node.jobId as number[]);
  }

  async function complete(
    pipeline: PublicKey,
    idx: number,
    agent: PublicKey,
    jobId: Buffer,
    scoreDelta: number
  ) {
    const agentAta = getAssociatedTokenAddressSync(mint, agent);
    await de.methods
      .completeNode(idx, scoreDelta)
      .accountsPartial({
        pipelineConfig: pipelineConfigPda,
        pipeline,
        node: nodePda(pipeline, idx),
        facilitator: facilitator.publicKey,
        vault: getAssociatedTokenAddressSync(mint, pipeline, true),
        stakeMint: mint,
        agent,
        agentTokenAccount: agentAta,
        operatorTreasury,
        dagAuthority: dagAuthPda,
        registryConfig: brConfigPda,
        agentStake: brStakePda(agent),
        bondedRegistryProgram: br.programId,
        bridgeConfig: rbConfigPda,
        agentReputation: rbRepPda(agent),
        jobRecord: rbJobPda(jobId),
        reputationBridgeProgram: rb.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([facilitator])
      .rpc();
  }

  async function expectErr(p: Promise<any>, code: string) {
    try {
      await p;
      assert.fail(`expected ${code}`);
    } catch (e: any) {
      assert.include(e.toString(), code, `expected ${code}: ${e.toString()}`);
    }
  }

  // Agents staked at Tier 1.
  let agentA: Keypair, agentB: Keypair, agentC: Keypair;
  let agentD: Keypair, agentE: Keypair, agentLow: Keypair;

  // Shared pipelines.
  let P1: { pipeline: PublicKey; nodePdas: PublicKey[] };
  let node0Job: Buffer;

  before(async () => {
    await airdrop(provider.wallet.publicKey, 80);
    await airdrop(facilitator.publicKey, 10);
    await airdrop(consumer.publicKey, 10);

    mint = await createMint(connection, payer, payer.publicKey, null, 6);
    consumerAta = (
      await getOrCreateAssociatedTokenAccount(connection, payer, mint, consumer.publicKey)
    ).address;
    await mintTo(connection, payer, mint, consumerAta, payer.publicKey, 500 * USDC);
    operatorTreasury = (
      await getOrCreateAssociatedTokenAccount(connection, payer, mint, provider.wallet.publicKey)
    ).address;

    // dag_escrow config (fresh).
    await de.methods
      .initialize(FEE_BPS, facilitator.publicKey)
      .accountsPartial({
        pipelineConfig: pipelineConfigPda,
        operator: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Rewire the other two programs' CPI authority to dag_escrow's PDA.
    await br.methods
      .setDagEscrowAuthority(dagAuthPda)
      .accountsPartial({ config: brConfigPda, operator: provider.wallet.publicKey })
      .rpc();
    await rb.methods
      .setDagEscrowAuthority(dagAuthPda)
      .accountsPartial({ bridgeConfig: rbConfigPda, operator: provider.wallet.publicKey })
      .rpc();

    agentA = await makeAgent(T1);
    agentB = await makeAgent(T1);
    agentC = await makeAgent(T1);
    agentD = await makeAgent(T1);
    agentE = await makeAgent(T1);
    agentLow = await makeAgent(T1);
  });

  it("creates pipeline config with fee_bps = 20", async () => {
    const cfg = await de.account.pipelineConfig.fetch(pipelineConfigPda);
    assert.equal(cfg.feeBps, FEE_BPS);
    assert.equal(cfg.facilitatorAuthority.toBase58(), facilitator.publicKey.toBase58());
  });

  it("creates a 3-node linear pipeline, locks correct USDC in vault", async () => {
    P1 = await createPipeline(1, [
      { alloc: 40 * USDC, deadline: FAR, deps: 0b000, tier: 1 },
      { alloc: 35 * USDC, deadline: FAR, deps: 0b001, tier: 1 },
      { alloc: 25 * USDC, deadline: FAR, deps: 0b010, tier: 1 },
    ]);
    const vault = await getAccount(connection, getAssociatedTokenAddressSync(mint, P1.pipeline, true));
    assert.equal(Number(vault.amount), 100 * USDC);
    const p = await de.account.pipeline.fetch(P1.pipeline);
    assert.equal(p.totalNodes, 3);
    assert.equal(p.totalUsdcLocked.toNumber(), 100 * USDC);
  });

  it("rejects pipeline creation with cyclic dependency mask", async () => {
    // node 0 depends on node 1 (forward edge / cycle) → bit 1 set on node 0.
    await expectErr(
      createPipeline(3, [
        { alloc: 10 * USDC, deadline: FAR, deps: 0b010, tier: 1 },
        { alloc: 10 * USDC, deadline: FAR, deps: 0b001, tier: 1 },
      ]),
      "InvalidDag"
    );
  });

  it("rejects pipeline with node count > 16", async () => {
    // The node-count check runs before the remaining-accounts check, so we can
    // send 17 configs with no node accounts and keep the tx within size limits.
    const seventeen = Array.from({ length: 17 }, () => ({
      allocationUsdc: new BN(USDC),
      deadlineSlotsFromNow: new BN(FAR),
      dependencyMask: new BN(0),
      requiredTier: 1,
    }));
    const pipeline = pipelinePda(6);
    await expectErr(
      de.methods
        .createPipeline(seventeen, new BN(6))
        .accountsPartial({
          pipeline,
          consumer: consumer.publicKey,
          stakeMint: mint,
          consumerTokenAccount: consumerAta,
          vault: getAssociatedTokenAddressSync(mint, pipeline, true),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([consumer])
        .rpc(),
      "InvalidNodeCount"
    );
  });

  it("agent claims node 0 (no dependencies)", async () => {
    node0Job = await claim(agentA, P1.pipeline, 0);
    const node = await de.account.pipelineNode.fetch(nodePda(P1.pipeline, 0));
    assert.deepEqual(node.status, { claimed: {} });
    assert.equal(node.agent.toBase58(), agentA.publicKey.toBase58());
    const stake = await br.account.agentStake.fetch(brStakePda(agentA.publicKey));
    assert.equal(stake.openJobs, 1);
  });

  it("agent cannot claim node 1 if node 0 is not Settled", async () => {
    await expectErr(claim(agentB, P1.pipeline, 1), "DependenciesNotMet");
  });

  it("agent cannot claim node 0 if tier is insufficient", async () => {
    const { pipeline } = await createPipeline(4, [
      { alloc: 10 * USDC, deadline: FAR, deps: 0, tier: 3 },
    ]);
    await expectErr(claim(agentLow, pipeline, 0), "TierInsufficient");
  });

  it("facilitator completes node 0, correct USDC to agent and fee to operator", async () => {
    const agentBefore = Number((await getAccount(connection, getAssociatedTokenAddressSync(mint, agentA.publicKey))).amount);
    const treBefore = Number((await getAccount(connection, operatorTreasury)).amount);

    await complete(P1.pipeline, 0, agentA.publicKey, node0Job, 1000);

    const agentAfter = Number((await getAccount(connection, getAssociatedTokenAddressSync(mint, agentA.publicKey))).amount);
    const treAfter = Number((await getAccount(connection, operatorTreasury)).amount);
    const fee = Math.floor((40 * USDC * FEE_BPS) / 10_000); // 0.08 USDC
    assert.equal(agentAfter - agentBefore, 40 * USDC - fee);
    assert.equal(treAfter - treBefore, fee);
  });

  it("reputation_bridge CPI fires on complete_node", async () => {
    const rep = await rb.account.agentReputation.fetch(rbRepPda(agentA.publicKey));
    assert.equal(rep.totalSettled, 1);
    assert.equal(rep.emaScore, 5000 + Math.floor((1000 * 2000) / 10000)); // 5200
  });

  it("node 0 settlement unlocks node 1 for claim", async () => {
    await claim(agentB, P1.pipeline, 1);
    const node = await de.account.pipelineNode.fetch(nodePda(P1.pipeline, 1));
    assert.deepEqual(node.status, { claimed: {} });
  });

  // ---- Expire / cascade / slash / failure on a separate pipeline P2 ----
  let P2: { pipeline: PublicKey; nodePdas: PublicKey[] };
  let consumerBeforeExpire: number;
  let stakeEBefore: number;

  it("expire_node: node 1 expires, refund cascades to consumer including downstream node 2", async () => {
    P2 = await createPipeline(2, [
      { alloc: 40 * USDC, deadline: FAR, deps: 0b000, tier: 1 },
      { alloc: 35 * USDC, deadline: SHORT, deps: 0b001, tier: 1 },
      { alloc: 25 * USDC, deadline: FAR, deps: 0b010, tier: 1 },
    ]);
    // settle node 0 so node 1 becomes claimable
    const j0 = await claim(agentD, P2.pipeline, 0);
    await complete(P2.pipeline, 0, agentD.publicKey, j0, 800);
    // claim node 1 (will be left to expire)
    const j1 = await claim(agentE, P2.pipeline, 1);

    stakeEBefore = (await br.account.agentStake.fetch(brStakePda(agentE.publicKey))).stakeAmount.toNumber();
    consumerBeforeExpire = Number((await getAccount(connection, consumerAta)).amount);

    // wait for node 1 deadline to pass
    const node1 = await de.account.pipelineNode.fetch(nodePda(P2.pipeline, 1));
    const deadline = node1.deadlineSlot.toNumber();
    while ((await connection.getSlot("confirmed")) <= deadline + 1) {
      await new Promise((r) => setTimeout(r, 400));
    }

    await de.methods
      .expireNode(1)
      .accountsPartial({
        pipelineConfig: pipelineConfigPda,
        pipeline: P2.pipeline,
        node: nodePda(P2.pipeline, 1),
        vault: getAssociatedTokenAddressSync(mint, P2.pipeline, true),
        stakeMint: mint,
        consumerTokenAccount: consumerAta,
        caller: facilitator.publicKey,
        dagAuthority: dagAuthPda,
        registryConfig: brConfigPda,
        agentStake: brStakePda(agentE.publicKey),
        agentStakeVault: brVault(agentE.publicKey),
        bondedRegistryProgram: br.programId,
        bridgeConfig: rbConfigPda,
        agentReputation: rbRepPda(agentE.publicKey),
        jobRecord: rbJobPda(j1),
        agent: agentE.publicKey,
        reputationBridgeProgram: rb.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: nodePda(P2.pipeline, 0), isWritable: true, isSigner: false },
        { pubkey: nodePda(P2.pipeline, 2), isWritable: true, isSigner: false },
      ])
      .signers([facilitator])
      .rpc();

    const node2 = await de.account.pipelineNode.fetch(nodePda(P2.pipeline, 2));
    assert.deepEqual(node2.status, { expired: {} }, "downstream node 2 cascaded to Expired");
    const consumerAfter = Number((await getAccount(connection, consumerAta)).amount);
    // refund = node1 (35) + node2 (25) = 60 USDC, plus slash penalty (15% of 10 = 1.5)
    const slash = Math.floor((stakeEBefore * 1500) / 10000);
    assert.equal(consumerAfter - consumerBeforeExpire, 60 * USDC + slash);
  });

  it("slash_stake CPI fires when Claimed node expires", async () => {
    const stake = await br.account.agentStake.fetch(brStakePda(agentE.publicKey));
    const slash = Math.floor((stakeEBefore * 1500) / 10000);
    assert.equal(stake.stakeAmount.toNumber(), stakeEBefore - slash);
    assert.equal(stake.totalSlashed, 1);
  });

  it("reputation_bridge failure_record CPI fires on expire_node", async () => {
    const rep = await rb.account.agentReputation.fetch(rbRepPda(agentE.publicKey));
    assert.equal(rep.totalFailed, 1);
    // one completion (node0 of P2, +800→0.2*800=160) then a failure (-1000)
  });

  it("cancel_pipeline refunds full vault when no nodes active", async () => {
    const { pipeline, nodePdas } = await createPipeline(5, [
      { alloc: 30 * USDC, deadline: FAR, deps: 0, tier: 1 },
      { alloc: 20 * USDC, deadline: FAR, deps: 0, tier: 1 },
    ]);
    const before = Number((await getAccount(connection, consumerAta)).amount);
    await de.methods
      .cancelPipeline()
      .accountsPartial({
        pipeline,
        consumer: consumer.publicKey,
        stakeMint: mint,
        vault: getAssociatedTokenAddressSync(mint, pipeline, true),
        consumerTokenAccount: consumerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(
        nodePdas.map((pk) => ({ pubkey: pk, isWritable: true, isSigner: false }))
      )
      .signers([consumer])
      .rpc();
    const after = Number((await getAccount(connection, consumerAta)).amount);
    assert.equal(after - before, 50 * USDC);
    const p = await de.account.pipeline.fetch(pipeline);
    assert.deepEqual(p.status, { cancelled: {} });
  });

  it("full 3-node pipeline settles, pipeline.status = Completed", async () => {
    // node 1 already claimed (agentB) in an earlier test; complete it.
    const node1 = await de.account.pipelineNode.fetch(nodePda(P1.pipeline, 1));
    await complete(P1.pipeline, 1, agentB.publicKey, Buffer.from(node1.jobId as number[]), 900);
    // node 2
    const j2 = await claim(agentC, P1.pipeline, 2);
    await complete(P1.pipeline, 2, agentC.publicKey, j2, 700);

    const p = await de.account.pipeline.fetch(P1.pipeline);
    assert.equal(p.nodesSettled, 3);
    assert.deepEqual(p.status, { completed: {} });
  });

  it("replay: job_id cannot be reused in reputation_bridge", async () => {
    // node 0 of P1 is Settled; re-completing it must fail, so its job_id can
    // never be recorded twice. The JobRecord PDA also already exists.
    await expectErr(
      complete(P1.pipeline, 0, agentA.publicKey, node0Job, 500),
      "NodeNotClaimed"
    );
    const jr = await rb.account.jobRecord.fetch(rbJobPda(node0Job));
    assert.deepEqual(jr.outcome, { settled: {} });
  });
});
