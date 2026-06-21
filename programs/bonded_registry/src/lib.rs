use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

declare_id!("26AB6S5crQAkhfx928bnWSHfpQE6wp2Sdt4afFtk7crq");

// Tier thresholds, denominated in the stake mint's base units (USDC = 6 decimals).
pub const TIER1_MIN: u64 = 10_000_000; // 10 USDC
pub const TIER2_MIN: u64 = 100_000_000; // 100 USDC
pub const TIER3_MIN: u64 = 1_000_000_000; // 1000 USDC

#[program]
pub mod bonded_registry {
    use super::*;

    /// One-time operator setup of the registry config PDA.
    pub fn initialize(
        ctx: Context<Initialize>,
        slash_bps: u16,
        cooldown_slots: u64,
        dag_escrow_authority: Pubkey,
    ) -> Result<()> {
        require!(slash_bps <= 10_000, RegistryError::InvalidSlashBps);
        let cfg = &mut ctx.accounts.config;
        cfg.operator = ctx.accounts.operator.key();
        cfg.dag_escrow_authority = dag_escrow_authority;
        cfg.slash_bps = slash_bps;
        cfg.cooldown_slots = cooldown_slots;
        cfg.bump = ctx.bumps.config;
        // hardening defaults: cap starts at 100% (no extra restriction beyond the existing
        // <=10000 guard); operators opt into a tighter ceiling via set_max_slash_bps.
        cfg.version = REGISTRY_CONFIG_VERSION;
        cfg.max_slash_bps = 10_000;
        cfg.pending_operator = Pubkey::default();
        Ok(())
    }

    /// Operator may update the authorized dag_escrow CPI signer (its PDA).
    pub fn set_dag_escrow_authority(
        ctx: Context<SetDagEscrowAuthority>,
        dag_escrow_authority: Pubkey,
    ) -> Result<()> {
        ctx.accounts.config.dag_escrow_authority = dag_escrow_authority;
        Ok(())
    }

    /// Operator sets the per-incident slash ceiling (≤ 100%).
    pub fn set_max_slash_bps(ctx: Context<SetMaxSlashBps>, max_slash_bps: u16) -> Result<()> {
        require!(max_slash_bps <= 10_000, RegistryError::InvalidSlashBps);
        ctx.accounts.config.max_slash_bps = max_slash_bps;
        Ok(())
    }

    /// Two-step operator transfer (propose; successor must accept).
    pub fn propose_operator(ctx: Context<ProposeOperator>, new_operator: Pubkey) -> Result<()> {
        ctx.accounts.config.pending_operator = new_operator;
        Ok(())
    }

