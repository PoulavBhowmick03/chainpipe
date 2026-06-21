use anchor_lang::prelude::*;

declare_id!("6RRfs1Ho1bJ3JWXSy3xVth4BTGHWwVwum74ph2LRWWsf");

/// Neutral starting reputation for a brand-new agent (50.00 on a 0–100 scale).
pub const INITIAL_EMA: u32 = 5000;
/// Fixed quality delta applied on a failed job (drives a 0.2-weighted -1000 hit).
pub const FAILURE_DELTA: i64 = -5000;
pub const EMA_MAX: i64 = 10_000;

#[program]
pub mod reputation_bridge {
    use super::*;

    /// One-time operator setup. `dag_escrow_authority` is the dag_escrow CPI
    /// signer PDA permitted to write reputation; `dag_escrow_program` is stored
    /// for reference / future ATOM upgrade path.
    pub fn initialize(
        ctx: Context<Initialize>,
        dag_escrow_program: Pubkey,
        dag_escrow_authority: Pubkey,
        ema_alpha_bps: u16,
    ) -> Result<()> {
        require!(ema_alpha_bps <= 10_000, BridgeError::InvalidAlpha);
        let cfg = &mut ctx.accounts.bridge_config;
        cfg.operator = ctx.accounts.operator.key();
        cfg.dag_escrow_program = dag_escrow_program;
        cfg.dag_escrow_authority = dag_escrow_authority;
        cfg.ema_alpha_bps = ema_alpha_bps;
        cfg.bump = ctx.bumps.bridge_config;
        cfg.version = BRIDGE_CONFIG_VERSION;
        cfg.pending_operator = Pubkey::default();
        Ok(())
    }

    /// Operator may update the authorized dag_escrow CPI signer (its PDA).
    pub fn set_dag_escrow_authority(
        ctx: Context<SetDagEscrowAuthority>,
        dag_escrow_authority: Pubkey,
    ) -> Result<()> {
        ctx.accounts.bridge_config.dag_escrow_authority = dag_escrow_authority;
        Ok(())
    }

    /// Two-step operator transfer (propose; successor must accept).
    pub fn propose_operator(ctx: Context<ProposeOperator>, new_operator: Pubkey) -> Result<()> {
        ctx.accounts.bridge_config.pending_operator = new_operator;
        Ok(())
    }

    pub fn accept_operator(ctx: Context<AcceptOperator>) -> Result<()> {
        let cfg = &mut ctx.accounts.bridge_config;
        require!(cfg.pending_operator != Pubkey::default(), BridgeError::NoPendingOperator);
        require!(
            ctx.accounts.new_operator.key() == cfg.pending_operator,
            BridgeError::NotPendingOperator
        );
        cfg.operator = cfg.pending_operator;
        cfg.pending_operator = Pubkey::default();
        Ok(())
    }

    /// One-time migration: grow a pre-hardening BridgeConfig and seed new fields.
    pub fn migrate_bridge_config(ctx: Context<MigrateBridgeConfig>) -> Result<()> {
        let cfg = &mut ctx.accounts.bridge_config;
        require!(cfg.version == 0, BridgeError::AlreadyMigrated);
        cfg.version = BRIDGE_CONFIG_VERSION;
        cfg.pending_operator = Pubkey::default();
        Ok(())
    }

    /// Record a settled job. Callable only by the dag_escrow authority PDA.
    pub fn record_completion(
        ctx: Context<RecordOutcome>,
        job_id: [u8; 32],
        score_delta: i16,
    ) -> Result<()> {
        gate(&ctx.accounts.bridge_config, &ctx.accounts.dag_authority)?;
        let slot = Clock::get()?.slot;
        let alpha = ctx.accounts.bridge_config.ema_alpha_bps as i64;

        let rep = &mut ctx.accounts.agent_reputation;
        init_rep_if_new(rep, ctx.accounts.agent.key(), ctx.bumps.agent_reputation);
        rep.ema_score = apply_ema(rep.ema_score, score_delta as i64, alpha);
        rep.total_settled = rep.total_settled.saturating_add(1);
        rep.last_job_id = job_id;
        rep.last_updated_slot = slot;

        let jr = &mut ctx.accounts.job_record;
        jr.job_id = job_id;
        jr.agent = ctx.accounts.agent.key();
        jr.outcome = JobOutcome::Settled;
        jr.score_delta = score_delta;
        jr.recorded_at_slot = slot;
        jr.bump = ctx.bumps.job_record;

        emit!(ReputationUpdated {
            agent: jr.agent,
            job_id,
            ema_score: rep.ema_score,
            total_settled: rep.total_settled,
        });
        Ok(())
    }

    /// Record a failed job. Callable only by the dag_escrow authority PDA.
    pub fn record_failure(ctx: Context<RecordOutcome>, job_id: [u8; 32]) -> Result<()> {
        gate(&ctx.accounts.bridge_config, &ctx.accounts.dag_authority)?;
        let slot = Clock::get()?.slot;
        let alpha = ctx.accounts.bridge_config.ema_alpha_bps as i64;

        let rep = &mut ctx.accounts.agent_reputation;
        init_rep_if_new(rep, ctx.accounts.agent.key(), ctx.bumps.agent_reputation);
        rep.ema_score = apply_ema(rep.ema_score, FAILURE_DELTA, alpha);
        rep.total_failed = rep.total_failed.saturating_add(1);
        rep.last_job_id = job_id;
        rep.last_updated_slot = slot;

        let jr = &mut ctx.accounts.job_record;
        jr.job_id = job_id;
        jr.agent = ctx.accounts.agent.key();
        jr.outcome = JobOutcome::Failed;
        jr.score_delta = FAILURE_DELTA as i16;
        jr.recorded_at_slot = slot;
        jr.bump = ctx.bumps.job_record;

        emit!(ReputationPenalized {
            agent: jr.agent,
            job_id,
            ema_score: rep.ema_score,
            total_failed: rep.total_failed,
        });
        Ok(())
    }
}

