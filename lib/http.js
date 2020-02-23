/*!
 * http.js - HTTP endpoints for hsd-auction-notify
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

const assert = require('bsert');
const path = require('path');
const {Server} = require('bweb');
const Validator = require('bval');
const base58 = require('bcrypto/lib/encoding/base58');
const random = require('bcrypto/lib/random');
const sha256 = require('bcrypto/lib/sha256');
const Network = require('hsd/lib/protocol/network');
const {safeEqual} = require('bcrypto/lib/safe');

/**
 * Initialize HTTP Endpoints.
 *
 * GET  /auction-notify
 * GET  /auction-notify/name/:name
 * POST /auction-notify/configure
 */

class HTTP extends Server {
  constructor(options) {
    super(new HTTPOptions(options));

    assert(options.node, 'Must pass node.');
    this.node = options.node;
    this.adb = options.adb;
    this.logger = options.logger;

    this.init();
  }

  init() {
    this.on('request', (req, res) => {
      if (req.method === 'POST' && req.pathname === '/')
        return;

      this.logger.debug('Request for method=%s path=%s (%s).',
        req.method, req.pathname, req.socket.remoteAddress);
    });

    this.on('listening', (address) => {
      this.logger.info('Auction Notify HTTP server listening on %s (port=%d).',
        address.address, address.port);
    });

    this.initRouter();
    this.initSockets();
  };

  initRouter() {
    if (this.options.cors)
      this.use(this.cors());

    if (!this.options.noAuth) {
      this.use(this.basicAuth({
        hash: sha256.digest,
        password: this.options.apiKey,
        realm: 'node'
      }));
    }

    this.use(this.bodyParser({
      type: 'json'
    }));

    this.use(this.router());
    this.use(this.jsonRPC(this.node.rpc));

    this.error((err, req, res) => {
      const code = err.statusCode || 500;
      res.json(code, {
        error: {
          type: err.type,
          code: err.code,
          message: err.message
        }
      });
    });

    /**
     * The 'connect' event is emitted by the chain
     * after the block has beeen validated fully.
     */

    this.node.chain.on('connect', async (entry, block, view) => {
      // Index new tip.
      await this.adb.putTip(block.hash());

      const stats = {
        count: 0,  // number of txs
        opens: 0, // number of opens
        bids: 0, // number of bids
        reveals: 0, // number of reveals
      };

      for (const tx of block.txs) {
        const txid = tx.hash();

        for (const [i, output] of tx.outputs.entries()) {
          const {covenant, value} = output;
          const outpoint = {hash: txid, index: i};

          if (covenant.isNone()) {
            if (value >= this.options.bigSpendValue)
              this.emit('big spend', {outpoint, name: null, value});
            continue;
          }

          const nameHash = covenant.getHash(0);
          const ns = await this.node.chain.db.getNameState(nameHash);

          if (!ns) {
            this.logger.error('Expected namestate for %x.', nameHash);
            continue;
          }

          const name = ns.name.toString('ascii');

          if (covenant.isBid()) {
            const indexed = await this.adb.addBid(name, outpoint);
            if (!indexed)
              this.logger.error('Problem indexing bid for %x.', name);

            this.emit('bid', {name, outpoint, value});

          } else if (covenant.isReveal()) {
            const indexed = await this.adb.addReveal(name, outpoint);
            if (!indexed)
              this.logger.error('Problem indexing reveal for %x.', name);

            this.emit('reveal', {name, outpoint, value});

          } else if (covenant.isRegister()) {
            const bidCount = await this.adb.getBidCount(name);
            const revealCount = await this.adb.getRevealCount(name);

            this.emit('register', {name, outpoint, value})

            if (bidCount.eq(revealCount))
              continue;

            if (revealCount.gt(bidCount)) {
              this.logger.error('Invalid database state: more reveals than bids for %s.', name);
              continue;
            }

            const bids = await adb.getBids(name);

            for (const bid of bids) {
              const {hash, index} = bid;

              const coin = await this.node.chain.db.getCoin(hash, index);

              // Coin was spent
              if (!coin)
                continue;

              // any coins here were burned
              this.emit('bid burned', {name, outpoint: {hash, index}, value});
            }
          } else if (covenant.isRevoke()) {
            // name was revoked
            this.emit('revoke', {name, outpoint, value});
          }
        }
      }

      // TODO: accumulate stats for the whole block
      // and emit them here. Number of bid
      this.emit('block stats', stats);
    });

    this.get('/auction-notify', async (req, res) => {
      const valid = Validator.fromRequest(req);

      const tip = await this.adb.getTip();

      res.json(200, {
        tip: tip ? tip.toString('hex') : null
      });
    });

    this.get('/auction-notify/name/:name', async (req, res) => {
      const valid = Validator.fromRequest(req);
      const name = valid.str('name');

      const bids = await this.adb.getBids(name);
      const reveals = await this.adb.getReveals(name);

      res.json(200, {
        name: name,
        bids: bids.map(o => outpointToJSON(o)),
        reveals: reveals.map(o => outpointToJSON(o))
      });
    });

    this.post('/auction-notify/configure', async (req, res) => {
      const valid = Validator.fromRequest(req);

      // turn on or off the notifications
      // could be tg or twitter
      res.json(200);
    });

    // Proxy non matching requests
    // to hsd http server
    this.use(async (req, res) => {
      await this.node.http.routes.handle(req, res);
    });
  }

