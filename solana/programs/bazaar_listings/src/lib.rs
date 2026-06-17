//! BazaarListings — Anchor port of the EVM `BazaarListings.sol`.
//!
//! EVM → Solana mapping:
//! - listing display metadata mapping → one PDA `Listing` account per skillId
//!   (seeds = [b"listing", skill_id.to_le_bytes()]).
//! - one-time listing fee in cUSD     → SPL `transfer` of `fee_amount` of `fee_mint`
//!   into the treasury token account on `create_listing` (implemented in task #6).
//! - reference to SkillRegistry by id  → `skill_id` field (cross-program reads are
//!   resolved client-side / via CPI in task #6).
//!
//! NOTE: scaffold (task #5). `create_listing` / `update_listing` bodies and the SPL
//! fee transfer are implemented in task #6.

use anchor_lang::prelude::*;

declare_id!("HnnH4asvgvAqyBnZKD6SVPMHEwTPTEBq2ZYU995j4Jt3");

pub const MAX_NAME_LEN: usize = 64;
pub const MAX_DESC_LEN: usize = 280;

#[program]
pub mod bazaar_listings {
    use super::*;

    /// One-time setup. `fee_mint` is the listing-fee token (cUSD-equivalent SPL mint),
    /// `fee_amount` the one-time fee, `treasury` the token account receiving fees.
    pub fn initialize(
        ctx: Context<Initialize>,
        fee_mint: Pubkey,
        fee_amount: u64,
        treasury: Pubkey,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.fee_mint = fee_mint;
        cfg.fee_amount = fee_amount;
        cfg.treasury = treasury;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct BazaarConfig {
    pub authority: Pubkey,
    pub fee_mint: Pubkey,
    pub fee_amount: u64,
    pub treasury: Pubkey,
    pub bump: u8,
}

/// One PDA per listing (seeds = [b"listing", skill_id.to_le_bytes()]).
#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub skill_id: u64,
    pub owner: Pubkey,
    pub tier: u8,
    pub fee_paid: bool,
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    #[max_len(MAX_DESC_LEN)]
    pub description: String,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + BazaarConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, BazaarConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum BazaarError {
    #[msg("Listing fee not paid")]
    FeeNotPaid,
    #[msg("Name string too long")]
    NameTooLong,
}
