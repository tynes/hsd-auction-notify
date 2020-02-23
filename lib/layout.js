/*!
 * layout.js - data layout for auction-notify
 * Copyright (c) 2017-2018, Christopher Jeffrey (MIT License).
 * Copyright (c) 2017-2020, Mark Tyneway (MIT License).
 * https://github.com/tynes/hsd-auction-notify
 */

'use strict';

const bdb = require('bdb');

/**
 * Auction Notify Database Layout:
 *  V -> db version
 *  N -> db network
 *  R -> tip hash
 *  B[name][hash][index] -> dummy (bid outpoints by namehash)
 *  b[name] -> bid count
 *  R[name][hash][index] -> dummy (reveal outpoints by namehash)
 *  r[name] -> reveal count
 */

module.exports = {
  V: bdb.key('V'),
  N: bdb.key('N'),
  T: bdb.key('T'),
  B: bdb.key('B', ['ascii', 'hash256', 'uint32']),
  b: bdb.key('b', ['ascii']),
  R: bdb.key('R', ['ascii', 'hash256', 'uint32']),
  r: bdb.key('r', ['ascii'])
};
