use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use bonded_registry::cpi::accounts::{MutateOpenJobs, SlashStake as BrSlashStake};
use bonded_registry::program::BondedRegistry;
use reputation_bridge::cpi::accounts::RecordOutcome;
use reputation_bridge::program::ReputationBridge;

declare_id!("3FqvkzppD4ciwkGLrcNoTHUCeHwNbWtot18CkrBdXiJd");

pub const MAX_NODES: usize = 16;
/// Dispute window after a completion is submitted (devnet-sized ~60s; production
/// would use a larger value, e.g. several hours of slots).
pub const DISPUTE_SLOTS: u64 = 150;

#[program]
pub mod dag_escrow {
    use super::*;

    /// One-time operator setup. Stores the fee, the facilitator authority
    /// (permitted to settle nodes) and the canonical dag_authority PDA bump.
    pub fn initialize(
        ctx: Context<Initialize>,
        fee_bps: u16,
        facilitator_authority: Pubkey,
    ) -> Result<()> {
        require!(fee_bps <= 10_000, DagError::InvalidFeeBps);
        let (_, dag_bump) = Pubkey::find_program_address(&[b"dag_authority"], &crate::ID);
        let cfg = &mut ctx.accounts.pipeline_config;
        cfg.operator = ctx.accounts.operator.key();
        cfg.facilitator_authority = facilitator_authority;
        cfg.fee_bps = fee_bps;
        cfg.dag_authority_bump = dag_bump;
        cfg.bump = ctx.bumps.pipeline_config;
        Ok(())
    }

    /// Operator rotates the facilitator authority (key rotation / decentralization).
    pub fn set_facilitator_authority(
        ctx: Context<SetFacilitatorAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        ctx.accounts.pipeline_config.facilitator_authority = new_authority;
        Ok(())
    }

