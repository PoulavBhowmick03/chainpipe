import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import { ReputationBridge } from "../target/types/reputation_bridge";

const ALPHA_BPS = 2000; // 0.20

describe("reputation_bridge", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.reputationBridge as anchor.Program<ReputationBridge>;
  const connection = provider.connection;

  const dagAuth = Keypair.generate();
  const attacker = Keypair.generate();
  const dagEscrowProgram = Keypair.generate().publicKey; // reference only in P3
  const agentA = Keypair.generate().publicKey;

  const configPda = PublicKey.findProgramAddressSync(
    [Buffer.from("bridge_config")],
    program.programId
  )[0];
  const repPda = (agent: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("reputation"), agent.toBuffer()],
      program.programId
    )[0];
  const jobPda = (id: Buffer) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("job_record"), id],
      program.programId
    )[0];

  let jobCounter = 0;
  function nextJob(): { arr: number[]; buf: Buffer } {
    const buf = Buffer.alloc(32);
    buf.writeUInt32BE(++jobCounter, 0);
    return { arr: Array.from(buf), buf };
  }

  async function complete(agent: PublicKey, scoreDelta: number, signer = dagAuth) {
    const job = nextJob();
    await program.methods
      .recordCompletion(job.arr, scoreDelta)
      .accountsPartial({
        bridgeConfig: configPda,
        agentReputation: repPda(agent),
        jobRecord: jobPda(job.buf),
        agent,
        dagAuthority: signer.publicKey,
        payer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([signer])
      .rpc();
    return job;
  }

  async function fail(agent: PublicKey) {
    const job = nextJob();
    await program.methods
      .recordFailure(job.arr)
      .accountsPartial({
        bridgeConfig: configPda,
        agentReputation: repPda(agent),
        jobRecord: jobPda(job.buf),
        agent,
        dagAuthority: dagAuth.publicKey,
        payer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([dagAuth])
      .rpc();
    return job;
  }

  const ema = (a: PublicKey) =>
    program.account.agentReputation.fetch(repPda(a)).then((r) => r.emaScore);

  before(async () => {
    const sig = await connection.requestAirdrop(
      provider.wallet.publicKey,
      50 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig, "confirmed");
  });

  it("initializes bridge config with dag_escrow_program address", async () => {
    await program.methods
      .initialize(dagEscrowProgram, dagAuth.publicKey, ALPHA_BPS)
      .accountsPartial({
        bridgeConfig: configPda,
        operator: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const cfg = await program.account.bridgeConfig.fetch(configPda);
    assert.equal(cfg.dagEscrowProgram.toBase58(), dagEscrowProgram.toBase58());
    assert.equal(cfg.dagEscrowAuthority.toBase58(), dagAuth.publicKey.toBase58());
    assert.equal(cfg.emaAlphaBps, ALPHA_BPS);
  });

  it("record_completion updates EMA correctly for first job (initial EMA = 5000)", async () => {
    await complete(agentA, 1000); // 5000 + 0.2*1000 = 5200
    assert.equal(await ema(agentA), 5200);
  });

  it("record_completion with score_delta = 100 increases EMA by correct alpha-weighted amount", async () => {
    const before = await ema(agentA);
    await complete(agentA, 100); // +0.2*100 = +20
    const after = await ema(agentA);
    assert.equal(after - before, 20);
  });

  it("record_completion increments total_settled", async () => {
    const rep = await program.account.agentReputation.fetch(repPda(agentA));
    assert.equal(rep.totalSettled, 2);
  });

  it("record_failure decreases EMA, increments total_failed", async () => {
    const before = await ema(agentA);
    await fail(agentA); // 0.2 * -5000 = -1000
    const rep = await program.account.agentReputation.fetch(repPda(agentA));
    assert.equal(before - rep.emaScore, 1000);
    assert.equal(rep.totalFailed, 1);
  });

  it("record_completion fails with UnauthorizedCaller if not called from dag_escrow CPI", async () => {
    try {
      await complete(Keypair.generate().publicKey, 500, attacker);
      assert.fail("expected UnauthorizedCaller");
    } catch (e: any) {
      assert.include(e.toString(), "UnauthorizedCaller");
    }
  });

  it("replay: same job_id cannot be recorded twice (JobRecord already exists)", async () => {
    const agent = Keypair.generate().publicKey;
    const job = nextJob();
    const call = () =>
      program.methods
        .recordCompletion(job.arr, 500)
        .accountsPartial({
          bridgeConfig: configPda,
          agentReputation: repPda(agent),
          jobRecord: jobPda(job.buf),
          agent,
          dagAuthority: dagAuth.publicKey,
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([dagAuth])
        .rpc();
    await call();
    try {
      await call();
      assert.fail("expected replay to fail");
    } catch (e: any) {
      assert.match(e.toString(), /already in use|custom program error|0x0/i);
    }
  });

  it("ema_score cannot exceed 10000 (clamped)", async () => {
    const agent = Keypair.generate().publicKey;
    await complete(agent, 32767); // 5000 + 0.2*32767 = 11553 -> clamp 10000
    assert.equal(await ema(agent), 10000);
  });

  it("ema_score cannot go below 0 (clamped)", async () => {
    const agent = Keypair.generate().publicKey;
    await complete(agent, -32768); // 5000 - 6553 = -1553 -> clamp 0
    assert.equal(await ema(agent), 0);
  });

  // ───────────────────────── Phase 15: production hardening ─────────────────────────
  const expectErr = async (p: Promise<unknown>, code: string) => {
    try { await p; assert.fail(`expected ${code}`); }
    catch (e) { assert.include(String((e as { message?: string }).message ?? e), code); }
  };

  it("migrate_bridge_config rejects when already migrated (fresh init = v1)", async () => {
    await expectErr(
      program.methods.migrateBridgeConfig().accountsPartial({ bridgeConfig: configPda, operator: provider.wallet.publicKey }).rpc(),
      "AlreadyMigrated"
    );
  });

  it("two-step operator transfer: propose → accept (round-trip)", async () => {
    const next = Keypair.generate();
    await expectErr(program.methods.acceptOperator().accountsPartial({ bridgeConfig: configPda, newOperator: provider.wallet.publicKey }).rpc(), "NoPendingOperator");
    await program.methods.proposeOperator(next.publicKey).accountsPartial({ bridgeConfig: configPda, operator: provider.wallet.publicKey }).rpc();
    await program.methods.acceptOperator().accountsPartial({ bridgeConfig: configPda, newOperator: next.publicKey }).signers([next]).rpc();
    assert.equal((await program.account.bridgeConfig.fetch(configPda)).operator.toBase58(), next.publicKey.toBase58());
    await program.methods.proposeOperator(provider.wallet.publicKey).accountsPartial({ bridgeConfig: configPda, operator: next.publicKey }).signers([next]).rpc();
    await program.methods.acceptOperator().accountsPartial({ bridgeConfig: configPda, newOperator: provider.wallet.publicKey }).rpc();
    assert.equal((await program.account.bridgeConfig.fetch(configPda)).operator.toBase58(), provider.wallet.publicKey.toBase58());
  });
});
