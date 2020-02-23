/*!
 * util.js - auction-notify utils
 * Copyright (c) 2020, Mark Tyneway (MIT License).
 * https://github.com/tynes/hsd-auction-notify
 */

function decorate(network) {
  network.auctionNotifyPort = network.rpcPort + 3;
  return network;
}

exports.decorate = decorate;
