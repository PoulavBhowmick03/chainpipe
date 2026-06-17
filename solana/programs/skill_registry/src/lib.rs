//! SkillRegistry — Anchor port of the EVM `SkillRegistry.sol`.
//!
//! EVM → Solana mapping:
//! - `mapping(uint256 => Skill)`        → one PDA `Skill` account per skillId
//!   (seeds = [b"skill", skill_id.to_le_bytes()])
//! - `owner` (Ownable)                  → `RegistryConfig.authority`
//! - allowed-facilitator set            → `RegistryConfig.facilitator` (single op for v1)
//! - local reputation (totalJobs/score) → fields on the `Skill` PDA
//! - external ERC-8004 identity call     → omitted on Solana (no canonical registry);
//!   reputation is local-only, matching the Celo graceful-fallback behaviour.
//!
//! NOTE: this is the scaffold (task #5). Instruction bodies beyond `initialize`
//! are implemented in task #6.

use anchor_lang::prelude::*;

declare_id!("26Xf7wEPJbG6EJ5kfAXbkot75ekSWdvpJH2rws1DEaEF");

pub const MAX_ENDPOINT_LEN: usize = 200;

#[program]
pub mod skill_registry {
    use super::*;

    /// One-time registry setup. `authority` is the registry owner; `facilitator`
    /// is the single operator allowed to record job completions (v1 trust model).
    pub fn initialize(ctx: Context<Initialize>, facilitator: Pubkey) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.facilitator = facilitator;
        cfg.skill_count = 0;
        cfg.paused = false;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }
}

/// Global registry config PDA (seeds = [b"config"]).
#[account]
#[derive(InitSpace)]
pub struct RegistryConfig {
    pub authority: Pubkey,
    pub facilitator: Pubkey,
    pub skill_count: u64,
    pub paused: bool,
    pub bump: u8,
}

/// One PDA per registered skill (seeds = [b"skill", skill_id.to_le_bytes()]).
#[account]
#[derive(InitSpace)]
pub struct Skill {
    pub skill_id: u64,
    pub provider: Pubkey,
    pub payment_mint: Pubkey,
    pub price_per_call: u64,
    pub total_jobs: u64,
    pub score: u64,
    pub active: bool,
    #[max_len(MAX_ENDPOINT_LEN)]
    pub endpoint: String,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + RegistryConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, RegistryConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum RegistryError {
    #[msg("Registry is paused")]
    Paused,
    #[msg("Only the configured facilitator may call this")]
    NotFacilitator,
    #[msg("Skill is not active")]
    SkillInactive,
    #[msg("Endpoint string too long")]
    EndpointTooLong,
}
