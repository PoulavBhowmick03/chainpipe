//! x402Escrow — Anchor port of the EVM `x402Escrow.sol`.
//!
//! EVM → Solana mapping:
//! - ERC-20 `transferFrom` into the contract → SPL `transfer` into a per-job vault
//!   token account owned by a PDA (seeds = [b"vault", job pda]).
//! - escrow `lock()` / `release()` by operator → `create_job` / `complete_job`,
//!   gated on `EscrowConfig.operator` (the single facilitator, v1).
//! - `Job` struct mapping                       → one PDA `Job` account per escrow job
//!   (seeds = [b"job", consumer, job_id.to_le_bytes()]).
//! - facilitator fee (bps)                       → `EscrowConfig.fee_bps`, split on release.
//!
//! NOTE: scaffold (task #5). `create_job` / `complete_job` / `refund` bodies and the
//! SPL CPI transfers are implemented in task #6.

use anchor_lang::prelude::*;

declare_id!("Ec48mwadrna8FC5rJ24K5R5fMVCBFBzhbbeFkf6skiYq");

#[program]
pub mod x402_escrow {
    use super::*;

    /// One-time escrow setup. `operator` is the single facilitator allowed to
    /// release/refund escrowed funds; `fee_bps` is the settlement fee (e.g. 20 = 0.2%).
    pub fn initialize(ctx: Context<Initialize>, operator: Pubkey, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= 10_000, EscrowError::FeeTooHigh);
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.operator = operator;
        cfg.fee_bps = fee_bps;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct EscrowConfig {
    pub authority: Pubkey,
    pub operator: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
}

/// Per-job escrow state PDA (seeds = [b"job", consumer, job_id.to_le_bytes()]).
#[account]
#[derive(InitSpace)]
pub struct Job {
    pub job_id: u64,
    pub skill_id: u64,
    pub consumer: Pubkey,
    pub provider: Pubkey,
    pub payment_mint: Pubkey,
    pub amount: u64,
    pub state: JobState,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum JobState {
    Locked,
    Completed,
    Refunded,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + EscrowConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, EscrowConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum EscrowError {
    #[msg("Fee exceeds 100%")]
    FeeTooHigh,
    #[msg("Only the configured operator may call this")]
    NotOperator,
    #[msg("Job is not in the Locked state")]
    JobNotLocked,
    #[msg("Provider must differ from consumer")]
    SelfDealing,
}