    pub fn accept_operator(ctx: Context<AcceptOperator>) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        require!(cfg.pending_operator != Pubkey::default(), RegistryError::NoPendingOperator);
        require!(
            ctx.accounts.new_operator.key() == cfg.pending_operator,
            RegistryError::NotPendingOperator
        );
        cfg.operator = cfg.pending_operator;
        cfg.pending_operator = Pubkey::default();
        Ok(())
    }

    /// One-time migration: grow a pre-hardening RegistryConfig and seed new fields.
    pub fn migrate_registry_config(ctx: Context<MigrateRegistryConfig>) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        require!(cfg.version == 0, RegistryError::AlreadyMigrated);
        cfg.version = REGISTRY_CONFIG_VERSION;
        cfg.max_slash_bps = 10_000;
        cfg.pending_operator = Pubkey::default();
        Ok(())
    }

    /// Stake SPL tokens into a per-agent vault and register at the matching tier.
    pub fn stake_and_register(ctx: Context<StakeAndRegister>, stake_amount: u64) -> Result<()> {
        let tier = tier_for(stake_amount)?;

        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.agent_token_account.to_account_info(),
                    mint: ctx.accounts.stake_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.agent.to_account_info(),
                },
            ),
            stake_amount,
            ctx.accounts.stake_mint.decimals,
        )?;

        let agent_stake = &mut ctx.accounts.agent_stake;
        agent_stake.agent = ctx.accounts.agent.key();
        agent_stake.stake_mint = ctx.accounts.stake_mint.key();
        agent_stake.stake_amount = stake_amount;
        agent_stake.tier = tier;
        agent_stake.open_jobs = 0;
        agent_stake.total_settled = 0;
        agent_stake.total_slashed = 0;
        agent_stake.unstake_requested_at = 0;
        agent_stake.bump = ctx.bumps.agent_stake;

        emit!(StakeRegistered {
            agent: agent_stake.agent,
            stake_mint: agent_stake.stake_mint,
            stake_amount,
            tier,
        });
        Ok(())
    }

    /// Add to an existing stake (may upgrade the tier).
    pub fn add_stake(ctx: Context<AddStake>, additional_amount: u64) -> Result<()> {
        require!(additional_amount > 0, RegistryError::StakeTooLow);

        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.agent_token_account.to_account_info(),
                    mint: ctx.accounts.stake_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.agent.to_account_info(),
                },
            ),
            additional_amount,
            ctx.accounts.stake_mint.decimals,
        )?;

        let agent_stake = &mut ctx.accounts.agent_stake;
        agent_stake.stake_amount = agent_stake
            .stake_amount
            .checked_add(additional_amount)
            .ok_or(RegistryError::MathOverflow)?;
        agent_stake.tier = tier_for(agent_stake.stake_amount)?;

        emit!(StakeRegistered {
            agent: agent_stake.agent,
            stake_mint: agent_stake.stake_mint,
            stake_amount: agent_stake.stake_amount,
            tier: agent_stake.tier,
        });
        Ok(())
    }

    /// Begin the unstake cooldown. Reverts if the agent has open jobs.
    pub fn request_unstake(ctx: Context<RequestUnstake>) -> Result<()> {
        let agent_stake = &mut ctx.accounts.agent_stake;
        require!(agent_stake.tier > 0, RegistryError::AgentNotRegistered);
        require!(agent_stake.open_jobs == 0, RegistryError::HasOpenJobs);
        agent_stake.unstake_requested_at = Clock::get()?.slot as i64;
        Ok(())
    }

    /// Withdraw the full stake after the cooldown elapses.
    pub fn execute_unstake(ctx: Context<ExecuteUnstake>) -> Result<()> {
        let cfg = &ctx.accounts.config;
        let agent_stake = &ctx.accounts.agent_stake;

        require!(
            agent_stake.unstake_requested_at > 0,
            RegistryError::UnstakeNotRequested
        );
        require!(agent_stake.open_jobs == 0, RegistryError::HasOpenJobs);
        let now = Clock::get()?.slot;
        let ready_at = (agent_stake.unstake_requested_at as u64)
            .checked_add(cfg.cooldown_slots)
            .ok_or(RegistryError::MathOverflow)?;
        require!(now >= ready_at, RegistryError::CooldownNotElapsed);

        let amount = agent_stake.stake_amount;
        let agent_key = agent_stake.agent;
        let seeds: &[&[u8]] = &[b"agent_stake", agent_key.as_ref(), &[agent_stake.bump]];
        let signer = &[seeds];

        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.stake_mint.to_account_info(),
                    to: ctx.accounts.agent_token_account.to_account_info(),
                    authority: ctx.accounts.agent_stake.to_account_info(),
                },
                signer,
            ),
            amount,
            ctx.accounts.stake_mint.decimals,
        )?;

        let agent_stake = &mut ctx.accounts.agent_stake;
        agent_stake.stake_amount = 0;
        agent_stake.tier = 0;
        agent_stake.unstake_requested_at = 0;

        emit!(StakeWithdrawn {
            agent: agent_key,
            amount,
        });
        Ok(())
    }

    /// Slash a fraction of an agent's stake to the consumer. Only the configured
    /// dag_escrow authority PDA may invoke this (enforced via signer check).
    pub fn slash_stake(ctx: Context<SlashStake>, job_id: [u8; 32], slash_bps: u16) -> Result<()> {
        require!(slash_bps <= 10_000, RegistryError::InvalidSlashBps);
        // Per-incident cap, caller-independent (defends even if dag_escrow passes a high bps).
        require!(slash_bps <= ctx.accounts.config.max_slash_bps, RegistryError::SlashExceedsCap);
        require!(
            ctx.accounts.dag_authority.key() == ctx.accounts.config.dag_escrow_authority,
            RegistryError::UnauthorizedCaller
        );

        let agent_stake_info = ctx.accounts.agent_stake.to_account_info();
        let agent_key;
        let bump;
        let slash_amount;
        {
            let agent_stake = &ctx.accounts.agent_stake;
            agent_key = agent_stake.agent;
            bump = agent_stake.bump;
            slash_amount = (agent_stake.stake_amount as u128)
                .checked_mul(slash_bps as u128)
                .ok_or(RegistryError::MathOverflow)?
                .checked_div(10_000)
                .ok_or(RegistryError::MathOverflow)? as u64;
        }

        if slash_amount > 0 {
            let seeds: &[&[u8]] = &[b"agent_stake", agent_key.as_ref(), &[bump]];
            let signer = &[seeds];
            token::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.vault.to_account_info(),
                        mint: ctx.accounts.stake_mint.to_account_info(),
                        to: ctx.accounts.consumer_token_account.to_account_info(),
                        authority: agent_stake_info,
                    },
                    signer,
                ),
                slash_amount,
                ctx.accounts.stake_mint.decimals,
            )?;
        }

        let agent_stake = &mut ctx.accounts.agent_stake;
        agent_stake.stake_amount = agent_stake.stake_amount.saturating_sub(slash_amount);
        agent_stake.tier = tier_for_lenient(agent_stake.stake_amount);
        agent_stake.total_slashed = agent_stake.total_slashed.saturating_add(1);

        emit!(StakeSlashed {
            agent: agent_key,
            job_id,
            slash_amount,
            new_tier: agent_stake.tier,
        });
        Ok(())
    }

    /// Increment the open-job counter (called by dag_escrow on claim).
    pub fn increment_open_jobs(ctx: Context<MutateOpenJobs>) -> Result<()> {
        require!(
            ctx.accounts.dag_authority.key() == ctx.accounts.config.dag_escrow_authority,
            RegistryError::UnauthorizedCaller
        );
        let a = &mut ctx.accounts.agent_stake;
        a.open_jobs = a.open_jobs.checked_add(1).ok_or(RegistryError::MathOverflow)?;
        Ok(())
    }

    /// Decrement the open-job counter and tally a settlement (called by
    /// dag_escrow on settle or expire). `settled` distinguishes the two.
    pub fn decrement_open_jobs(ctx: Context<MutateOpenJobs>, settled: bool) -> Result<()> {
        require!(
            ctx.accounts.dag_authority.key() == ctx.accounts.config.dag_escrow_authority,
            RegistryError::UnauthorizedCaller
        );
        let a = &mut ctx.accounts.agent_stake;
        a.open_jobs = a.open_jobs.saturating_sub(1);
        if settled {
            a.total_settled = a.total_settled.saturating_add(1);
        }
        Ok(())
    }
}

