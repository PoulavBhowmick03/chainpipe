use anchor_lang::prelude::*;

declare_id!("3FqvkzppD4ciwkGLrcNoTHUCeHwNbWtot18CkrBdXiJd");

#[program]
pub mod dag_escrow {
    use super::*;

    pub fn ping(_ctx: Context<Ping>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Ping<'info> {
    pub payer: Signer<'info>,
}
