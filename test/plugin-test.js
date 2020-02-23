/*!
 * plugin-test.js - plugin test
 * Copyright (c) 2020, Mark Tyneway (MIT License).
 * https://github.com/tynes/hsd-auction-notify
 */

const assert = require('bsert');
const FullNode = require('hsd/lib/node/fullnode');
const {NodeClient, WalletClient} = require('hs-client');
const AuctionNotifyClient = require('../lib/client');
const common = require('./util/common');
const rules = require('hsd/lib/covenants/rules');
const Network = require('hsd/lib/protocol/network');
const {decorate} = require('../lib/util');

const network = decorate(Network.get('regtest'));

const aclient = new AuctionNotifyClient({
  network: 'regtest',
  port: network.auctionNotifyPort
});

const nclient = new NodeClient({
  network: 'regtest',
  port: network.rpcPort
});

const wclient = new WalletClient({
  network: 'regtest',
  port: network.walletPort
});

const wallet = wclient.wallet('primary');

/**
 * Mine some blocks
 * Bid on a name
 * Make sure that bid is indexed
 * Mine some blocks
 * Reveal name
 * Make sure that reveal is indexed
 *
 * Bid, forget to reveal
 *
 */

let addr, name, node;
describe('Plugin', function() {
  before(async () => {
    node = new FullNode({
      network: 'regtest',
      memory: true,
      plugins: [
        require('hsd/lib/wallet/plugin'),
        require('../lib/plugin')
      ]
    });

    await node.open();
    await aclient.open();

    addr = node.miner.addresses[0].toString('regtest');
  });

  after(async () => {
    await aclient.close();
    await node.close();
  });

  afterEach(async () => {
    name = null;
  });

  it('should index a bid', async () => {
    name = await nclient.execute('grindname', [3]);
    assert(typeof name === 'string');

    let count = 0;
    function cb (data) {
      count++;
    }
    aclient.bind('bid', cb);

    await mineBlocks(3, addr)

    await wallet.createOpen({
      name: name
    });

    await mineBlocks(1, addr)

    await mineBlocks(node.network.names.treeInterval, addr);

    const tx = await wallet.createBid({
      name,
      bid: 1000,
      lockup: 2000
    });

    await mineBlocks(1, addr);

    const info = await aclient.getNotifyName(name);
    assert.equal(info.bids.length, 1);
    assert.equal(info.reveals.length, 0);

    const bid = info.bids[0];

    assert.strictEqual(tx.hash, bid.hash);

    const index = 0;
    const output = tx.outputs[index];
    assert.equal(output.covenant.type, rules.types.BID);
    assert.strictEqual(index, bid.index);

    assert.equal(count, 1);
    aclient.socket.unbind('bid', cb);
  });


  it('should index a reveal', async () => {
    name = await nclient.execute('grindname', [3]);
    assert(typeof name === 'string');

    let count = 0;
    function cb (data) {
      count++;
    }
    aclient.bind('reveal', cb);

    await mineBlocks(3, addr)

    await wallet.createOpen({
      name: name
    });

    await mineBlocks(1, addr)

    await mineBlocks(node.network.names.treeInterval, addr);

    await wallet.createBid({
      name,
      bid: 1000,
      lockup: 2000
    });

    await mineBlocks(node.network.names.biddingPeriod, addr);

    const tx = await wallet.createReveal({
      name
    });

    await mineBlocks(node.network.names.revealPeriod, addr);

    const info = await aclient.getNotifyName(name);
    assert.equal(info.bids.length, 1);
    assert.equal(info.reveals.length, 1);

    const reveal = info.reveals[0];
    assert.strictEqual(tx.hash, reveal.hash);

    const index = 0;
    const output = tx.outputs[index];
    assert.equal(output.covenant.type, rules.types.REVEAL);
    assert.strictEqual(index, reveal.index);

    assert.equal(count, 1);
    aclient.socket.unbind('reveal', cb);
  });

  it('should index multiple bids and reveals', async () => {
    const names = [];

    for (let i = 0; i < 3; i++)
      names.push(await nclient.execute('grindname', [3]));

    await mineBlocks(3, addr)

    for (const name of names) {
      await wallet.createOpen({
        name: name
      });
    }

    await mineBlocks(1, addr);
    await mineBlocks(node.network.names.treeInterval, addr);

    for (const name of names) {
      for (let i = 1; i <= 3; i++) {
        await wallet.createBid({
          name,
          bid: (i * 1000),
          lockup: (i * 2000)
        });
      }
    }

    await mineBlocks(1, addr);
    await mineBlocks(node.network.names.biddingPeriod, addr);

    for (const name of names) {
      await wallet.createReveal({
        name
      });
    }

    await mineBlocks(node.network.names.revealPeriod, addr);

    let seen = 0;
    for (const name of names) {
      const info = await aclient.getNotifyName(name);
      assert.equal(info.bids.length, 3);
      assert.equal(info.reveals.length, 3);
      seen++;
    }

    assert.equal(seen, names.length);
  });

  it('should index multiple names', async () => {
    name = await nclient.execute('grindname', [3]);
    assert(typeof name === 'string');

    await mineBlocks(3, addr)

    await wallet.createOpen({
      name: name
    });

    await mineBlocks(1, addr);
    await mineBlocks(node.network.names.treeInterval, addr);

    for (let i = 1; i <= 5; i++) {
      await wallet.createBid({
        name,
        bid: (i * 1000),
        lockup: (i * 2000)
      });
    }

    await mineBlocks(1, addr);
    await mineBlocks(node.network.names.biddingPeriod, addr);

    // All reveals will be included in the tx
    await wallet.createReveal({
      name
    });

    await mineBlocks(node.network.names.revealPeriod, addr);

    const info = await aclient.getNotifyName(name);
    assert.equal(info.bids.length, 5);
    assert.equal(info.reveals.length, 5);
  });
});

// take into account race conditions
async function mineBlocks(count, address) {
  for (let i = 0; i < count; i++) {
    const obj = { complete: false };
    node.once('block', () => {
      obj.complete = true;
    });
    await nclient.execute('generatetoaddress', [1, address]);
    await common.forValue(obj, 'complete', true);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