/// Strict tier lookup used at stake time — rejects amounts below Tier 1.
fn tier_for(amount: u64) -> Result<u8> {
    if amount >= TIER3_MIN {
        Ok(3)
    } else if amount >= TIER2_MIN {
        Ok(2)
    } else if amount >= TIER1_MIN {
        Ok(1)
    } else {
        err!(RegistryError::StakeTooLow)
    }
}

/// Lenient tier lookup used after slashing — returns 0 (unregistered) if the
/// remaining stake drops below Tier 1 rather than erroring.
fn tier_for_lenient(amount: u64) -> u8 {
    if amount >= TIER3_MIN {
        3
    } else if amount >= TIER2_MIN {
        2
    } else if amount >= TIER1_MIN {
        1
    } else {
        0
    }
}

#[account]
pub struct RegistryConfig {
    pub operator: Pubkey,
    pub dag_escrow_authority: Pubkey,
    pub slash_bps: u16,
    pub cooldown_slots: u64,
    pub bump: u8,
    // ── hardening fields (APPENDED; grown on live accounts via migrate_registry_config) ──
    pub version: u8,
    /// Hard ceiling on any single slash (per incident), caller-independent.
    pub max_slash_bps: u16,
    /// Two-step operator transfer target (default = none).
    pub pending_operator: Pubkey,
}

impl RegistryConfig {
    pub const LEN: usize = 8 + 32 + 32 + 2 + 8 + 1 + 1 + 2 + 32;
}

pub const REGISTRY_CONFIG_VERSION: u8 = 1;

#[account]
pub struct AgentStake {
    pub agent: Pubkey,
    pub stake_mint: Pubkey,
    pub stake_amount: u64,
    pub tier: u8,
    pub open_jobs: u32,
    pub total_settled: u32,
    pub total_slashed: u32,
    pub unstake_requested_at: i64,
    pub bump: u8,
}

impl AgentStake {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1 + 4 + 4 + 4 + 8 + 1;
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = operator,
        space = RegistryConfig::LEN,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, RegistryConfig>,
    #[account(mut)]
    pub operator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetDagEscrowAuthority<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = operator)]
    pub config: Account<'info, RegistryConfig>,
    pub operator: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetMaxSlashBps<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = operator)]
    pub config: Account<'info, RegistryConfig>,
    pub operator: Signer<'info>,
}

