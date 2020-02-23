/*!
 * auctiondb.js - AuctionDB for hsd-auction-notify
 * Copyright (c) 2020, Mark Tyneway (MIT License).
 * https://github.com/tynes/hsd-auction-notify
 *
 * This software is based on hsd
 * https://github.com/handshake-org/hsd
 * Copyright (c) 2017-2020, Christopher Jeffrey (MIT License).
 * Copyright (c) 2019-2020, The Handshake Developers (MIT License).
 *
 * This software is based on bcoin
 * https://github.com/bcoin-org/bcoin
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * Copyright (c) 2017-2020, The bcoin Developers (MIT License).
 */

'use strict';

const EventEmitter = require('events');
const Logger = require('blgr');
const bdb = require('bdb');
const assert = require('bsert');
const layout = require('./layout');
const BN = require('bcrypto/lib/bn');
const path = require('path');
const fs = require('bfile');

class AuctionDB extends EventEmitter {
  constructor(options) {
    super();

    this.options = new AuctionDBOptions(options);
    this.logger = this.options.logger.context('auction-db');

    this.batch = null;
    this.db = bdb.create(this.options);
  }

  async open() {
    this.logger.info('Opening AuctionDB...');

    await this.ensure();
    await this.db.open();
  }

  async close() {
    await this.db.close();
  }

  start() {
    assert(this.batch === null);
    this.batch = this.db.batch();
    return this.batch;
  }

  put(key, value) {
    this.batch.put(key, value);
  }

  del(key, value) {
    this.batch.del(key, value);
  }

  async commit() {
    try {
      await this.batch.write();
    } catch (e) {
      this.logger.error('Error writing to db...');
      this.batch = null;
      return null;
    }

    this.batch = null;
    return true;
  }

  /**
   * Ensure prefix directory (prefix/index).
   * @returns {Promise}
   */

  async ensure() {
    if (fs.unsupported)
      return;

    if (this.options.memory)
      return;

    await fs.mkdirp(this.options.prefix);
  }

  async getTip() {
    const tip = await this.db.get(layout.T.encode());

    if (!tip)
      return null;

    return tip;
  }

  /**
   * Put the blockhash corresponding to the latest
   * tip of the blockchain.
   * @param {Hash}
   * @return {Hash}
   */

  async putTip(hash) {
    const key = layout.T.encode();
    try {
      await this.db.put(key, hash);
    } catch (e) {
      this.emit('error', e);
      return null;
    }

    return hash;
  }

  async getBidCount(name) {
    const key = layout.b.encode(name);
    const raw = await this.db.get(key);

    if (!raw)
      return null;

    return BN.decode(raw);
  }

  // TODO: add writelock
  async addBid(name, outpoint) {
    assert(typeof name === 'string');
    assert(Buffer.isBuffer(outpoint.hash));
    assert((outpoint.index >>> 0) === outpoint.index);

    let count = await this.getBidCount(name);

    // No bids currently exist for the name
    if (!count)
      count = new BN(0);

    count.iadd(new BN(1));

    this.start();

    this.put(layout.b.encode(name), count.encode());
    this.put(layout.B.encode(name, outpoint.hash, outpoint.index));

    if (!await this.commit())
      return null;

    return true;
  }

  async removeBid(name, outpoint) {
    assert(typeof name === 'string');
    assert(Buffer.isBuffer(outpoint.hash));
    assert((outpoint.index >>> 0) === outpoint.index);

    let count = await this.getBidCount(name);

    // No bids currently exist for the name
    if (!count)
      return null;

    count.isub(new BN(1));

    this.start();

    this.put(layout.b.encode(name), count.encode());
    this.del(layout.B.encode(name, outpoint.hash, outpoint.index));

    if (!await this.commit())
      return false;

    return true;
  }

  async getBids(name) {
    assert(typeof name === 'string');
    const outpoints = [];

    await this.db.keys({
      gte: layout.B.min(name),
      lte: layout.B.max(name),
      parse: (key) => {
        const [, hash, index] = layout.B.decode(key);
        const outpoint = {hash, index};
        outpoints.push(outpoint);
      }
    });

    return outpoints;
  }

  async hasBid(name, outpoint) {
    assert(typeof name === 'string');
    assert(Buffer.isBuffer(outpoint.hash));
    assert((outpoint.index >>> 0) === outpoint.index);

    const {hash, index} = outpoint;
    const key = layout.B.encode(name, hash, index);
    return this.db.has(key);
  }

