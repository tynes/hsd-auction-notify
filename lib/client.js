/*!
 * client.js - HTTP and websocket client for hsd-auction-notify
 * Copyright (c) 2019, Mark Tyneway (Apache-2.0 License).
 * https://github.com/tynes/hsd-auction-notify
 *
 * This software is based on bcoin
 * https://github.com/bcoin-org/bcoin
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * Copyright (c) 2017-2019, bcoin developers (MIT License).
 */

'use strict';

const {NodeClient} = require('hs-client');
const assert = require('bsert');

/**
 * Client for
 *
 * GET  /auction-notify
 * GET  /auction-notify/name/:name
 * POST /auction-notify/configure
 */

class AuctionNotifyClient extends NodeClient {
  constructor(options) {
    super(options);
  }

  async open() {
    await super.open();
    await this.watchAuctionNotify();
  }

  async close() {
    await super.close();
    await this.unwatchAuctionNotify();
  }

  watchAuctionNotify() {
    this.call('watch auction-notify');
  }

  unwatchAuctionNotify() {
    this.call('unwatch auction-notify');
  }

  async auth() {
    return this.call('auth', this.password);
  }

  async getNotifyInfo() {
    return this.get('/auction-notify');
  }

  async getNotifyName(name) {
    assert(typeof name === 'string');
    return this.get(`/auction-notify/name/${name}`);
  }

  async setConfigure(options = {}) {
    return this.post('/auction-notify/configure', options);
  }
}

module.exports = AuctionNotifyClient;