#[derive(Accounts)]
pub struct ProposeOperator<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = operator)]
    pub config: Account<'info, RegistryConfig>,
    pub operator: Signer<'info>,
}

#[derive(Accounts)]
pub struct AcceptOperator<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, RegistryConfig>,
    pub new_operator: Signer<'info>,
}

#[derive(Accounts)]
pub struct MigrateRegistryConfig<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = operator,
        realloc = RegistryConfig::LEN,
        realloc::payer = operator,
        realloc::zero = false
    )]
    pub config: Account<'info, RegistryConfig>,
    #[account(mut)]
    pub operator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeAndRegister<'info> {
    #[account(
        init,
        payer = agent,
        space = AgentStake::LEN,
        seeds = [b"agent_stake", agent.key().as_ref()],
        bump
    )]
    pub agent_stake: Account<'info, AgentStake>,
    #[account(mut)]
    pub agent: Signer<'info>,
    pub stake_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = stake_mint,
        associated_token::authority = agent
    )]
    pub agent_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = agent,
        associated_token::mint = stake_mint,
        associated_token::authority = agent_stake
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddStake<'info> {
    #[account(
        mut,
        seeds = [b"agent_stake", agent.key().as_ref()],
        bump = agent_stake.bump,
        has_one = agent
    )]
    pub agent_stake: Account<'info, AgentStake>,
    #[account(mut)]
    pub agent: Signer<'info>,
    pub stake_mint: Account<'info, Mint>,
    #[account(mut)]
    pub agent_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = stake_mint,
        associated_token::authority = agent_stake
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RequestUnstake<'info> {
    #[account(
        mut,
        seeds = [b"agent_stake", agent.key().as_ref()],
        bump = agent_stake.bump,
        has_one = agent
    )]
    pub agent_stake: Account<'info, AgentStake>,
    pub agent: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteUnstake<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, RegistryConfig>,
    #[account(
        mut,
        seeds = [b"agent_stake", agent.key().as_ref()],
        bump = agent_stake.bump,
        has_one = agent,
        has_one = stake_mint
    )]
    pub agent_stake: Account<'info, AgentStake>,
    #[account(mut)]
    pub agent: Signer<'info>,
    pub stake_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = stake_mint,
        associated_token::authority = agent_stake
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = stake_mint,
        associated_token::authority = agent
    )]
    pub agent_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SlashStake<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, RegistryConfig>,
    #[account(
        mut,
        seeds = [b"agent_stake", agent_stake.agent.as_ref()],
        bump = agent_stake.bump,
        has_one = stake_mint
    )]
    pub agent_stake: Account<'info, AgentStake>,
    pub stake_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = stake_mint,
        associated_token::authority = agent_stake
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub consumer_token_account: Account<'info, TokenAccount>,
    /// CPI signer PDA derived from the dag_escrow program. Verified against
    /// config.dag_escrow_authority.
    pub dag_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MutateOpenJobs<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, RegistryConfig>,
    #[account(
        mut,
        seeds = [b"agent_stake", agent_stake.agent.as_ref()],
        bump = agent_stake.bump
    )]
    pub agent_stake: Account<'info, AgentStake>,
    pub dag_authority: Signer<'info>,
}

#[event]
pub struct StakeRegistered {
    pub agent: Pubkey,
    pub stake_mint: Pubkey,
    pub stake_amount: u64,
    pub tier: u8,
}

#[event]
pub struct StakeWithdrawn {
    pub agent: Pubkey,
    pub amount: u64,
}

#[event]
pub struct StakeSlashed {
    pub agent: Pubkey,
    pub job_id: [u8; 32],
    pub slash_amount: u64,
    pub new_tier: u8,
}

#[error_code]
pub enum RegistryError {
    #[msg("Stake amount below minimum for any tier")]
    StakeTooLow,
    #[msg("Agent has open jobs, cannot unstake")]
    HasOpenJobs,
    #[msg("Cooldown period not elapsed")]
    CooldownNotElapsed,
    #[msg("Unstake not requested")]
    UnstakeNotRequested,
    #[msg("Slash BPS exceeds 100%")]
    InvalidSlashBps,
    #[msg("Unauthorized: caller is not dag_escrow program")]
    UnauthorizedCaller,
    #[msg("Agent is not registered")]
    AgentNotRegistered,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Slash BPS exceeds the configured per-incident cap")]
    SlashExceedsCap,
    #[msg("No pending operator to accept")]
    NoPendingOperator,
    #[msg("Signer is not the pending operator")]
    NotPendingOperator,
    #[msg("Config already migrated")]
    AlreadyMigrated,
}
