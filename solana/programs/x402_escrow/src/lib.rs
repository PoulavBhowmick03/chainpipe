//! x402Escrow — Anchor Solana implementation of the `x402_escrow`.
//!
//! Account model:
//! - SPL token transfer into the contract → SPL `transfer` into a per-job vault
//!   token account whose authority is the `Job` PDA.
//! - escrow `lock()` / `release()` by operator → `create_job` / `complete_job`,
//!   gated on `EscrowConfig.operator` (the single facilitator, v1).
//! - `Job` struct                                → one PDA per job
//!   (seeds = [b"job", consumer, job_id.to_le_bytes()]).
//! - facilitator fee (bps)                        → `EscrowConfig.fee_bps`, split on release.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("Ec48mwadrna8FC5rJ24K5R5fMVCBFBzhbbeFkf6skiYq");

pub const FEE_DENOMINATOR: u64 = 10_000;

#[program]
pub mod x402_escrow {
    use super::*;

    /// One-time escrow setup. `operator` is the single facilitator allowed to
    /// release/refund; `fee_bps` is the settlement fee (e.g. 20 = 0.2%).
    pub fn initialize(ctx: Context<Initialize>, operator: Pubkey, fee_bps: u16) -> Result<()> {
        require!(fee_bps as u64 <= FEE_DENOMINATOR, EscrowError::FeeTooHigh);
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.operator = operator;
        cfg.fee_bps = fee_bps;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    /// Consumer locks `amount` of the payment token into a per-job vault.
    pub fn create_job(
        ctx: Context<CreateJob>,
        job_id: u64,
        skill_id: u64,
        provider: Pubkey,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, EscrowError::ZeroAmount);
        require!(
            provider != ctx.accounts.consumer.key(),
            EscrowError::SelfDealing
        );

        let job = &mut ctx.accounts.job;
        job.job_id = job_id;
        job.skill_id = skill_id;
        job.consumer = ctx.accounts.consumer.key();
        job.provider = provider;
        job.payment_mint = ctx.accounts.payment_mint.key();
        job.vault = ctx.accounts.vault.key();
        job.amount = amount;
        job.state = JobState::Locked;
        job.bump = ctx.bumps.job;

        // Pull funds: consumer ATA → vault (consumer signs).
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.consumer_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.consumer.to_account_info(),
                },
            ),
            amount,
        )?;
        Ok(())
    }

    /// Operator releases the vault: payout → provider, fee → operator.
    pub fn complete_job(ctx: Context<SettleJob>, job_id: u64) -> Result<()> {
        require!(
            ctx.accounts.job.state == JobState::Locked,
            EscrowError::JobNotLocked
        );

        let amount = ctx.accounts.job.amount;
        let fee = amount
            .checked_mul(ctx.accounts.config.fee_bps as u64)
            .unwrap()
            / FEE_DENOMINATOR;
        let payout = amount.checked_sub(fee).unwrap();

        let consumer_key = ctx.accounts.consumer.key();
        let job_id_bytes = job_id.to_le_bytes();
        let bump = ctx.accounts.job.bump;
        let seeds: &[&[u8]] = &[b"job", consumer_key.as_ref(), job_id_bytes.as_ref(), &[bump]];
        let signer: &[&[&[u8]]] = &[seeds];

        // payout → provider
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.provider_token.to_account_info(),
                    authority: ctx.accounts.job.to_account_info(),
                },
                signer,
            ),
            payout,
        )?;

        // fee → operator
        if fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.operator_token.to_account_info(),
                        authority: ctx.accounts.job.to_account_info(),
                    },
                    signer,
                ),
                fee,
            )?;
        }

        ctx.accounts.job.state = JobState::Completed;
        Ok(())
    }

    /// Operator refunds the consumer (job failed / cancelled).
    pub fn refund_job(ctx: Context<RefundJob>, job_id: u64) -> Result<()> {
        require!(
            ctx.accounts.job.state == JobState::Locked,
            EscrowError::JobNotLocked
        );

        let amount = ctx.accounts.job.amount;
        let consumer_key = ctx.accounts.consumer.key();
        let job_id_bytes = job_id.to_le_bytes();
        let bump = ctx.accounts.job.bump;
        let seeds: &[&[u8]] = &[b"job", consumer_key.as_ref(), job_id_bytes.as_ref(), &[bump]];
        let signer: &[&[&[u8]]] = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.consumer_token.to_account_info(),
                    authority: ctx.accounts.job.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        ctx.accounts.job.state = JobState::Refunded;
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
    pub vault: Pubkey,
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

#[derive(Accounts)]
#[instruction(job_id: u64)]
pub struct CreateJob<'info> {
    #[account(
        init,
        payer = consumer,
        space = 8 + Job::INIT_SPACE,
        seeds = [b"job", consumer.key().as_ref(), job_id.to_le_bytes().as_ref()],
        bump
    )]
    pub job: Account<'info, Job>,
    // Vault is created by the client (token account owned by the job PDA, of the
    // payment mint). The program only validates it — avoids anchor-spl's token-account
    // init constraint, which pulls the token-2022/zk feature tree.
    #[account(
        mut,
        constraint = vault.mint == payment_mint.key() @ EscrowError::MintMismatch,
        constraint = vault.owner == job.key() @ EscrowError::WrongOwner
    )]
    pub vault: Account<'info, TokenAccount>,
    pub payment_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = consumer_token.mint == payment_mint.key() @ EscrowError::MintMismatch,
        constraint = consumer_token.owner == consumer.key() @ EscrowError::WrongOwner
    )]
    pub consumer_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub consumer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(job_id: u64)]
