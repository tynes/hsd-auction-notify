/*!
 * plugin.js - auction-notify plugin for hsd
 * Copyright (c) 2017-2018, Christopher Jeffrey (MIT License).
 * Copyright (c) 2019-2020, Mark Tyneway (MIT License).
 * https://github.com/tynes/hsd-auction-notify
 */

'use strict';

const Validator = require('bval');
const AuctionDB = require('./auctiondb');
const HTTP = require('./http');

/**
 * Adds endpoints to the node http server
 *
 * GET /auction-notify
 * GET /auction-notify/name/:name
 *
 */

const EventEmitter = require('events');
const {decorate} = require('./util');

/**
 * @exports wallet/plugin
 */

const plugin = exports;

/**
 * Plugin
 * @extends EventEmitter
 */

class Plugin extends EventEmitter {
  /**
   * Create a plugin.
   * @constructor
   * @param {Node} node
   */

  constructor(node) {
    super();

    this.node = node;
    this.config = node.config;
    this.network = decorate(node.network);
    this.logger = node.logger.context('auction-notify');

    this.adb = new AuctionDB({
      memory: this.config.bool('memory', node.config.bool('memory')),
      prefix: this.config.prefix,
      location: this.config.str('location', node.config.bool('location')),
      logger: this.logger
    });

    this.http = new HTTP({
      node: this.node,
      adb: this.adb,
      logger: this.logger,
      network: node.network,
      logger: node.logger.context('auction-notify-http'),
      prefix: this.config.prefix,
      ssl: this.config.bool('auction-notify-ssl'),
      keyFile: this.config.path('auction-notify-ssl-key'),
      certFile: this.config.path('auction-notify-ssl-cert'),
      host: this.config.str('auction-notify-http-host', this.config.str('http-host')),
      port: this.config.uint('auction-notify-http-port', this.network.auctionNotifyPort),
      apiKey: this.config.str('auction-notify-api-key', this.config.str('apikey')),
      noAuth: this.config.bool('auction-notify-no-auth', this.config.bool('no-auth')),
      cors: this.config.bool('auction-notify-cors', this.config.bool('cors'))
    });

    this.init();
  }

  init() {
    this.adb.on('error', error => this.node.error(error));
    this.http.on('error', error => this.node.error(error));
  }

  async open() {
    await this.http.open();
    await this.adb.open();
  }

  async close() {
    await this.adb.close();
    await this.http.close();
  }
}

/**
 * Plugin name.
 * @const {String}
 */

plugin.id = 'auction-notify';

/**
 * Plugin initialization.
 * @param {Node} node
 * @returns {WalletDB}
 */

plugin.init = function init(node) {
  return new Plugin(node);
};