    /// Create a DAG pipeline, lock the full budget into a vault, and create one
    /// PipelineNode account per node (passed as remaining_accounts in order).
    pub fn create_pipeline<'info>(
        ctx: Context<'_, '_, '_, 'info, CreatePipeline<'info>>,
        node_configs: Vec<NodeConfig>,
        nonce: u64,
    ) -> Result<()> {
        let n = node_configs.len();
        require!(n >= 1 && n <= MAX_NODES, DagError::InvalidNodeCount);
        require!(
            ctx.remaining_accounts.len() == n,
            DagError::NodeAccountMismatch
        );

        // Validate DAG: a node may only depend on strictly-lower indices. This
        // is a topological ordering constraint that makes cycles impossible.
        let mut total: u64 = 0;
        for (i, nc) in node_configs.iter().enumerate() {
            let allowed: u64 = if i == 0 { 0 } else { (1u64 << i) - 1 };
            require!(nc.dependency_mask & !allowed == 0, DagError::InvalidDag);
            total = total
                .checked_add(nc.allocation_usdc)
                .ok_or(DagError::MathOverflow)?;
        }
        require!(total > 0, DagError::EmptyPipeline);

        // Lock the full budget into the pipeline vault.
        token::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.consumer_token_account.to_account_info(),
                    mint: ctx.accounts.stake_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.consumer.to_account_info(),
                },
            ),
            total,
            ctx.accounts.stake_mint.decimals,
        )?;

        let clock = Clock::get()?;
        let pipeline_key = ctx.accounts.pipeline.key();

        let pipeline = &mut ctx.accounts.pipeline;
        pipeline.consumer = ctx.accounts.consumer.key();
        pipeline.total_nodes = n as u8;
        pipeline.total_usdc_locked = total;
        pipeline.nodes_settled = 0;
        pipeline.nodes_expired = 0;
        pipeline.status = PipelineStatus::Active;
        pipeline.nonce = nonce;
        pipeline.stake_mint = ctx.accounts.stake_mint.key();
        pipeline.settled_mask = 0;
        pipeline.bump = ctx.bumps.pipeline;

        // Create each node PDA via signed system CPI, then write its state.
        let rent = Rent::get()?;
        let space = 8 + PipelineNode::INIT_SPACE;
        let lamports = rent.minimum_balance(space);
        for (i, nc) in node_configs.iter().enumerate() {
            let idx = i as u8;
            let node_ai = &ctx.remaining_accounts[i];
            let (pda, bump) = Pubkey::find_program_address(
                &[b"node", pipeline_key.as_ref(), &[idx]],
                &crate::ID,
            );
            require!(node_ai.key() == pda, DagError::InvalidNodeAccount);

            let seeds: &[&[u8]] = &[b"node", pipeline_key.as_ref(), &[idx], &[bump]];
            system_program::create_account(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::CreateAccount {
                        from: ctx.accounts.consumer.to_account_info(),
                        to: node_ai.clone(),
                    },
                    &[seeds],
                ),
                lamports,
                space as u64,
                &crate::ID,
            )?;

            let node = PipelineNode {
                pipeline: pipeline_key,
                node_index: idx,
                agent: Pubkey::default(),
                allocation_usdc: nc.allocation_usdc,
                deadline_slot: clock.slot.saturating_add(nc.deadline_slots_from_now),
                dependency_mask: nc.dependency_mask,
                status: NodeStatus::Pending,
                settled_at_slot: 0,
                job_id: [0u8; 32],
                required_tier: nc.required_tier,
                bump,
            };
            let mut data = node_ai.try_borrow_mut_data()?;
            data[..8].copy_from_slice(PipelineNode::DISCRIMINATOR);
            node.serialize(&mut &mut data[8..])?;
        }

        emit!(PipelineCreated {
            pipeline: pipeline_key,
            consumer: pipeline.consumer,
            total_nodes: n as u8,
            total_usdc_locked: total,
        });
        Ok(())
    }

    /// An agent claims a node once all dependencies are settled and its tier is
    /// sufficient. CPIs into bonded_registry to increment the open-job counter.
    pub fn claim_node(ctx: Context<ClaimNode>, node_index: u8) -> Result<()> {
        require!(
            ctx.accounts.pipeline.status == PipelineStatus::Active,
            DagError::PipelineNotActive
        );
        {
            let node = &ctx.accounts.node;
            require!(node.node_index == node_index, DagError::InvalidNodeAccount);
            require!(node.status == NodeStatus::Pending, DagError::NodeNotClaimable);
            let mask = node.dependency_mask;
            require!(
                (mask & ctx.accounts.pipeline.settled_mask) == mask,
                DagError::DependenciesNotMet
            );
            require!(
                ctx.accounts.agent_stake.agent == ctx.accounts.agent.key(),
                DagError::AgentMismatch
            );
            require!(
                ctx.accounts.agent_stake.tier >= node.required_tier,
                DagError::TierInsufficient
            );
        }

        let clock = Clock::get()?;
        let pipeline_key = ctx.accounts.pipeline.key();
        let agent_key = ctx.accounts.agent.key();
        let job_id: [u8; 32] = hashv(&[
            pipeline_key.as_ref(),
            &[node_index],
            agent_key.as_ref(),
            &clock.slot.to_le_bytes(),
        ])
        .to_bytes();

        let node = &mut ctx.accounts.node;
        node.agent = agent_key;
        node.status = NodeStatus::Claimed;
        node.job_id = job_id;

        // CPI: bonded_registry.increment_open_jobs (signed by dag_authority PDA).
        let bump = ctx.accounts.pipeline_config.dag_authority_bump;
        let signer: &[&[&[u8]]] = &[&[b"dag_authority", &[bump]]];
        bonded_registry::cpi::increment_open_jobs(CpiContext::new_with_signer(
            ctx.accounts.bonded_registry_program.to_account_info(),
            MutateOpenJobs {
                config: ctx.accounts.registry_config.to_account_info(),
                agent_stake: ctx.accounts.agent_stake.to_account_info(),
                dag_authority: ctx.accounts.dag_authority.to_account_info(),
            },
            signer,
        ))?;

        emit!(NodeClaimed {
            pipeline: pipeline_key,
            node_index,
            agent: agent_key,
            job_id,
        });
        Ok(())
    }

    /// Facilitator settles a claimed node: pays the agent (minus fee), pays the
    /// operator fee, decrements the open-job counter, and writes reputation.
    pub fn complete_node(
        ctx: Context<CompleteNode>,
        node_index: u8,
        score_delta: i16,
        result_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.facilitator.key() == ctx.accounts.pipeline_config.facilitator_authority,
            DagError::UnauthorizedFacilitator
        );

        let (allocation, job_id, agent_key) = {
            let node = &ctx.accounts.node;
            require!(node.node_index == node_index, DagError::InvalidNodeAccount);
            require!(node.status == NodeStatus::Claimed, DagError::NodeNotClaimed);
            require!(node.agent == ctx.accounts.agent.key(), DagError::AgentMismatch);
            (node.allocation_usdc, node.job_id, node.agent)
        };

        let fee_bps = ctx.accounts.pipeline_config.fee_bps as u64;
        let fee = (allocation as u128 * fee_bps as u128 / 10_000) as u64;
        let to_agent = allocation.saturating_sub(fee);

        // Pipeline PDA signs vault transfers.
        let consumer = ctx.accounts.pipeline.consumer;
        let nonce = ctx.accounts.pipeline.nonce.to_le_bytes();
        let pbump = ctx.accounts.pipeline.bump;
        let psigner: &[&[&[u8]]] =
            &[&[b"pipeline", consumer.as_ref(), nonce.as_ref(), &[pbump]]];
        let decimals = ctx.accounts.stake_mint.decimals;

        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.stake_mint.to_account_info(),
                    to: ctx.accounts.agent_token_account.to_account_info(),
                    authority: ctx.accounts.pipeline.to_account_info(),
                },
                psigner,
            ),
            to_agent,
            decimals,
        )?;
        if fee > 0 {
            token::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.vault.to_account_info(),
                        mint: ctx.accounts.stake_mint.to_account_info(),
                        to: ctx.accounts.operator_treasury.to_account_info(),
                        authority: ctx.accounts.pipeline.to_account_info(),
                    },
                    psigner,
                ),
                fee,
                decimals,
            )?;
        }

        let clock = Clock::get()?;
        {
            let node = &mut ctx.accounts.node;
            node.status = NodeStatus::Settled;
            node.settled_at_slot = clock.slot;
        }
        {
            let pipeline = &mut ctx.accounts.pipeline;
            pipeline.nodes_settled = pipeline.nodes_settled.saturating_add(1);
            pipeline.settled_mask |= 1u64 << node_index;
            if pipeline.nodes_settled == pipeline.total_nodes {
                pipeline.status = PipelineStatus::Completed;
            } else if pipeline.nodes_settled + pipeline.nodes_expired == pipeline.total_nodes {
                pipeline.status = PipelineStatus::PartiallyRefunded;
            }
        }

        // CPI: bonded_registry.decrement_open_jobs(settled = true).
        let dbump = ctx.accounts.pipeline_config.dag_authority_bump;
        let dsigner: &[&[&[u8]]] = &[&[b"dag_authority", &[dbump]]];
        bonded_registry::cpi::decrement_open_jobs(
            CpiContext::new_with_signer(
                ctx.accounts.bonded_registry_program.to_account_info(),
                MutateOpenJobs {
                    config: ctx.accounts.registry_config.to_account_info(),
                    agent_stake: ctx.accounts.agent_stake.to_account_info(),
                    dag_authority: ctx.accounts.dag_authority.to_account_info(),
                },
                dsigner,
            ),
            true,
        )?;

        // CPI: reputation_bridge.record_completion.
        reputation_bridge::cpi::record_completion(
            CpiContext::new_with_signer(
                ctx.accounts.reputation_bridge_program.to_account_info(),
                RecordOutcome {
                    bridge_config: ctx.accounts.bridge_config.to_account_info(),
                    agent_reputation: ctx.accounts.agent_reputation.to_account_info(),
                    job_record: ctx.accounts.job_record.to_account_info(),
                    agent: ctx.accounts.agent.to_account_info(),
                    dag_authority: ctx.accounts.dag_authority.to_account_info(),
                    payer: ctx.accounts.facilitator.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
                dsigner,
            ),
            job_id,
            score_delta,
        )?;

        emit!(NodeSettled {
            pipeline: ctx.accounts.pipeline.key(),
            node_index,
            agent: agent_key,
            paid: to_agent,
            fee,
            result_hash,
        });
        Ok(())
    }

    /// Optimistic settlement step 1: the facilitator submits a completion with an
    /// agent-committed `result_hash` and starts the dispute window. No funds move.
    pub fn submit_completion(
        ctx: Context<SubmitCompletion>,
        node_index: u8,
        score_delta: i16,
        result_hash: [u8; 32],
        uri: [u8; 96],
        uri_len: u8,
    ) -> Result<()> {
        require!(
            ctx.accounts.facilitator.key() == ctx.accounts.pipeline_config.facilitator_authority,
            DagError::UnauthorizedFacilitator
        );
        require!((uri_len as usize) <= 96, DagError::InvalidUri);
        let clock = Clock::get()?;
        {
            let node = &ctx.accounts.node;
            require!(node.node_index == node_index, DagError::InvalidNodeAccount);
            require!(node.status == NodeStatus::Claimed, DagError::NodeNotClaimed);
            require!(node.agent == ctx.accounts.agent.key(), DagError::AgentMismatch);
        }
        let s = &mut ctx.accounts.settlement;
        s.node = ctx.accounts.node.key();
        s.result_hash = result_hash;
        s.uri = uri;
        s.uri_len = uri_len;
        s.submitted_at_slot = clock.slot;
        s.score_delta = score_delta;
        s.disputed = false;
        s.bump = ctx.bumps.settlement;
        ctx.accounts.node.status = NodeStatus::Submitted;
        ctx.accounts.node.settled_at_slot = clock.slot;
        emit!(NodeSubmitted {
            pipeline: ctx.accounts.pipeline.key(),
            node_index,
            agent: ctx.accounts.agent.key(),
            result_hash,
            uri,
            uri_len,
            dispute_until: clock.slot.saturating_add(DISPUTE_SLOTS),
        });
        Ok(())
    }

    /// The consumer challenges a submitted node within the dispute window.
    /// `reason_code`: 0 = HashMismatch, 1 = Unavailable, 2 = IncorrectOutput.
    /// Codes 0/1 are objectively checkable against `uri`+`result_hash`; 2 is
    /// subjective and resolves via the arbiter. Recorded for triage only.
    pub fn dispute_node(
        ctx: Context<DisputeNode>,
        node_index: u8,
        reason_hash: [u8; 32],
        reason_code: u8,
    ) -> Result<()> {
        let clock = Clock::get()?;
        {
            let node = &ctx.accounts.node;
            require!(node.node_index == node_index, DagError::InvalidNodeAccount);
            require!(node.status == NodeStatus::Submitted, DagError::NodeNotSubmitted);
        }
        require!(
            clock.slot <= ctx.accounts.settlement.submitted_at_slot.saturating_add(DISPUTE_SLOTS),
            DagError::DisputeWindowClosed
        );
        ctx.accounts.settlement.disputed = true;
        ctx.accounts.node.status = NodeStatus::Disputed;
        emit!(NodeDisputed { pipeline: ctx.accounts.pipeline.key(), node_index, reason_hash, reason_code });
        Ok(())
    }

    /// Permissionless finalize after the dispute window elapses with no dispute:
    /// pays the agent (minus fee) + operator fee and records completion reputation.
    pub fn finalize_node(ctx: Context<FinalizeNode>, node_index: u8) -> Result<()> {
        let clock = Clock::get()?;
        let (allocation, job_id, agent_key) = {
            let node = &ctx.accounts.node;
            require!(node.node_index == node_index, DagError::InvalidNodeAccount);
            require!(node.status == NodeStatus::Submitted, DagError::NodeNotSubmitted);
            require!(node.agent == ctx.accounts.agent.key(), DagError::AgentMismatch);
            (node.allocation_usdc, node.job_id, node.agent)
        };
        require!(!ctx.accounts.settlement.disputed, DagError::NodeAlreadyDisputed);
        require!(
            clock.slot > ctx.accounts.settlement.submitted_at_slot.saturating_add(DISPUTE_SLOTS),
            DagError::DisputeWindowOpen
        );
        let score_delta = ctx.accounts.settlement.score_delta;

        let fee_bps = ctx.accounts.pipeline_config.fee_bps as u64;
        let fee = (allocation as u128 * fee_bps as u128 / 10_000) as u64;
        let to_agent = allocation.saturating_sub(fee);
        let consumer = ctx.accounts.pipeline.consumer;
        let nonce = ctx.accounts.pipeline.nonce.to_le_bytes();
        let pbump = ctx.accounts.pipeline.bump;
        let psigner: &[&[&[u8]]] = &[&[b"pipeline", consumer.as_ref(), nonce.as_ref(), &[pbump]]];
        let decimals = ctx.accounts.stake_mint.decimals;

        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked { from: ctx.accounts.vault.to_account_info(), mint: ctx.accounts.stake_mint.to_account_info(), to: ctx.accounts.agent_token_account.to_account_info(), authority: ctx.accounts.pipeline.to_account_info() },
                psigner,
            ),
            to_agent,
            decimals,
        )?;
        if fee > 0 {
            token::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked { from: ctx.accounts.vault.to_account_info(), mint: ctx.accounts.stake_mint.to_account_info(), to: ctx.accounts.operator_treasury.to_account_info(), authority: ctx.accounts.pipeline.to_account_info() },
                    psigner,
                ),
                fee,
                decimals,
            )?;
        }

        ctx.accounts.node.status = NodeStatus::Settled;
        ctx.accounts.node.settled_at_slot = clock.slot;
        {
            let pipeline = &mut ctx.accounts.pipeline;
            pipeline.nodes_settled = pipeline.nodes_settled.saturating_add(1);
            pipeline.settled_mask |= 1u64 << node_index;
            if pipeline.nodes_settled == pipeline.total_nodes {
                pipeline.status = PipelineStatus::Completed;
            } else if pipeline.nodes_settled + pipeline.nodes_expired == pipeline.total_nodes {
                pipeline.status = PipelineStatus::PartiallyRefunded;
            }
        }

        let dbump = ctx.accounts.pipeline_config.dag_authority_bump;
        let dsigner: &[&[&[u8]]] = &[&[b"dag_authority", &[dbump]]];
        bonded_registry::cpi::decrement_open_jobs(
            CpiContext::new_with_signer(ctx.accounts.bonded_registry_program.to_account_info(), MutateOpenJobs { config: ctx.accounts.registry_config.to_account_info(), agent_stake: ctx.accounts.agent_stake.to_account_info(), dag_authority: ctx.accounts.dag_authority.to_account_info() }, dsigner),
            true,
        )?;
        reputation_bridge::cpi::record_completion(
            CpiContext::new_with_signer(ctx.accounts.reputation_bridge_program.to_account_info(), RecordOutcome { bridge_config: ctx.accounts.bridge_config.to_account_info(), agent_reputation: ctx.accounts.agent_reputation.to_account_info(), job_record: ctx.accounts.job_record.to_account_info(), agent: ctx.accounts.agent.to_account_info(), dag_authority: ctx.accounts.dag_authority.to_account_info(), payer: ctx.accounts.caller.to_account_info(), system_program: ctx.accounts.system_program.to_account_info() }, dsigner),
            job_id,
            score_delta,
        )?;

        emit!(NodeSettled { pipeline: ctx.accounts.pipeline.key(), node_index, agent: agent_key, paid: to_agent, fee, result_hash: ctx.accounts.settlement.result_hash });
        Ok(())
    }

    /// Arbiter (facilitator authority, v1) resolves a disputed node. Upheld →
    /// refund the consumer + slash the agent + record a failure. Rejected →
    /// settle as normal (pay the agent, record completion).
    pub fn resolve_dispute(ctx: Context<ResolveDispute>, node_index: u8, upheld: bool) -> Result<()> {
        require!(
            ctx.accounts.facilitator.key() == ctx.accounts.pipeline_config.facilitator_authority,
            DagError::UnauthorizedArbiter
        );
        let clock = Clock::get()?;
        let (allocation, job_id, agent_key) = {
            let node = &ctx.accounts.node;
            require!(node.node_index == node_index, DagError::InvalidNodeAccount);
            require!(node.status == NodeStatus::Disputed, DagError::NodeNotDisputed);
            (node.allocation_usdc, node.job_id, node.agent)
        };
        let score_delta = ctx.accounts.settlement.score_delta;
        let consumer = ctx.accounts.pipeline.consumer;
        let nonce = ctx.accounts.pipeline.nonce.to_le_bytes();
        let pbump = ctx.accounts.pipeline.bump;
        let psigner: &[&[&[u8]]] = &[&[b"pipeline", consumer.as_ref(), nonce.as_ref(), &[pbump]]];
        let decimals = ctx.accounts.stake_mint.decimals;
        let dbump = ctx.accounts.pipeline_config.dag_authority_bump;
        let dsigner: &[&[&[u8]]] = &[&[b"dag_authority", &[dbump]]];

        if upheld {
            // refund the node's allocation to the consumer
            token::transfer_checked(
                CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), TransferChecked { from: ctx.accounts.vault.to_account_info(), mint: ctx.accounts.stake_mint.to_account_info(), to: ctx.accounts.consumer_token_account.to_account_info(), authority: ctx.accounts.pipeline.to_account_info() }, psigner),
                allocation,
                decimals,
            )?;
            // decrement open jobs + slash + record failure
            bonded_registry::cpi::decrement_open_jobs(
                CpiContext::new_with_signer(ctx.accounts.bonded_registry_program.to_account_info(), MutateOpenJobs { config: ctx.accounts.registry_config.to_account_info(), agent_stake: ctx.accounts.agent_stake.to_account_info(), dag_authority: ctx.accounts.dag_authority.to_account_info() }, dsigner),
                false,
            )?;
            let slash_bps = ctx.accounts.registry_config.slash_bps;
            bonded_registry::cpi::slash_stake(
                CpiContext::new_with_signer(ctx.accounts.bonded_registry_program.to_account_info(), BrSlashStake { config: ctx.accounts.registry_config.to_account_info(), agent_stake: ctx.accounts.agent_stake.to_account_info(), stake_mint: ctx.accounts.stake_mint.to_account_info(), vault: ctx.accounts.agent_stake_vault.to_account_info(), consumer_token_account: ctx.accounts.consumer_token_account.to_account_info(), dag_authority: ctx.accounts.dag_authority.to_account_info(), token_program: ctx.accounts.token_program.to_account_info() }, dsigner),
                job_id,
                slash_bps,
            )?;
            reputation_bridge::cpi::record_failure(
                CpiContext::new_with_signer(ctx.accounts.reputation_bridge_program.to_account_info(), RecordOutcome { bridge_config: ctx.accounts.bridge_config.to_account_info(), agent_reputation: ctx.accounts.agent_reputation.to_account_info(), job_record: ctx.accounts.job_record.to_account_info(), agent: ctx.accounts.agent.to_account_info(), dag_authority: ctx.accounts.dag_authority.to_account_info(), payer: ctx.accounts.facilitator.to_account_info(), system_program: ctx.accounts.system_program.to_account_info() }, dsigner),
                job_id,
            )?;
            ctx.accounts.node.status = NodeStatus::Expired;
            let pipeline = &mut ctx.accounts.pipeline;
            pipeline.nodes_expired = pipeline.nodes_expired.saturating_add(1);
            pipeline.status = PipelineStatus::PartiallyRefunded;
        } else {
            let fee_bps = ctx.accounts.pipeline_config.fee_bps as u64;
            let fee = (allocation as u128 * fee_bps as u128 / 10_000) as u64;
            let to_agent = allocation.saturating_sub(fee);
            token::transfer_checked(
                CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), TransferChecked { from: ctx.accounts.vault.to_account_info(), mint: ctx.accounts.stake_mint.to_account_info(), to: ctx.accounts.agent_token_account.to_account_info(), authority: ctx.accounts.pipeline.to_account_info() }, psigner),
                to_agent,
                decimals,
            )?;
            if fee > 0 {
                token::transfer_checked(
                    CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), TransferChecked { from: ctx.accounts.vault.to_account_info(), mint: ctx.accounts.stake_mint.to_account_info(), to: ctx.accounts.operator_treasury.to_account_info(), authority: ctx.accounts.pipeline.to_account_info() }, psigner),
                    fee,
                    decimals,
                )?;
            }
            bonded_registry::cpi::decrement_open_jobs(
                CpiContext::new_with_signer(ctx.accounts.bonded_registry_program.to_account_info(), MutateOpenJobs { config: ctx.accounts.registry_config.to_account_info(), agent_stake: ctx.accounts.agent_stake.to_account_info(), dag_authority: ctx.accounts.dag_authority.to_account_info() }, dsigner),
                true,
            )?;
            reputation_bridge::cpi::record_completion(
                CpiContext::new_with_signer(ctx.accounts.reputation_bridge_program.to_account_info(), RecordOutcome { bridge_config: ctx.accounts.bridge_config.to_account_info(), agent_reputation: ctx.accounts.agent_reputation.to_account_info(), job_record: ctx.accounts.job_record.to_account_info(), agent: ctx.accounts.agent.to_account_info(), dag_authority: ctx.accounts.dag_authority.to_account_info(), payer: ctx.accounts.facilitator.to_account_info(), system_program: ctx.accounts.system_program.to_account_info() }, dsigner),
                job_id,
                score_delta,
            )?;
            ctx.accounts.node.status = NodeStatus::Settled;
            let pipeline = &mut ctx.accounts.pipeline;
            pipeline.nodes_settled = pipeline.nodes_settled.saturating_add(1);
            pipeline.settled_mask |= 1u64 << node_index;
            if pipeline.nodes_settled == pipeline.total_nodes {
                pipeline.status = PipelineStatus::Completed;
            } else if pipeline.nodes_settled + pipeline.nodes_expired == pipeline.total_nodes {
                pipeline.status = PipelineStatus::PartiallyRefunded;
            }
        }
        ctx.accounts.node.settled_at_slot = clock.slot;
        emit!(NodeResolved { pipeline: ctx.accounts.pipeline.key(), node_index, agent: agent_key, upheld });
        Ok(())
    }

    /// Permissionless expiry of an overdue node. Cascades expiry to all
    /// downstream (still-pending) nodes and refunds the consumer in one tx.
    /// If the target node was claimed, slashes its agent and records a failure.
    pub fn expire_node<'info>(
        ctx: Context<'_, '_, '_, 'info, ExpireNode<'info>>,
        node_index: u8,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let pipeline_key = ctx.accounts.pipeline.key();

        let (was_claimed, target_alloc, job_id, agent_key) = {
            let node = &ctx.accounts.node;
            require!(node.node_index == node_index, DagError::InvalidNodeAccount);
            require!(
                node.status == NodeStatus::Pending || node.status == NodeStatus::Claimed,
                DagError::NodeNotExpirable
            );
            require!(clock.slot > node.deadline_slot, DagError::DeadlineNotPassed);
            (
                node.status == NodeStatus::Claimed,
                node.allocation_usdc,
                node.job_id,
                node.agent,
            )
        };

        // Build the expired set (target + transitively-dependent pending nodes).
        let mut expired_bits: u64 = 1u64 << node_index;
        let mut refund_total: u64 = target_alloc;
        let mut expired_count: u32 = 1;

        // Fixpoint over the downstream node accounts (remaining_accounts).
        loop {
            let mut changed = false;
            for acc in ctx.remaining_accounts.iter() {
                let mut data = acc.try_borrow_mut_data()?;
                let mut node: PipelineNode = PipelineNode::try_deserialize(&mut &data[..])?;
                require!(node.pipeline == pipeline_key, DagError::InvalidNodeAccount);
                let bit = 1u64 << node.node_index;
                if expired_bits & bit != 0 {
                    continue; // already handled
                }
                if node.status == NodeStatus::Pending && (node.dependency_mask & expired_bits) != 0 {
                    node.status = NodeStatus::Expired;
                    node.try_serialize(&mut &mut data[..])?;
                    expired_bits |= bit;
                    refund_total = refund_total
                        .checked_add(node.allocation_usdc)
                        .ok_or(DagError::MathOverflow)?;
                    expired_count += 1;
                    changed = true;
                }
            }
            if !changed {
                break;
            }
        }

        // Mark the target expired.
        {
            let node = &mut ctx.accounts.node;
            node.status = NodeStatus::Expired;
        }

        // Refund all expired allocations to the consumer.
        let consumer = ctx.accounts.pipeline.consumer;
        let nonce = ctx.accounts.pipeline.nonce.to_le_bytes();
        let pbump = ctx.accounts.pipeline.bump;
        let psigner: &[&[&[u8]]] =
            &[&[b"pipeline", consumer.as_ref(), nonce.as_ref(), &[pbump]]];
        let decimals = ctx.accounts.stake_mint.decimals;
        if refund_total > 0 {
            token::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.vault.to_account_info(),
                        mint: ctx.accounts.stake_mint.to_account_info(),
                        to: ctx.accounts.consumer_token_account.to_account_info(),
                        authority: ctx.accounts.pipeline.to_account_info(),
                    },
                    psigner,
                ),
                refund_total,
                decimals,
            )?;
        }

        {
            let pipeline = &mut ctx.accounts.pipeline;
            pipeline.nodes_expired = pipeline.nodes_expired.saturating_add(expired_count as u8);
            if pipeline.nodes_settled + pipeline.nodes_expired >= pipeline.total_nodes {
                pipeline.status = PipelineStatus::PartiallyRefunded;
            } else {
                pipeline.status = PipelineStatus::PartiallyRefunded;
            }
        }

        // If the target node was claimed, slash the agent + record the failure.
        if was_claimed {
            let dbump = ctx.accounts.pipeline_config.dag_authority_bump;
            let dsigner: &[&[&[u8]]] = &[&[b"dag_authority", &[dbump]]];

            let registry_config = ctx
                .accounts
                .registry_config
                .as_ref()
                .ok_or(DagError::MissingSlashAccounts)?;
            let agent_stake = ctx
                .accounts
                .agent_stake
                .as_ref()
                .ok_or(DagError::MissingSlashAccounts)?;
            let agent_stake_vault = ctx
                .accounts
                .agent_stake_vault
                .as_ref()
                .ok_or(DagError::MissingSlashAccounts)?;
            let br_program = ctx
                .accounts
                .bonded_registry_program
                .as_ref()
                .ok_or(DagError::MissingSlashAccounts)?;

            // decrement_open_jobs(settled = false)
            bonded_registry::cpi::decrement_open_jobs(
                CpiContext::new_with_signer(
                    br_program.to_account_info(),
                    MutateOpenJobs {
                        config: registry_config.to_account_info(),
                        agent_stake: agent_stake.to_account_info(),
                        dag_authority: ctx.accounts.dag_authority.to_account_info(),
                    },
                    dsigner,
                ),
                false,
            )?;

            // slash_stake → penalty to consumer.
            let slash_bps = registry_config.slash_bps;
            bonded_registry::cpi::slash_stake(
                CpiContext::new_with_signer(
                    br_program.to_account_info(),
                    BrSlashStake {
                        config: registry_config.to_account_info(),
                        agent_stake: agent_stake.to_account_info(),
                        stake_mint: ctx.accounts.stake_mint.to_account_info(),
                        vault: agent_stake_vault.to_account_info(),
                        consumer_token_account: ctx
                            .accounts
                            .consumer_token_account
                            .to_account_info(),
                        dag_authority: ctx.accounts.dag_authority.to_account_info(),
                        token_program: ctx.accounts.token_program.to_account_info(),
                    },
                    dsigner,
                ),
                job_id,
                slash_bps,
            )?;

            // record_failure on the reputation bridge.
            let bridge_config = ctx
                .accounts
                .bridge_config
                .as_ref()
                .ok_or(DagError::MissingSlashAccounts)?;
            let agent_reputation = ctx
                .accounts
                .agent_reputation
                .as_ref()
                .ok_or(DagError::MissingSlashAccounts)?;
            let job_record = ctx
                .accounts
                .job_record
                .as_ref()
                .ok_or(DagError::MissingSlashAccounts)?;
            let agent = ctx
                .accounts
                .agent
                .as_ref()
                .ok_or(DagError::MissingSlashAccounts)?;
            let rb_program = ctx
                .accounts
                .reputation_bridge_program
                .as_ref()
                .ok_or(DagError::MissingSlashAccounts)?;

            reputation_bridge::cpi::record_failure(
                CpiContext::new_with_signer(
                    rb_program.to_account_info(),
                    RecordOutcome {
                        bridge_config: bridge_config.to_account_info(),
                        agent_reputation: agent_reputation.to_account_info(),
                        job_record: job_record.to_account_info(),
                        agent: agent.to_account_info(),
                        dag_authority: ctx.accounts.dag_authority.to_account_info(),
                        payer: ctx.accounts.caller.to_account_info(),
                        system_program: ctx.accounts.system_program.to_account_info(),
                    },
                    dsigner,
                ),
                job_id,
            )?;

            let _ = agent_key;
        }

        emit!(NodeExpired {
            pipeline: pipeline_key,
            node_index,
            refund_amount: refund_total,
            slashed: was_claimed,
        });
        Ok(())
    }

    /// Consumer cancels a pipeline that has no claimed/settled nodes, recovering
    /// the full vault. Node accounts (remaining_accounts) are closed to consumer.
    pub fn cancel_pipeline<'info>(
        ctx: Context<'_, '_, '_, 'info, CancelPipeline<'info>>,
    ) -> Result<()> {
        require!(
            ctx.accounts.pipeline.status == PipelineStatus::Active,
            DagError::PipelineNotActive
        );

        // All nodes must be Pending.
        for acc in ctx.remaining_accounts.iter() {
            let data = acc.try_borrow_data()?;
            let node: PipelineNode = PipelineNode::try_deserialize(&mut &data[..])?;
            require!(node.pipeline == ctx.accounts.pipeline.key(), DagError::InvalidNodeAccount);
            require!(node.status == NodeStatus::Pending, DagError::PipelineHasActivity);
        }

        let amount = ctx.accounts.vault.amount;
        let consumer = ctx.accounts.pipeline.consumer;
        let nonce = ctx.accounts.pipeline.nonce.to_le_bytes();
        let pbump = ctx.accounts.pipeline.bump;
        let psigner: &[&[&[u8]]] =
            &[&[b"pipeline", consumer.as_ref(), nonce.as_ref(), &[pbump]]];

        if amount > 0 {
            token::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.vault.to_account_info(),
                        mint: ctx.accounts.stake_mint.to_account_info(),
                        to: ctx.accounts.consumer_token_account.to_account_info(),
                        authority: ctx.accounts.pipeline.to_account_info(),
                    },
                    psigner,
                ),
                amount,
                ctx.accounts.stake_mint.decimals,
            )?;
        }

        // Close node accounts, returning rent to the consumer.
        for acc in ctx.remaining_accounts.iter() {
            let dest = ctx.accounts.consumer.to_account_info();
            let rent = **acc.lamports.borrow();
            **acc.lamports.borrow_mut() = 0;
            **dest.lamports.borrow_mut() = dest
                .lamports()
                .checked_add(rent)
                .ok_or(DagError::MathOverflow)?;
            let mut data = acc.try_borrow_mut_data()?;
            for b in data.iter_mut() {
                *b = 0;
            }
        }

        ctx.accounts.pipeline.status = PipelineStatus::Cancelled;
        emit!(PipelineCancelled {
            pipeline: ctx.accounts.pipeline.key(),
            refund_amount: amount,
        });
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct NodeConfig {
    pub allocation_usdc: u64,
    pub deadline_slots_from_now: u64,
    pub dependency_mask: u64,
    pub required_tier: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum PipelineStatus {
    Active,
    Completed,
    PartiallyRefunded,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum NodeStatus {
    Pending,
    Claimed,
    /// Completion submitted by the facilitator; in the dispute window, not yet paid.
    Submitted,
    /// Consumer challenged the submission; awaits arbiter resolution.
    Disputed,
    Settled,
    Expired,
}

#[account]
#[derive(InitSpace)]
pub struct PipelineConfig {
    pub operator: Pubkey,
    pub facilitator_authority: Pubkey,
    pub fee_bps: u16,
    pub dag_authority_bump: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Pipeline {
    pub consumer: Pubkey,
    pub total_nodes: u8,
    pub total_usdc_locked: u64,
    pub nodes_settled: u8,
    pub nodes_expired: u8,
    pub status: PipelineStatus,
    pub nonce: u64,
    pub stake_mint: Pubkey,
    pub settled_mask: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PipelineNode {
    pub pipeline: Pubkey,
    pub node_index: u8,
    pub agent: Pubkey,
    pub allocation_usdc: u64,
    pub deadline_slot: u64,
    pub dependency_mask: u64,
    pub status: NodeStatus,
    pub settled_at_slot: u64,
    pub job_id: [u8; 32],
    pub required_tier: u8,
    pub bump: u8,
}

/// Companion account for the optimistic-settlement / dispute flow, created at
/// submit_completion and closed at finalize/resolve. Kept separate so PipelineNode
/// keeps its on-chain layout (no migration of existing nodes).
#[account]
#[derive(InitSpace)]
pub struct NodeSettlement {
    pub node: Pubkey,
    /// sha256 of the delivered output bytes. Anyone can fetch `uri`, recompute
    /// sha256, and prove a mismatch — this is what makes a dispute objective.
    pub result_hash: [u8; 32],
    /// Content-addressed retrieval pointer for the delivered output (IPFS CID,
    /// Arweave id, or https URL). Fixed buffer keeps INIT_SPACE exact; `uri_len`
    /// is the meaningful prefix length.
    pub uri: [u8; 96],
    pub uri_len: u8,
    pub submitted_at_slot: u64,
    pub score_delta: i16,
    pub disputed: bool,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct SetFacilitatorAuthority<'info> {
    #[account(mut, seeds = [b"pipeline_config"], bump = pipeline_config.bump, has_one = operator)]
    pub pipeline_config: Account<'info, PipelineConfig>,
    pub operator: Signer<'info>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = operator,
        space = 8 + PipelineConfig::INIT_SPACE,
        seeds = [b"pipeline_config"],
        bump
    )]
    pub pipeline_config: Account<'info, PipelineConfig>,
    #[account(mut)]
    pub operator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(node_configs: Vec<NodeConfig>, nonce: u64)]
pub struct CreatePipeline<'info> {
    #[account(
        init,
        payer = consumer,
        space = 8 + Pipeline::INIT_SPACE,
        seeds = [b"pipeline", consumer.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump
    )]
    pub pipeline: Account<'info, Pipeline>,
    #[account(mut)]
    pub consumer: Signer<'info>,
    pub stake_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = stake_mint,
        associated_token::authority = consumer
    )]
    pub consumer_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = consumer,
        associated_token::mint = stake_mint,
        associated_token::authority = pipeline
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    // remaining_accounts: the N node PDAs (writable, uninitialized).
}