pub struct SettleJob<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, EscrowConfig>,
    #[account(
        mut,
        seeds = [b"job", consumer.key().as_ref(), job_id.to_le_bytes().as_ref()],
        bump = job.bump,
        has_one = provider @ EscrowError::WrongProvider
    )]
    pub job: Account<'info, Job>,
    #[account(mut, constraint = vault.key() == job.vault @ EscrowError::WrongVault)]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: only used to re-derive the job PDA seeds; not read or written.
    pub consumer: UncheckedAccount<'info>,
    /// CHECK: provider pubkey is validated via `has_one` on `job`.
    pub provider: UncheckedAccount<'info>,
    #[account(mut, constraint = provider_token.owner == job.provider @ EscrowError::WrongOwner)]
    pub provider_token: Account<'info, TokenAccount>,
    #[account(mut, constraint = operator_token.owner == config.operator @ EscrowError::WrongOwner)]
    pub operator_token: Account<'info, TokenAccount>,
    #[account(constraint = operator.key() == config.operator @ EscrowError::NotOperator)]
    pub operator: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(job_id: u64)]
pub struct RefundJob<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, EscrowConfig>,
    #[account(
        mut,
        seeds = [b"job", consumer.key().as_ref(), job_id.to_le_bytes().as_ref()],
        bump = job.bump
    )]
    pub job: Account<'info, Job>,
    #[account(mut, constraint = vault.key() == job.vault @ EscrowError::WrongVault)]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: only used to re-derive the job PDA seeds.
    pub consumer: UncheckedAccount<'info>,
    #[account(mut, constraint = consumer_token.owner == job.consumer @ EscrowError::WrongOwner)]
    pub consumer_token: Account<'info, TokenAccount>,
    #[account(constraint = operator.key() == config.operator @ EscrowError::NotOperator)]
    pub operator: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum EscrowError {
    #[msg("Fee exceeds 100%")]
    FeeTooHigh,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Only the configured operator may call this")]
    NotOperator,
    #[msg("Job is not in the Locked state")]
    JobNotLocked,
    #[msg("Provider must differ from consumer")]
    SelfDealing,
    #[msg("Token account mint mismatch")]
    MintMismatch,
    #[msg("Token account owner mismatch")]
    WrongOwner,
    #[msg("Provider does not match the job")]
    WrongProvider,
    #[msg("Vault does not match the job")]
    WrongVault,
}
