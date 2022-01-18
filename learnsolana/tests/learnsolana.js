const anchor = require('@project-serum/anchor');
const { SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const expect = require('chai').expect;
const BN = require('bn.js');


describe('learnsolana', () => {

  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const mainProgram = anchor.workspace.Learnsolana;

  function programForUser(user) {
    return new anchor.Program(mainProgram.idl, mainProgram.programId, user.provider);
  }

  async function createUser(airdropBalance) {
    airdropBalance = airdropBalance ?? 10 * LAMPORTS_PER_SOL;
    let user = anchor.web3.Keypair.generate();
    let sig = await provider.connection.requestAirdrop(user.publicKey, airdropBalance);
    await provider.connection.confirmTransaction(sig);

    let wallet = new anchor.Wallet(user);
    let userProvider = new anchor.Provider(provider.connection, wallet, provider.opts);

    return {
      key: user,
      wallet,
      provider: userProvider,
    };
  }

  function createUsers(numUsers) {
    let promises = [];
    for (let i = 0; i < numUsers; i++) {
      promises.push(createUsers());
    }

    return Promise.all(promises);
  }

  async function getAccountBalance(pubkey) {
    let account = await provider.connection.getAccountInfo(pubkey);
    return account?.lamports ?? 0;
  }

  async function createPool(owner, name, capacity = 16) {
    const [poolAccount, bump] = await anchor.web3.PublicKey.findProgramAddress([
      "pool",
      owner.key.publicKey.toBytes(),
      name.slice(0, 32)
    ], mainProgram.programId);

    let program = programForUser(owner);
    await program.rpc.newPool(name, capacity, bump, {
      accounts: {
        pool: poolAccount,
        user: owner.key.publicKey,
        systemProgram: SystemProgram.programId,
      },
    });

    let pool = await program.account.pool.fetch(poolAccount);
    return { publicKey: poolAccount, data: pool };
  }

  async function payPool(pool, adder, owner, payment) {
    let program = programForUser(adder);
    await program.rpc.payPool(pool.data.name, new BN(payment), {
      accounts: {
        pool: pool.publicKey,
        poolOwner: owner.key.PublicKey, //pool.data.pool_owner,
        user: adder.key.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [
        adder.key,
        owner.key,
      ],
    });

    let poolData = await program.account.pool.fetch(pool.publicKey);

    return {
      pool: {
        publicKey: pool.publicKey,
        data: poolData,
      }
    }
  }

  describe('new pool', () => {
    it('creates a pool', async () => {
      const owner = await createUser();
      let pool = await createPool(owner, 'A pool');

      //expect(pool.data.poolOwner.toString(), 'Pool owner is set').equals(owner.key.publicKey.toString());
      expect(pool.data.name, 'Pool name is set').equals('A pool');
      expect(pool.data.payers.length, 'Pool has no payers').equals(0);
      //expect(await getAccountBalance(pool.publicKey), 'Pool account balance').equals(0);
    });
  });

  describe('pay pool', () => {
    it('Anyone can pay pool', async () => {
      //const [owner, adder] = await createUsers(2);
      const adder = await createUser();
      const owner = await createUser();

      const adderStartingBalance = await getAccountBalance(adder.key.publicKey);
      const pool = await createPool(owner, 'pool');
      const result = await payPool(pool, adder, owner, 10000000000);

      expect(result.pool.data.payers, 'Payment added').deep.equals([adder.publicKey]);
      expect(result.pool.payers.length, 'Pool has one payer').equals(1);
      expect(await getAccountBalance(result.pool.publicKey), 'Pool account balance').equals(1 * LAMPORTS_PER_SOL);
    });
  });

});
