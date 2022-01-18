use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod learnsolana {
    use anchor_lang::solana_program::{program::invoke, system_instruction::transfer};

    use super::*;
    pub fn new_pool(ctx: Context<NewPool>, name: String, capacity: u16, account_bump: u8) -> ProgramResult {
        let pool = &mut ctx.accounts.pool;
        pool.pool_owner = *ctx.accounts.user.to_account_info().key;
        pool.bump = account_bump;
        pool.name = name;
        pool.capacity = capacity;
        Ok(())
    }

    pub fn pay_pool(ctx: Context<PayPool>, _pool_name: String, payment: u64,) -> 
    ProgramResult {
        let user = &ctx.accounts.user;
        let pool = &mut ctx.accounts.pool;

        if pool.payers.len() >= pool.capacity as usize {
            return Err(PoolError::PayersFull.into());
        }

        pool.payers.push(*user.to_account_info().key);

       // let account_lamports = **pool.to_account_info().lamports.borrow();

        invoke(
            &transfer(
                user.to_account_info().key,
                pool.to_account_info().key,
                payment,
            ),
            &[
                user.to_account_info(),
                pool.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        Ok(())

    }
}

#[error]
pub enum PoolError {
    #[msg("Payer list is full")]
    PayersFull,
    #[msg("Pool owner is wrong")]
    WrongPoolOwner,
}

fn name_seed(name: &str) -> &[u8] {
    let b = name.as_bytes();
    if b.len() > 32 {
        &b[0..32]
    } else {
        b
    }
}

#[derive(Accounts)]
#[instruction(name: String, capacity: u16, list_bump: u8)]
pub struct NewPool<'info> {
    #[account(init,
        payer=user,
        space=Pool::space(&name, capacity),
        seeds=[
            b"pool",
            user.to_account_info().key.as_ref(),
            name_seed(&name)
        ],
        bump=list_bump)]
    pub pool: Account<'info, Pool>,
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pool_name: String, payment: u64)]
pub struct PayPool<'info>{
    #[account(mut, has_one=pool_owner @ PoolError::WrongPoolOwner, seeds=[b"pool", pool_owner.to_account_info().key.as_ref(), name_seed(&pool_name)], bump=pool.bump)]
    pub pool: Account<'info, Pool>,
    pub pool_owner: AccountInfo<'info>,
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Pool {
    pub pool_owner: Pubkey,
    pub bump: u8,
    pub capacity: u16,
    pub name: String,
    pub payers: Vec<Pubkey>,
}

impl Pool {
    fn space(name: &str, capacity: u16) -> usize {
        //discriminator + owner pubkey + bump + capacity
        8 + 32 + 1 + 2 + 
        //name string
        4 + name.len() +
        //vec of payer pubkeys
        4 + (capacity as usize) * std::mem::size_of::<Pubkey>()
    }
}
