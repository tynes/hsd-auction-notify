/*!
 * db-test.js - AuctionDB test
 * Copyright (c) 2020, Mark Tyneway (MIT License).
 * https://github.com/tynes/hsd-auction-notify
 */

'use strict';

const AuctionDB = require('../lib/auctiondb');
const random = require('bcrypto/lib/random');
const BN = require('bcrypto/lib/bn');
const assert = require('bsert');

let auctiondb;
describe('AuctionDB', function() {
  beforeEach(async () => {
    auctiondb = new AuctionDB({
      memory: true,
    });

    await auctiondb.open();
  });

  afterEach(async () => {
    await auctiondb.wipe();
    await auctiondb.close();
  });

  it('should put/get tip', async () => {
    const hash = random.randomBytes(32);
    await auctiondb.putTip(hash);

    const indexed = await auctiondb.getTip();

    assert.bufferEqual(hash, indexed);
  });

  it('should add bid', async () => {
    const name = 'abcd';
    const outpoint = {
      hash: random.randomBytes(32),
      index: 0
    };

    assert(await auctiondb.addBid(name, outpoint));
    assert(await auctiondb.hasBid(name, outpoint));
  });

  it('should get bid count', async () => {
    const name = 'wert';
    const bids = [];

    for (let i = 0; i < 5; i++) {
      const outpoint = {
        hash: random.randomBytes(32),
        index: i
      };

      bids.push(outpoint);

      await auctiondb.addBid(name, outpoint);
    }

    const count = await auctiondb.getBidCount(name);

    assert.deepEqual(count, new BN(bids.length));
  });

  it('should remove bid', async () => {
    const name = 'floobite';
    const outpoint = {
      hash: random.randomBytes(32),
      index: 0
    };

    assert(await auctiondb.addBid(name, outpoint));
    assert(await auctiondb.hasBid(name, outpoint));

    assert(await auctiondb.removeBid(name, outpoint));
    assert.equal(await auctiondb.hasBid(name, outpoint), false);
  });

  it('should get all bids', async () => {
    const name = 'wert';
    const outpoints = [];

    for (let i = 0; i < 5; i++) {
      const outpoint = {
        hash: random.randomBytes(32),
        index: i
      };

      outpoints.push(outpoint);

      await auctiondb.addBid(name, outpoint);
    }

    const count = await auctiondb.getBidCount(name);
    assert.deepEqual(count, new BN(outpoints.length));

    const bids = await auctiondb.getBids(name);
    assert.strictEqual(outpoints.length, bids.length);

    for (let i = 0; i < bids.length; i++) {
      const target = outpoints.find(o => o.hash.equals(bids[i].hash));
      assert(target);
    }
  });

  it('should has bid', async () => {
    const name = 'abcd';
    const outpoint = {
      hash: random.randomBytes(32),
      index: 0
    };

    assert(await auctiondb.addBid(name, outpoint));
    assert(await auctiondb.hasBid(name, outpoint));

    const other = {
      hash: random.randomBytes(32),
      index: 0
    };

    assert.equal(await auctiondb.hasBid(name, other), false);
  });

  it('should add reveal', async () => {
    const name = 'dddd';
    const outpoint = {
      hash: random.randomBytes(32),
      index: 0
    };

    assert(await auctiondb.addReveal(name, outpoint));
    assert(await auctiondb.hasReveal(name, outpoint));
  });

  it('should index reveals for different names', async () => {
    const names = ['a', 'b', 'c', 'd'];

    for (const name of names) {
      const outpoint = {
        hash: random.randomBytes(32),
        index: 0
      };
      assert(await auctiondb.addReveal(name, outpoint));
      assert(await auctiondb.hasReveal(name, outpoint));

      const count = await auctiondb.getRevealCount(name);
      assert.deepEqual(count, new BN(1));
    }
  });

  it('should get reveal count', async () => {
    const name = 'twxki';
    const reveals = [];

    for (let i = 0; i < 12; i++) {
      const outpoint = {
        hash: random.randomBytes(32),
        index: i
      };

      reveals.push(outpoint);

      await auctiondb.addReveal(name, outpoint);
    }

    const count = await auctiondb.getRevealCount(name);

    assert.deepEqual(count, new BN(reveals.length));
  });

  it('should remove reveal', async () => {
    const name = 'nmispzk';
    const outpoint = {
      hash: random.randomBytes(32),
      index: 0
    };

    assert(await auctiondb.addReveal(name, outpoint));
    assert(await auctiondb.hasReveal(name, outpoint));

    assert(await auctiondb.removeReveal(name, outpoint));
    assert.equal(await auctiondb.hasReveal(name, outpoint), false);
  });

  it('should get all reveals', async () => {
    const name = 'bingo';
    const outpoints = [];

    for (let i = 0; i < 5; i++) {
      const outpoint = {
        hash: random.randomBytes(32),
        index: i
      };

      outpoints.push(outpoint);

      await auctiondb.addReveal(name, outpoint);
    }

    const count = await auctiondb.getRevealCount(name);
    assert.deepEqual(count, new BN(outpoints.length));

    const reveals = await auctiondb.getReveals(name);
    assert.strictEqual(outpoints.length, reveals.length);

    for (let i = 0; i < reveals.length; i++) {
      const target = outpoints.find(o => o.hash.equals(reveals[i].hash));
      assert(target);
    }
  });

  it('should has reveal', async () => {
    const name = 'addfabcd';
    const outpoint = {
      hash: random.randomBytes(32),
      index: 0
    };

    assert(await auctiondb.addReveal(name, outpoint));
    assert(await auctiondb.hasReveal(name, outpoint));

    const other = {
      hash: random.randomBytes(32),
      index: 0
    };

    assert.equal(await auctiondb.hasReveal(name, other), false);
  });
});
