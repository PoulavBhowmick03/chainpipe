use anchor_lang::prelude::*;

declare_id!("6RRfs1Ho1bJ3JWXSy3xVth4BTGHWwVwum74ph2LRWWsf");

#[program]
pub mod reputation_bridge {
    use super::*;

    pub fn ping(_ctx: Context<Ping>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Ping<'info> {
    pub payer: Signer<'info>,
}
