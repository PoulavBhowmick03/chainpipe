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
        pipelineConfig: pipelineConfigPda,
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
      .completeNode(idx, scoreDelta, Array(32).fill(0))
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

  // ---- optimistic settlement / dispute layer ----
  const settlementPda = (node: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("settlement"), node.toBuffer()], de.programId)[0];

  const enc96 = (s: string) => {
    const e = Buffer.from(s, "utf8"); const a = Array(96).fill(0); e.forEach((b, i) => (a[i] = b));
    return { bytes: a, len: e.length };
  };
  const TEST_URI = "ipfs://bafkreiproofofdeliverytesturi";
  const submitCompletion = (pipeline: PublicKey, idx: number, agent: PublicKey, scoreDelta: number, uri = TEST_URI) => {
    const { bytes, len } = enc96(uri);
    return de.methods.submitCompletion(idx, scoreDelta, Array(32).fill(7), bytes, len).accountsPartial({
      pipelineConfig: pipelineConfigPda, pipeline, node: nodePda(pipeline, idx), facilitator: facilitator.publicKey,
      agent, settlement: settlementPda(nodePda(pipeline, idx)), systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([facilitator]).rpc();
  };

  const finalizeNode = (pipeline: PublicKey, idx: number, agent: PublicKey) =>
    de.methods.finalizeNode(idx).accountsPartial({
      pipelineConfig: pipelineConfigPda, pipeline, node: nodePda(pipeline, idx), settlement: settlementPda(nodePda(pipeline, idx)),
      caller: facilitator.publicKey, vault: getAssociatedTokenAddressSync(mint, pipeline, true), stakeMint: mint, agent,
      agentTokenAccount: getAssociatedTokenAddressSync(mint, agent), operatorTreasury, dagAuthority: dagAuthPda,
      registryConfig: brConfigPda, agentStake: brStakePda(agent), bondedRegistryProgram: br.programId,
      bridgeConfig: rbConfigPda, agentReputation: rbRepPda(agent), jobRecord: rbJobPda(jobId(pipeline, idx)), reputationBridgeProgram: rb.programId,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([facilitator]).rpc();

  // job_id is on the node; read it lazily inside the helpers that need it.
  let _jobCache: Record<string, Buffer> = {};
  const jobId = (pipeline: PublicKey, idx: number) => _jobCache[`${pipeline.toBase58()}:${idx}`];
  const cacheJob = async (pipeline: PublicKey, idx: number) => {
    const n = await de.account.pipelineNode.fetch(nodePda(pipeline, idx));
    _jobCache[`${pipeline.toBase58()}:${idx}`] = Buffer.from(n.jobId as number[]);
  };

  let PD: { pipeline: PublicKey; nodePdas: PublicKey[] };
  let agentF: Keypair, agentG: Keypair;

  it("submit_completion moves a claimed node to Submitted (no payout yet)", async () => {
    agentF = await makeAgent(T1);
    agentG = await makeAgent(T1);
    PD = await createPipeline(7, [
      { alloc: 20 * USDC, deadline: FAR, deps: 0, tier: 1 },
      { alloc: 15 * USDC, deadline: FAR, deps: 0, tier: 1 },
    ]);
    await claim(agentF, PD.pipeline, 0);
    await cacheJob(PD.pipeline, 0);
    await submitCompletion(PD.pipeline, 0, agentF.publicKey, 1000);
    const node = await de.account.pipelineNode.fetch(nodePda(PD.pipeline, 0));
    assert.deepEqual(node.status, { submitted: {} });
    const s = await de.account.nodeSettlement.fetch(settlementPda(nodePda(PD.pipeline, 0)));
    assert.equal(s.disputed, false);
    // proof-of-delivery: uri + uri_len + result_hash round-trip on-chain
    assert.equal(s.uriLen, Buffer.from(TEST_URI, "utf8").length);
    assert.equal(Buffer.from((s.uri as number[]).slice(0, s.uriLen)).toString("utf8"), TEST_URI);
    assert.deepEqual(s.resultHash, Array(32).fill(7));
  });

  it("submit_completion rejects a uri_len exceeding the 96-byte buffer (InvalidUri)", async () => {
    const PX = await createPipeline(77, [{ alloc: 10 * USDC, deadline: FAR, deps: 0, tier: 1 }]);
    const a = await makeAgent(T1);
    await claim(a, PX.pipeline, 0);
    await expectErr(
      de.methods.submitCompletion(0, 0, Array(32).fill(1), Array(96).fill(1), 200).accountsPartial({
        pipelineConfig: pipelineConfigPda, pipeline: PX.pipeline, node: nodePda(PX.pipeline, 0), facilitator: facilitator.publicKey,
        agent: a.publicKey, settlement: settlementPda(nodePda(PX.pipeline, 0)), systemProgram: anchor.web3.SystemProgram.programId,
      }).signers([facilitator]).rpc(),
      "InvalidUri"
    );
  });

  it("finalize before the dispute window elapses fails", async () => {
    await expectErr(finalizeNode(PD.pipeline, 0, agentF.publicKey), "DisputeWindowOpen");
  });

  it("dispute within window → Disputed; resolve upheld refunds consumer + slashes agent", async () => {
    await claim(agentG, PD.pipeline, 1);
    await cacheJob(PD.pipeline, 1);
    await submitCompletion(PD.pipeline, 1, agentG.publicKey, 800);
    await de.methods.disputeNode(1, Array(32).fill(3), 0).accountsPartial({
      pipeline: PD.pipeline, node: nodePda(PD.pipeline, 1), settlement: settlementPda(nodePda(PD.pipeline, 1)), consumer: consumer.publicKey,
    }).signers([consumer]).rpc();
    let node = await de.account.pipelineNode.fetch(nodePda(PD.pipeline, 1));
    assert.deepEqual(node.status, { disputed: {} });

    const stakeBefore = (await br.account.agentStake.fetch(brStakePda(agentG.publicKey))).stakeAmount.toNumber();
    const consumerBefore = Number((await getAccount(connection, consumerAta)).amount);
    await de.methods.resolveDispute(1, true).accountsPartial({
      pipelineConfig: pipelineConfigPda, pipeline: PD.pipeline, node: nodePda(PD.pipeline, 1), settlement: settlementPda(nodePda(PD.pipeline, 1)),
      facilitator: facilitator.publicKey, vault: getAssociatedTokenAddressSync(mint, PD.pipeline, true), stakeMint: mint, agent: agentG.publicKey,
      agentTokenAccount: getAssociatedTokenAddressSync(mint, agentG.publicKey), operatorTreasury, consumerTokenAccount: consumerAta,
      dagAuthority: dagAuthPda, registryConfig: brConfigPda, agentStake: brStakePda(agentG.publicKey), agentStakeVault: brVault(agentG.publicKey),
      bondedRegistryProgram: br.programId, bridgeConfig: rbConfigPda, agentReputation: rbRepPda(agentG.publicKey), jobRecord: rbJobPda(jobId(PD.pipeline, 1)),
      reputationBridgeProgram: rb.programId, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([facilitator]).rpc();

    node = await de.account.pipelineNode.fetch(nodePda(PD.pipeline, 1));
    assert.deepEqual(node.status, { expired: {} });
    const stakeAfter = (await br.account.agentStake.fetch(brStakePda(agentG.publicKey))).stakeAmount.toNumber();
    assert.ok(stakeAfter < stakeBefore, "agent slashed");
    const consumerAfter = Number((await getAccount(connection, consumerAta)).amount);
    assert.ok(consumerAfter > consumerBefore, "consumer refunded + slash");
    const repG = await rb.account.agentReputation.fetch(rbRepPda(agentG.publicKey));
    assert.equal(repG.totalFailed, 1);
  });

  it("finalize after the window settles + pays the agent", async () => {
    const s = await de.account.nodeSettlement.fetch(settlementPda(nodePda(PD.pipeline, 0)));
    const ready = s.submittedAtSlot.toNumber() + 152;
    while ((await connection.getSlot("confirmed")) < ready) await new Promise((r) => setTimeout(r, 500));
    const before = Number((await getAccount(connection, getAssociatedTokenAddressSync(mint, agentF.publicKey))).amount);
    await finalizeNode(PD.pipeline, 0, agentF.publicKey);
    const after = Number((await getAccount(connection, getAssociatedTokenAddressSync(mint, agentF.publicKey))).amount);
    const fee = Math.floor((20 * USDC * FEE_BPS) / 10_000);
    assert.equal(after - before, 20 * USDC - fee);
    const node = await de.account.pipelineNode.fetch(nodePda(PD.pipeline, 0));
    assert.deepEqual(node.status, { settled: {} });
    const repF = await rb.account.agentReputation.fetch(rbRepPda(agentF.publicKey));
    assert.equal(repF.totalSettled, 1);
  });

  it("frivolous dispute → resolve upheld=false pays the agent + records completion", async () => {
    const agentH = await makeAgent(T1);
    const PH = await createPipeline(88, [{ alloc: 30 * USDC, deadline: FAR, deps: 0, tier: 1 }]);
    await claim(agentH, PH.pipeline, 0);
    await cacheJob(PH.pipeline, 0);
    await submitCompletion(PH.pipeline, 0, agentH.publicKey, 900);
    // consumer disputes (claims incorrect output — reason_code 2, subjective)
    await de.methods.disputeNode(0, Array(32).fill(9), 2).accountsPartial({
      pipeline: PH.pipeline, node: nodePda(PH.pipeline, 0), settlement: settlementPda(nodePda(PH.pipeline, 0)), consumer: consumer.publicKey,
    }).signers([consumer]).rpc();
    assert.deepEqual((await de.account.pipelineNode.fetch(nodePda(PH.pipeline, 0))).status, { disputed: {} });

    const agentAta = getAssociatedTokenAddressSync(mint, agentH.publicKey);
    const before = Number((await getAccount(connection, agentAta)).amount);
    // arbiter rejects the dispute (upheld=false): node settles, agent paid
    await de.methods.resolveDispute(0, false).accountsPartial({
      pipelineConfig: pipelineConfigPda, pipeline: PH.pipeline, node: nodePda(PH.pipeline, 0), settlement: settlementPda(nodePda(PH.pipeline, 0)),
      facilitator: facilitator.publicKey, vault: getAssociatedTokenAddressSync(mint, PH.pipeline, true), stakeMint: mint, agent: agentH.publicKey,
      agentTokenAccount: agentAta, operatorTreasury, consumerTokenAccount: consumerAta,
      dagAuthority: dagAuthPda, registryConfig: brConfigPda, agentStake: brStakePda(agentH.publicKey), agentStakeVault: brVault(agentH.publicKey),
      bondedRegistryProgram: br.programId, bridgeConfig: rbConfigPda, agentReputation: rbRepPda(agentH.publicKey), jobRecord: rbJobPda(jobId(PH.pipeline, 0)),
      reputationBridgeProgram: rb.programId, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([facilitator]).rpc();

    const after = Number((await getAccount(connection, agentAta)).amount);
    const fee = Math.floor((30 * USDC * FEE_BPS) / 10_000);
    assert.equal(after - before, 30 * USDC - fee, "agent paid alloc - fee");
    assert.deepEqual((await de.account.pipelineNode.fetch(nodePda(PH.pipeline, 0))).status, { settled: {} });
    assert.equal((await rb.account.agentReputation.fetch(rbRepPda(agentH.publicKey))).totalSettled, 1);
  });

  // ───────────────────────── Phase 15: production hardening ─────────────────────────
  it("migrate_pipeline_config rejects when already migrated (fresh init = v1)", async () => {
    await expectErr(
      de.methods.migratePipelineConfig().accountsPartial({ pipelineConfig: pipelineConfigPda, operator: payer.publicKey }).rpc(),
      "AlreadyMigrated"
    );
  });

  it("set_dispute_window: bounds enforced + snapshotted per submission", async () => {
    await expectErr(de.methods.setDisputeWindow(new anchor.BN(0)).accountsPartial({ pipelineConfig: pipelineConfigPda, operator: payer.publicKey }).rpc(), "InvalidDisputeWindow");
    await de.methods.setDisputeWindow(new anchor.BN(300)).accountsPartial({ pipelineConfig: pipelineConfigPda, operator: payer.publicKey }).rpc();
    const ag = await makeAgent(T1);
    const PW = await createPipeline(91, [{ alloc: 10 * USDC, deadline: FAR, deps: 0, tier: 1 }]);
    await claim(ag, PW.pipeline, 0);
    await submitCompletion(PW.pipeline, 0, ag.publicKey, 100);
    const s = await de.account.nodeSettlement.fetch(settlementPda(nodePda(PW.pipeline, 0)));
    assert.equal(s.disputeSlots.toNumber(), 300, "window snapshotted from config at submit");
    // restore default so later/again runs are unaffected
    await de.methods.setDisputeWindow(new anchor.BN(150)).accountsPartial({ pipelineConfig: pipelineConfigPda, operator: payer.publicKey }).rpc();
    const s2 = await de.account.pipelineConfig.fetch(pipelineConfigPda);
    assert.equal(s2.disputeSlots.toNumber(), 150);
    // in-flight node keeps its 300 snapshot even after the config changed
    const s3 = await de.account.nodeSettlement.fetch(settlementPda(nodePda(PW.pipeline, 0)));
    assert.equal(s3.disputeSlots.toNumber(), 300, "in-flight window immutable");
  });

  it("set_paused blocks create_pipeline; unpause restores", async () => {
    await de.methods.setPaused(true).accountsPartial({ pipelineConfig: pipelineConfigPda, operator: payer.publicKey }).rpc();
    await expectErr(createPipeline(92, [{ alloc: 10 * USDC, deadline: FAR, deps: 0, tier: 1 }]), "Paused");
    await de.methods.setPaused(false).accountsPartial({ pipelineConfig: pipelineConfigPda, operator: payer.publicKey }).rpc();
    const ok = await createPipeline(93, [{ alloc: 10 * USDC, deadline: FAR, deps: 0, tier: 1 }]);
    assert.ok(ok.pipeline, "create works again after unpause");
  });

  it("two-step operator transfer: propose → accept (round-trip, state restored)", async () => {
    const next = Keypair.generate();
    await expectErr(de.methods.acceptOperator().accountsPartial({ pipelineConfig: pipelineConfigPda, newOperator: payer.publicKey }).rpc(), "NoPendingOperator");
    await de.methods.proposeOperator(next.publicKey).accountsPartial({ pipelineConfig: pipelineConfigPda, operator: payer.publicKey }).rpc();
    // wrong signer can't accept
    const wrong = Keypair.generate();
    await expectErr(de.methods.acceptOperator().accountsPartial({ pipelineConfig: pipelineConfigPda, newOperator: wrong.publicKey }).signers([wrong]).rpc(), "NotPendingOperator");
    await de.methods.acceptOperator().accountsPartial({ pipelineConfig: pipelineConfigPda, newOperator: next.publicKey }).signers([next]).rpc();
    assert.equal((await de.account.pipelineConfig.fetch(pipelineConfigPda)).operator.toBase58(), next.publicKey.toBase58());
    // transfer back so the rest of the suite keeps its operator
    await de.methods.proposeOperator(payer.publicKey).accountsPartial({ pipelineConfig: pipelineConfigPda, operator: next.publicKey }).signers([next]).rpc();
    await de.methods.acceptOperator().accountsPartial({ pipelineConfig: pipelineConfigPda, newOperator: payer.publicKey }).rpc();
    assert.equal((await de.account.pipelineConfig.fetch(pipelineConfigPda)).operator.toBase58(), payer.publicKey.toBase58());
  });
});