#[derive(Accounts)]
#[instruction(node_index: u8)]
pub struct ClaimNode<'info> {
    #[account(seeds = [b"pipeline_config"], bump = pipeline_config.bump)]
    pub pipeline_config: Account<'info, PipelineConfig>,
    #[account(mut)]
    pub pipeline: Account<'info, Pipeline>,
    #[account(
        mut,
        seeds = [b"node", pipeline.key().as_ref(), &[node_index]],
        bump = node.bump
    )]
    pub node: Account<'info, PipelineNode>,
    pub agent: Signer<'info>,
    #[account(mut)]
    pub agent_stake: Account<'info, bonded_registry::AgentStake>,
    pub registry_config: Account<'info, bonded_registry::RegistryConfig>,
    /// CHECK: dag_authority PDA, verified by seeds; signs the CPI.
    #[account(seeds = [b"dag_authority"], bump = pipeline_config.dag_authority_bump)]
    pub dag_authority: UncheckedAccount<'info>,
    pub bonded_registry_program: Program<'info, BondedRegistry>,
}

#[derive(Accounts)]
#[instruction(node_index: u8)]
pub struct CompleteNode<'info> {
    #[account(seeds = [b"pipeline_config"], bump = pipeline_config.bump)]
    pub pipeline_config: Account<'info, PipelineConfig>,
    #[account(mut)]
    pub pipeline: Account<'info, Pipeline>,
    #[account(
        mut,
        seeds = [b"node", pipeline.key().as_ref(), &[node_index]],
        bump = node.bump
    )]
    pub node: Account<'info, PipelineNode>,
    #[account(mut)]
    pub facilitator: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = stake_mint,
        associated_token::authority = pipeline
    )]
    pub vault: Account<'info, TokenAccount>,
    pub stake_mint: Account<'info, Mint>,
    /// CHECK: agent identity; verified against node.agent.
    pub agent: UncheckedAccount<'info>,
    #[account(mut)]
    pub agent_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = operator_treasury.owner == pipeline_config.operator @ DagError::InvalidTreasury
    )]
    pub operator_treasury: Account<'info, TokenAccount>,
    /// CHECK: dag_authority PDA, verified by seeds; signs CPIs.
    #[account(seeds = [b"dag_authority"], bump = pipeline_config.dag_authority_bump)]
    pub dag_authority: UncheckedAccount<'info>,
    // bonded_registry
    #[account(mut)]
    pub registry_config: Account<'info, bonded_registry::RegistryConfig>,
    #[account(mut)]
    pub agent_stake: Account<'info, bonded_registry::AgentStake>,
    pub bonded_registry_program: Program<'info, BondedRegistry>,
    // reputation_bridge
    /// CHECK: bridge config, validated by reputation_bridge CPI.
    #[account(mut)]
    pub bridge_config: UncheckedAccount<'info>,
    /// CHECK: agent reputation PDA, created/validated by reputation_bridge CPI.
    #[account(mut)]
    pub agent_reputation: UncheckedAccount<'info>,
    /// CHECK: job record PDA, created/validated by reputation_bridge CPI.
    #[account(mut)]
    pub job_record: UncheckedAccount<'info>,
    pub reputation_bridge_program: Program<'info, ReputationBridge>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(node_index: u8)]