  async getRevealCount(name) {
    const key = layout.r.encode(name);
    const raw = await this.db.get(key);

    if (!raw)
      return null;

    return BN.decode(raw);
  }

  async addReveal(name, outpoint) {
    assert(typeof name === 'string');
    assert(Buffer.isBuffer(outpoint.hash));
    assert((outpoint.index >>> 0) === outpoint.index);

    let count = await this.getRevealCount(name);

    // No reveals currently exist for the name
    if (!count)
      count = new BN(0);

    count.iadd(new BN(1));

    this.start();

    this.put(layout.r.encode(name), count.encode());
    this.put(layout.R.encode(name, outpoint.hash, outpoint.index));

    if (!await this.commit())
      return null;

    return true;
  }

  async removeReveal(name, outpoint) {
    assert(typeof name === 'string');
    assert(Buffer.isBuffer(outpoint.hash));
    assert((outpoint.index >>> 0) === outpoint.index);

    let count = await this.getRevealCount(name);

    // No reveals currently exist for the name
    if (!count)
      return null;

    count.isub(new BN(1));

    this.start();

    this.put(layout.r.encode(name), count.encode());
    this.del(layout.R.encode(name, outpoint.hash, outpoint.index));

    if (!await this.commit())
      return false;

    return true;
  }

  async getReveals(name) {
    assert(typeof name === 'string');
    const outpoints = [];

    await this.db.keys({
      gte: layout.R.min(name),
      lte: layout.R.max(name),
      parse: (key) => {
        const [, hash, index] = layout.R.decode(key);
        const outpoint = {hash, index};
        outpoints.push(outpoint);
      }
    });

    return outpoints;
  }

  async hasReveal(name, outpoint) {
    assert(typeof name === 'string');
    assert(Buffer.isBuffer(outpoint.hash));
    assert((outpoint.index >>> 0) === outpoint.index);

    const {hash, index} = outpoint;
    const key = layout.R.encode(name, hash, index);
    return this.db.has(key);
  }

  async wipe() {
   this.logger.warning('Wiping RelayIndexer');

    const iter = this.db.iterator();
    const b = this.db.batch();

    let total = 0;

    await iter.each((key) => {
      switch (key[0]) {
      case 0x42: // B
      case 0x62: // b
      case 0x52: // R
      case 0x72: // r
        b.del(key);
        total += 1;
        break;
      }
    });

    this.logger.warning('Wiped %d records.', total);

    return b.write();
  }
}

class AuctionDBOptions {
  constructor(options) {

    this.prefix = null;
    this.location = 'auction-notify';
    this.logger = Logger.global;
    this.compression = true;
    this.cacheSize = 8 << 20;
    this.writeBufferSize = 4 << 20;
    this.maxOpenFiles = 64;
    this.maxFileSize = 2 << 20;
    this.memory = false;

    if (options)
      this.fromOptions(options);
  }

  fromOptions(options) {
    if (options.logger != null) {
      this.logger = options.logger;
    }

    if (options.prefix != null) {
      assert(typeof options.prefix === 'string');
      this.prefix = options.prefix;
      this.location = path.join(options.prefix, 'auction-notify');
    }

    if (options.location != null) {
      assert(typeof options.location === 'string');
      this.location = options.location;
    }

    if (options.memory != null) {
      assert(typeof options.memory === 'boolean');
      this.memory = options.memory;
    }

    if (options.compression != null) {
      assert(typeof options.compression === 'boolean',
        '`compression` must be a boolean.');
      this.compression = options.compression;
    }

    if (options.cacheSize != null) {
      assert(typeof options.cacheSize === 'number',
        '`cacheSize` must be a number.');
      assert(options.cacheSize >= 0);
      this.cacheSize = Math.floor(options.cacheSize / 2);
      this.writeBufferSize = Math.floor(options.cacheSize / 4);
    }

    if (options.maxFiles != null) {
      assert(typeof options.maxFiles === 'number',
        '`maxFiles` must be a number.');
      assert(options.maxFiles >= 0);
      this.maxOpenFiles = options.maxFiles;
    }

    if (options.maxFileSize != null) {
      assert(typeof options.maxFileSize === 'number',
        '`maxFileSize` must be a number.');
      assert(options.maxFileSize >= 0);
      this.maxFileSize = options.maxFileSize;
    }

    return this;
  }
}

module.exports = AuctionDB;