fn gate(cfg: &Account<BridgeConfig>, dag_authority: &Signer) -> Result<()> {
    require!(
        dag_authority.key() == cfg.dag_escrow_authority,
        BridgeError::UnauthorizedCaller
    );
    Ok(())
}

fn init_rep_if_new(rep: &mut Account<AgentReputation>, agent: Pubkey, bump: u8) {
    if rep.agent == Pubkey::default() {
        rep.agent = agent;
        rep.ema_score = INITIAL_EMA;
        rep.total_settled = 0;
        rep.total_failed = 0;
        rep.bump = bump;
    }
}

/// Additive EMA: new = clamp(old + alpha_bps * delta / 10000, 0, 10000).
fn apply_ema(old: u32, delta: i64, alpha_bps: i64) -> u32 {
    let adj = delta * alpha_bps / 10_000;
    let next = (old as i64 + adj).clamp(0, EMA_MAX);
    next as u32
}

#[account]
pub struct BridgeConfig {
    pub operator: Pubkey,
    pub dag_escrow_program: Pubkey,
    pub dag_escrow_authority: Pubkey,
    pub ema_alpha_bps: u16,
    pub bump: u8,
    // ── hardening (APPENDED; grown on live accounts via migrate_bridge_config) ──
    pub version: u8,
    pub pending_operator: Pubkey,
}
impl BridgeConfig {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 2 + 1 + 1 + 32;
}

pub const BRIDGE_CONFIG_VERSION: u8 = 1;

#[account]
pub struct AgentReputation {
    pub agent: Pubkey,
    pub ema_score: u32,
    pub total_settled: u32,
    pub total_failed: u32,
    pub last_job_id: [u8; 32],
    pub last_updated_slot: u64,
    pub bump: u8,
}
impl AgentReputation {
    pub const LEN: usize = 8 + 32 + 4 + 4 + 4 + 32 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum JobOutcome {
    Settled,
    Failed,
}

#[account]
pub struct JobRecord {
    pub job_id: [u8; 32],
    pub agent: Pubkey,
    pub outcome: JobOutcome,
    pub score_delta: i16,
    pub recorded_at_slot: u64,
    pub bump: u8,
}
impl JobRecord {
    pub const LEN: usize = 8 + 32 + 32 + 1 + 2 + 8 + 1;
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = operator,
        space = BridgeConfig::LEN,
        seeds = [b"bridge_config"],
        bump
    )]
    pub bridge_config: Account<'info, BridgeConfig>,
    #[account(mut)]
    pub operator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetDagEscrowAuthority<'info> {
    #[account(mut, seeds = [b"bridge_config"], bump = bridge_config.bump, has_one = operator)]
    pub bridge_config: Account<'info, BridgeConfig>,
    pub operator: Signer<'info>,
}

#[derive(Accounts)]
pub struct ProposeOperator<'info> {
    #[account(mut, seeds = [b"bridge_config"], bump = bridge_config.bump, has_one = operator)]
    pub bridge_config: Account<'info, BridgeConfig>,
    pub operator: Signer<'info>,
}

#[derive(Accounts)]
pub struct AcceptOperator<'info> {
    #[account(mut, seeds = [b"bridge_config"], bump = bridge_config.bump)]
    pub bridge_config: Account<'info, BridgeConfig>,
    pub new_operator: Signer<'info>,
}

#[derive(Accounts)]
pub struct MigrateBridgeConfig<'info> {
    #[account(
        mut,
        seeds = [b"bridge_config"],
        bump = bridge_config.bump,
        has_one = operator,
        realloc = BridgeConfig::LEN,
        realloc::payer = operator,
        realloc::zero = false
    )]
    pub bridge_config: Account<'info, BridgeConfig>,
    #[account(mut)]
    pub operator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(job_id: [u8; 32])]
pub struct RecordOutcome<'info> {
    #[account(seeds = [b"bridge_config"], bump = bridge_config.bump)]
    pub bridge_config: Account<'info, BridgeConfig>,
    #[account(
        init_if_needed,
        payer = payer,
        space = AgentReputation::LEN,
        seeds = [b"reputation", agent.key().as_ref()],
        bump
    )]
    pub agent_reputation: Account<'info, AgentReputation>,
    #[account(
        init,
        payer = payer,
        space = JobRecord::LEN,
        seeds = [b"job_record", job_id.as_ref()],
        bump
    )]
    pub job_record: Account<'info, JobRecord>,
    /// CHECK: agent identity used only as a PDA seed and stored reference.
    pub agent: UncheckedAccount<'info>,
    /// dag_escrow CPI signer PDA — verified against bridge_config.
    pub dag_authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct ReputationUpdated {
    pub agent: Pubkey,
    pub job_id: [u8; 32],
    pub ema_score: u32,
    pub total_settled: u32,
}

#[event]
pub struct ReputationPenalized {
    pub agent: Pubkey,
    pub job_id: [u8; 32],
    pub ema_score: u32,
    pub total_failed: u32,
}

#[error_code]
pub enum BridgeError {
    #[msg("Unauthorized: caller is not the dag_escrow authority")]
    UnauthorizedCaller,
    #[msg("EMA alpha bps exceeds 100%")]
    InvalidAlpha,
    #[msg("No pending operator to accept")]
    NoPendingOperator,
    #[msg("Signer is not the pending operator")]
    NotPendingOperator,
    #[msg("Config already migrated")]
    AlreadyMigrated,
}