pub struct SubmitCompletion<'info> {
    #[account(seeds = [b"pipeline_config"], bump = pipeline_config.bump)]
    pub pipeline_config: Account<'info, PipelineConfig>,
    pub pipeline: Account<'info, Pipeline>,
    #[account(mut, seeds = [b"node", pipeline.key().as_ref(), &[node_index]], bump = node.bump)]
    pub node: Account<'info, PipelineNode>,
    #[account(mut)]
    pub facilitator: Signer<'info>,
    /// CHECK: agent identity; verified against node.agent.
    pub agent: UncheckedAccount<'info>,
    #[account(init, payer = facilitator, space = 8 + NodeSettlement::INIT_SPACE, seeds = [b"settlement", node.key().as_ref()], bump)]
    pub settlement: Account<'info, NodeSettlement>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(node_index: u8)]
pub struct DisputeNode<'info> {
    #[account(has_one = consumer)]
    pub pipeline: Account<'info, Pipeline>,
    #[account(mut, seeds = [b"node", pipeline.key().as_ref(), &[node_index]], bump = node.bump)]
    pub node: Account<'info, PipelineNode>,
    #[account(mut, seeds = [b"settlement", node.key().as_ref()], bump = settlement.bump)]
    pub settlement: Account<'info, NodeSettlement>,
    pub consumer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(node_index: u8)]