  /**
   * Handle new websocket.
   * This is called internally when a new
   * websocket connection is attempted.
   * @private
   * @param {WebSocket} socket
   */

  handleSocket(socket) {
    socket.hook('auth', (...args) => {
      if (socket.channel('auth'))
        throw new Error('Already authed.');

      if (!this.options.noAuth) {
        const valid = new Validator(args);
        const key = valid.str(0, '');

        if (key.length > 255)
          throw new Error('Invalid API key.');

        const data = Buffer.from(key, 'ascii');
        const hash = sha256.digest(data);

        if (!safeEqual(hash, this.options.apiHash))
          throw new Error('Invalid API key.');
      }

      socket.join('auth');

      this.logger.info('Successful auth from %s.', socket.host);
      this.handleAuth(socket);

      return null;
    });
  }

  /**
   * Handle new auth'd websocket.
   * This adds hooks. The websocket client
   * must call 'watch auction-notify' to receive events.
   * @private
   * @param {WebSocket} socket
   */

  handleAuth(socket) {
    socket.hook('watch auction-notify', () => {
      socket.join('auction-notify');
      return null;
    });

    socket.hook('unwatch auction-notify', () => {
      socket.leave('auction-notify');
      return null;
    });
  }

  /**
   * Bind to relay events.
   * Capture emitted events by the
   * relay and send via websocket.
   * @private
   */

  initSockets() {
    const events = [
      'bid', 'reveal', 'register',
      'bid burned', 'open', 'big spend'
    ];

    for (const event of events) {
      this.on(event, (data) => {
        const sockets = this.channel('auction-notify');

        if (!sockets)
          return;

        this.to('auction-notify', event, data);
      });
    }
  }
}

class HTTPOptions {
  /**
   * HTTPOptions
   * @alias module:http.HTTPOptions
   * @constructor
   * @param {Object} options
   */

  constructor(options) {
    this.network = Network.primary;
    this.logger = null;
    this.node = null;
    this.adb = null;
    this.apiKey = base58.encode(random.randomBytes(20));
    this.apiHash = sha256.digest(Buffer.from(this.apiKey, 'ascii'));
    this.noAuth = false;
    this.cors = false;
    this.maxTxs = 100;

    this.prefix = null;
    this.host = '127.0.0.1';
    this.port = 8080;
    this.ssl = false;
    this.keyFile = null;
    this.certFile = null;

    this.fromOptions(options);
  }

  /**
   * Inject properties from object.
   * @private
   * @param {Object} options
   * @returns {HTTPOptions}
   */

  fromOptions(options) {
    assert(options);
    assert(options.node && typeof options.node === 'object',
      'HTTP Server requires a Node.');
    assert(options.adb && typeof options.adb === 'object',
      'HTTP Server requires AuctionNotifyDB.');

    this.node = options.node;
    this.adb = options.adb;
    this.network = options.node.network;
    this.logger = options.node.logger;

    this.port = this.network.rpcPort;

    if (options.logger != null) {
      assert(typeof options.logger === 'object');
      this.logger = options.logger;
    }

    if (options.apiKey != null) {
      assert(typeof options.apiKey === 'string',
        'API key must be a string.');
      assert(options.apiKey.length <= 255,
        'API key must be under 256 bytes.');
      this.apiKey = options.apiKey;
      this.apiHash = sha256.digest(Buffer.from(this.apiKey, 'ascii'));
    }

    if (options.noAuth != null) {
      assert(typeof options.noAuth === 'boolean');
      this.noAuth = options.noAuth;
    }

    if (options.cors != null) {
      assert(typeof options.cors === 'boolean');
      this.cors = options.cors;
    }

    if (options.prefix != null) {
      assert(typeof options.prefix === 'string');
      this.prefix = options.prefix;
      this.keyFile = path.join(this.prefix, 'key.pem');
      this.certFile = path.join(this.prefix, 'cert.pem');
    }

    if (options.host != null) {
      assert(typeof options.host === 'string');
      this.host = options.host;
    }

    if (options.port != null) {
      assert((options.port & 0xffff) === options.port,
        'Port must be a number.');
      this.port = options.port;
    }

    if (options.ssl != null) {
      assert(typeof options.ssl === 'boolean');
      this.ssl = options.ssl;
    }

    if (options.keyFile != null) {
      assert(typeof options.keyFile === 'string');
      this.keyFile = options.keyFile;
    }

    if (options.certFile != null) {
      assert(typeof options.certFile === 'string');
      this.certFile = options.certFile;
    }

    if (options.maxTxs != null) {
      assert(Number.isSafeInteger(options.maxTxs));
      this.maxTxs = options.maxTxs;
    }

    // Allow no-auth implicitly
    // if we're listening locally.
    if (!options.apiKey) {
      if (this.host === '127.0.0.1' || this.host === '::1')
        this.noAuth = true;
    }

    return this;
  }

  /**
   * Instantiate http options from object.
   * @param {Object} options
   * @returns {HTTPOptions}
   */

  static fromOptions(options) {
    return new HTTPOptions().fromOptions(options);
  }
}

/*
 * Helpers
 */

function enforce(value, msg) {
  if (!value) {
    const err = new Error(msg);
    err.statusCode = 400;
    throw err;
  }
}

function outpointToJSON(outpoint) {
  return {
    hash: outpoint.hash.toString('hex'),
    index: outpoint.index
  }
}

/**
 * Expose
 */

module.exports = HTTP;
