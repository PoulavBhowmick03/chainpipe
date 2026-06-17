//! BazaarListings — Anchor port of the EVM `BazaarListings.sol`.
//!
//! EVM → Solana mapping:
//! - listing display metadata mapping → one PDA `Listing` account per skill_id
//!   (seeds = [b"listing", skill_id.to_le_bytes()]).
//! - one-time listing fee in cUSD     → SPL `transfer` of `fee_amount` of `fee_mint`
//!   into the treasury token account on `create_listing`.
//! - reference to SkillRegistry by id  → `skill_id` field (cross-program reads are
//!   resolved client-side).

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

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

    /// Create a listing for a skill, paying the one-time fee into the treasury.
    pub fn create_listing(
        ctx: Context<CreateListing>,
        skill_id: u64,
        name: String,
        description: String,
        tier: u8,
    ) -> Result<()> {
        require!(name.len() <= MAX_NAME_LEN, BazaarError::NameTooLong);
        require!(description.len() <= MAX_DESC_LEN, BazaarError::DescTooLong);

        let fee = ctx.accounts.config.fee_amount;
        if fee > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.payer_token.to_account_info(),
                        to: ctx.accounts.treasury_token.to_account_info(),
                        authority: ctx.accounts.owner.to_account_info(),
                    },
                ),
                fee,
            )?;
        }

        let listing = &mut ctx.accounts.listing;
        listing.skill_id = skill_id;
        listing.owner = ctx.accounts.owner.key();
        listing.tier = tier;
        listing.fee_paid = fee > 0;
        listing.name = name;
        listing.description = description;
        listing.bump = ctx.bumps.listing;
        Ok(())
    }

    /// Update listing metadata. Only the listing owner.
    pub fn update_listing(
        ctx: Context<UpdateListing>,
        name: String,
        description: String,
        tier: u8,
    ) -> Result<()> {
        require!(name.len() <= MAX_NAME_LEN, BazaarError::NameTooLong);
        require!(description.len() <= MAX_DESC_LEN, BazaarError::DescTooLong);
        let listing = &mut ctx.accounts.listing;
        listing.name = name;
        listing.description = description;
        listing.tier = tier;
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

#[derive(Accounts)]
#[instruction(skill_id: u64)]
pub struct CreateListing<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, BazaarConfig>,
    #[account(
        init,
        payer = owner,
        space = 8 + Listing::INIT_SPACE,
        seeds = [b"listing", skill_id.to_le_bytes().as_ref()],
        bump
    )]
    pub listing: Account<'info, Listing>,
    #[account(
        mut,
        constraint = payer_token.mint == config.fee_mint @ BazaarError::MintMismatch,
        constraint = payer_token.owner == owner.key() @ BazaarError::WrongOwner
    )]
    pub payer_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = treasury_token.key() == config.treasury @ BazaarError::WrongTreasury
    )]
    pub treasury_token: Account<'info, TokenAccount>,
    pub fee_mint: Account<'info, Mint>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateListing<'info> {
    #[account(
        mut,
        seeds = [b"listing", listing.skill_id.to_le_bytes().as_ref()],
        bump = listing.bump,
        has_one = owner @ BazaarError::NotOwner
    )]
    pub listing: Account<'info, Listing>,
    pub owner: Signer<'info>,
}

#[error_code]
pub enum BazaarError {
    #[msg("Listing fee not paid")]
    FeeNotPaid,
    #[msg("Name string too long")]
    NameTooLong,
    #[msg("Description string too long")]
    DescTooLong,
    #[msg("Only the listing owner may call this")]
    NotOwner,
    #[msg("Token account mint mismatch")]
    MintMismatch,
    #[msg("Token account owner mismatch")]
    WrongOwner,
    #[msg("Treasury token account mismatch")]
    WrongTreasury,
}