pub struct FinalizeNode<'info> {
    #[account(seeds = [b"pipeline_config"], bump = pipeline_config.bump)]
    pub pipeline_config: Box<Account<'info, PipelineConfig>>,
    #[account(mut)]
    pub pipeline: Box<Account<'info, Pipeline>>,
    #[account(mut, seeds = [b"node", pipeline.key().as_ref(), &[node_index]], bump = node.bump)]
    pub node: Box<Account<'info, PipelineNode>>,
    #[account(mut, seeds = [b"settlement", node.key().as_ref()], bump = settlement.bump, close = caller)]
    pub settlement: Box<Account<'info, NodeSettlement>>,
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(mut, associated_token::mint = stake_mint, associated_token::authority = pipeline)]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub stake_mint: Box<Account<'info, Mint>>,
    /// CHECK: agent identity; verified against node.agent.
    pub agent: UncheckedAccount<'info>,
    #[account(mut)]
    pub agent_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = operator_treasury.owner == pipeline_config.operator @ DagError::InvalidTreasury)]
    pub operator_treasury: Box<Account<'info, TokenAccount>>,
    /// CHECK: dag_authority PDA, verified by seeds; signs CPIs.
    #[account(seeds = [b"dag_authority"], bump = pipeline_config.dag_authority_bump)]
    pub dag_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub registry_config: Box<Account<'info, bonded_registry::RegistryConfig>>,
    #[account(mut)]
    pub agent_stake: Box<Account<'info, bonded_registry::AgentStake>>,
    pub bonded_registry_program: Program<'info, BondedRegistry>,
    /// CHECK: bridge config, validated by reputation_bridge CPI.
    #[account(mut)]
    pub bridge_config: UncheckedAccount<'info>,
    /// CHECK: agent reputation PDA.
    #[account(mut)]
    pub agent_reputation: UncheckedAccount<'info>,
    /// CHECK: job record PDA.
    #[account(mut)]
    pub job_record: UncheckedAccount<'info>,
    pub reputation_bridge_program: Program<'info, ReputationBridge>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(node_index: u8)]
