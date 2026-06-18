//! SkillRegistry — Anchor Solana implementation of the `skill_registry`.
//!
//! Account model:
//! - `mapping(uint256 => Skill)`        → one PDA `Skill` account per skill_id
//!   (seeds = [b"skill", skill_id.to_le_bytes()])
//! - `owner` (PDA authority)                  → `RegistryConfig.authority`
//! - allowed-facilitator set            → `RegistryConfig.facilitator` (single op, v1)
//! - local reputation (totalJobs/score) → fields on the `Skill` PDA
//! - external on-chain reputation identity call     → omitted (no canonical registry on Solana);
//!   reputation is local-only, matching the Celo graceful-fallback behaviour.

use anchor_lang::prelude::*;

declare_id!("26Xf7wEPJbG6EJ5kfAXbkot75ekSWdvpJH2rws1DEaEF");

pub const MAX_ENDPOINT_LEN: usize = 200;

#[program]
pub mod skill_registry {
    use super::*;

    /// One-time registry setup. `authority` owns the registry; `facilitator` is the
    /// single operator allowed to record job completions (v1 trust model).
    pub fn initialize(ctx: Context<Initialize>, facilitator: Pubkey) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.facilitator = facilitator;
        cfg.skill_count = 0;
        cfg.paused = false;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    /// Register a skill. Caller is the provider; one `Skill` PDA per skill_id.
    pub fn register_skill(
        ctx: Context<RegisterSkill>,
        skill_id: u64,
        payment_mint: Pubkey,
        price_per_call: u64,
        endpoint: String,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, RegistryError::Paused);
        require!(
            endpoint.len() <= MAX_ENDPOINT_LEN,
            RegistryError::EndpointTooLong
        );

        let skill = &mut ctx.accounts.skill;
        skill.skill_id = skill_id;
        skill.provider = ctx.accounts.provider.key();
        skill.payment_mint = payment_mint;
        skill.price_per_call = price_per_call;
        skill.total_jobs = 0;
        skill.score = 0;
        skill.active = true;
        skill.endpoint = endpoint;
        skill.bump = ctx.bumps.skill;

        let cfg = &mut ctx.accounts.config;
        cfg.skill_count = cfg.skill_count.checked_add(1).unwrap();
        Ok(())
    }

    /// Update endpoint / price. Only the skill's provider.
    pub fn update_skill(
        ctx: Context<UpdateSkill>,
        price_per_call: u64,
        endpoint: String,
    ) -> Result<()> {
        require!(
            endpoint.len() <= MAX_ENDPOINT_LEN,
            RegistryError::EndpointTooLong
        );
        let skill = &mut ctx.accounts.skill;
        skill.price_per_call = price_per_call;
        skill.endpoint = endpoint;
        Ok(())
    }

    /// Activate / deactivate a skill. Only the provider.
    pub fn set_active(ctx: Context<UpdateSkill>, active: bool) -> Result<()> {
        ctx.accounts.skill.active = active;
        Ok(())
    }

    /// Record a settled job for a skill. Only the configured facilitator. Mirrors the
    /// Solana `recordJobCompletion`: bumps total_jobs and adds a score delta.
    pub fn record_job_completion(ctx: Context<RecordJob>, score_delta: u64) -> Result<()> {
        require!(!ctx.accounts.config.paused, RegistryError::Paused);
        require!(ctx.accounts.skill.active, RegistryError::SkillInactive);
        let skill = &mut ctx.accounts.skill;
        skill.total_jobs = skill.total_jobs.checked_add(1).unwrap();
        skill.score = skill.score.checked_add(score_delta).unwrap();
        Ok(())
    }

    /// Pause / unpause registration + job recording. Only the authority.
    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
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

#[derive(Accounts)]
#[instruction(skill_id: u64)]
pub struct RegisterSkill<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, RegistryConfig>,
    #[account(
        init,
        payer = provider,
        space = 8 + Skill::INIT_SPACE,
        seeds = [b"skill", skill_id.to_le_bytes().as_ref()],
        bump
    )]
    pub skill: Account<'info, Skill>,
    #[account(mut)]
    pub provider: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateSkill<'info> {
    #[account(
        mut,
        seeds = [b"skill", skill.skill_id.to_le_bytes().as_ref()],
        bump = skill.bump,
        has_one = provider @ RegistryError::NotProvider
    )]
    pub skill: Account<'info, Skill>,
    pub provider: Signer<'info>,
}

#[derive(Accounts)]
pub struct RecordJob<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        constraint = config.facilitator == facilitator.key() @ RegistryError::NotFacilitator
    )]
    pub config: Account<'info, RegistryConfig>,
    #[account(
        mut,
        seeds = [b"skill", skill.skill_id.to_le_bytes().as_ref()],
        bump = skill.bump
    )]
    pub skill: Account<'info, Skill>,
    pub facilitator: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ RegistryError::NotAuthority
    )]
    pub config: Account<'info, RegistryConfig>,
    pub authority: Signer<'info>,
}

#[error_code]
pub enum RegistryError {
    #[msg("Registry is paused")]
    Paused,
    #[msg("Only the configured facilitator may call this")]
    NotFacilitator,
    #[msg("Only the registry authority may call this")]
    NotAuthority,
    #[msg("Only the skill provider may call this")]
    NotProvider,
    #[msg("Skill is not active")]
    SkillInactive,
    #[msg("Endpoint string too long")]
    EndpointTooLong,
}