pub struct ResolveDispute<'info> {
    #[account(seeds = [b"pipeline_config"], bump = pipeline_config.bump)]
    pub pipeline_config: Box<Account<'info, PipelineConfig>>,
    #[account(mut)]
    pub pipeline: Box<Account<'info, Pipeline>>,
    #[account(mut, seeds = [b"node", pipeline.key().as_ref(), &[node_index]], bump = node.bump)]
    pub node: Box<Account<'info, PipelineNode>>,
    #[account(mut, seeds = [b"settlement", node.key().as_ref()], bump = settlement.bump, close = facilitator)]
    pub settlement: Box<Account<'info, NodeSettlement>>,
    #[account(mut)]
    pub facilitator: Signer<'info>,
    #[account(mut, associated_token::mint = stake_mint, associated_token::authority = pipeline)]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub stake_mint: Box<Account<'info, Mint>>,
    /// CHECK: agent identity; verified against node.agent.
    pub agent: UncheckedAccount<'info>,
    #[account(mut)]
    pub agent_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = operator_treasury.owner == pipeline_config.operator @ DagError::InvalidTreasury)]
    pub operator_treasury: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = consumer_token_account.owner == pipeline.consumer @ DagError::InvalidConsumerAccount)]
    pub consumer_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: dag_authority PDA, verified by seeds; signs CPIs.
    #[account(seeds = [b"dag_authority"], bump = pipeline_config.dag_authority_bump)]
    pub dag_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub registry_config: Box<Account<'info, bonded_registry::RegistryConfig>>,
    #[account(mut)]
    pub agent_stake: Box<Account<'info, bonded_registry::AgentStake>>,
    #[account(mut)]
    pub agent_stake_vault: Box<Account<'info, TokenAccount>>,
    pub bonded_registry_program: Program<'info, BondedRegistry>,
    /// CHECK: bridge config, validated by reputation_bridge CPI.
    #[account(mut)]
    pub bridge_config: UncheckedAccount<'info>,
    /// CHECK: agent reputation PDA.
    #[account(mut)]
    pub agent_reputation: UncheckedAccount<'info>,
    /// CHECK: job record PDA.
    #[account(mut)]
    pub job_record: UncheckedAccount<'info>,
    pub reputation_bridge_program: Program<'info, ReputationBridge>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(node_index: u8)]
pub struct ExpireNode<'info> {
    #[account(seeds = [b"pipeline_config"], bump = pipeline_config.bump)]
    pub pipeline_config: Account<'info, PipelineConfig>,
    #[account(mut)]
    pub pipeline: Account<'info, Pipeline>,
    #[account(
        mut,
        seeds = [b"node", pipeline.key().as_ref(), &[node_index]],
        bump = node.bump
    )]
    pub node: Account<'info, PipelineNode>,
    #[account(
        mut,
        associated_token::mint = stake_mint,
        associated_token::authority = pipeline
    )]
    pub vault: Account<'info, TokenAccount>,
    pub stake_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = consumer_token_account.owner == pipeline.consumer @ DagError::InvalidConsumerAccount
    )]
    pub consumer_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub caller: Signer<'info>,
    /// CHECK: dag_authority PDA, verified by seeds; signs CPIs.
    #[account(seeds = [b"dag_authority"], bump = pipeline_config.dag_authority_bump)]
    pub dag_authority: UncheckedAccount<'info>,
    // Optional slash/reputation accounts — required only if target was Claimed.
    #[account(mut)]
    pub registry_config: Option<Account<'info, bonded_registry::RegistryConfig>>,
    #[account(mut)]
    pub agent_stake: Option<Account<'info, bonded_registry::AgentStake>>,
    #[account(mut)]
    pub agent_stake_vault: Option<Account<'info, TokenAccount>>,
    pub bonded_registry_program: Option<Program<'info, BondedRegistry>>,
    /// CHECK: bridge config, validated by reputation_bridge CPI.
    #[account(mut)]
    pub bridge_config: Option<UncheckedAccount<'info>>,
    /// CHECK: agent reputation PDA, validated by reputation_bridge CPI.
    #[account(mut)]
    pub agent_reputation: Option<UncheckedAccount<'info>>,
    /// CHECK: job record PDA, created by reputation_bridge CPI.
    #[account(mut)]
    pub job_record: Option<UncheckedAccount<'info>>,
    /// CHECK: agent identity for the failed job.
    pub agent: Option<UncheckedAccount<'info>>,
    pub reputation_bridge_program: Option<Program<'info, ReputationBridge>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    // remaining_accounts: all downstream node PDAs (writable).
}

#[derive(Accounts)]
pub struct CancelPipeline<'info> {
    #[account(mut, has_one = consumer)]
    pub pipeline: Account<'info, Pipeline>,
    #[account(mut)]
    pub consumer: Signer<'info>,
    pub stake_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = stake_mint,
        associated_token::authority = pipeline
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = stake_mint,
        associated_token::authority = consumer
    )]
    pub consumer_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    // remaining_accounts: all node PDAs (writable), closed to consumer.
}

#[event]
pub struct PipelineCreated {
    pub pipeline: Pubkey,
    pub consumer: Pubkey,
    pub total_nodes: u8,
    pub total_usdc_locked: u64,
}

#[event]
pub struct NodeClaimed {
    pub pipeline: Pubkey,
    pub node_index: u8,
    pub agent: Pubkey,
    pub job_id: [u8; 32],
}

#[event]
pub struct NodeSettled {
    pub pipeline: Pubkey,
    pub node_index: u8,
    pub agent: Pubkey,
    pub paid: u64,
    pub fee: u64,
    /// Agent-committed commitment to the delivered output (proof-of-delivery step).
    pub result_hash: [u8; 32],
}

#[event]
pub struct NodeExpired {
    pub pipeline: Pubkey,
    pub node_index: u8,
    pub refund_amount: u64,
    pub slashed: bool,
}

#[event]
pub struct PipelineCancelled {
    pub pipeline: Pubkey,
    pub refund_amount: u64,
}

#[event]
pub struct NodeSubmitted {
    pub pipeline: Pubkey,
    pub node_index: u8,
    pub agent: Pubkey,
    pub result_hash: [u8; 32],
    pub uri: [u8; 96],
    pub uri_len: u8,
    pub dispute_until: u64,
}

#[event]
pub struct NodeDisputed {
    pub pipeline: Pubkey,
    pub node_index: u8,
    pub reason_hash: [u8; 32],
    pub reason_code: u8,
}

#[event]
pub struct NodeResolved {
    pub pipeline: Pubkey,
    pub node_index: u8,
    pub agent: Pubkey,
    pub upheld: bool,
}

#[error_code]
pub enum DagError {
    #[msg("Fee BPS exceeds 100%")]
    InvalidFeeBps,
    #[msg("Node count must be between 1 and 16")]
    InvalidNodeCount,
    #[msg("Number of node accounts does not match node configs")]
    NodeAccountMismatch,
    #[msg("Dependency graph contains a cycle or forward edge")]
    InvalidDag,
    #[msg("Pipeline allocation must be greater than zero")]
    EmptyPipeline,
    #[msg("Provided node account does not match expected PDA")]
    InvalidNodeAccount,
    #[msg("Pipeline is not active")]
    PipelineNotActive,
    #[msg("Node is not in a claimable state")]
    NodeNotClaimable,
    #[msg("Node dependencies are not all settled")]
    DependenciesNotMet,
    #[msg("Agent does not match the stake account")]
    AgentMismatch,
    #[msg("Agent tier is insufficient for this node")]
    TierInsufficient,
    #[msg("Caller is not the configured facilitator")]
    UnauthorizedFacilitator,
    #[msg("Caller is not the configured arbiter")]
    UnauthorizedArbiter,
    #[msg("Node is not in the Submitted state")]
    NodeNotSubmitted,
    #[msg("Node is not in the Disputed state")]
    NodeNotDisputed,
    #[msg("Dispute window is still open")]
    DisputeWindowOpen,
    #[msg("Dispute window has closed")]
    DisputeWindowClosed,
    #[msg("Node is already disputed")]
    NodeAlreadyDisputed,
    #[msg("Node is not claimed")]
    NodeNotClaimed,
    #[msg("Node cannot be expired in its current state")]
    NodeNotExpirable,
    #[msg("Node deadline has not passed")]
    DeadlineNotPassed,
    #[msg("Missing accounts required to slash a claimed node")]
    MissingSlashAccounts,
    #[msg("Operator treasury account has wrong owner")]
    InvalidTreasury,
    #[msg("Consumer token account has wrong owner")]
    InvalidConsumerAccount,
    #[msg("Delivery URI length exceeds 96-byte buffer")]
    InvalidUri,
    #[msg("Pipeline has claimed or settled nodes")]
    PipelineHasActivity,
    #[msg("Math overflow")]
    MathOverflow,
}
