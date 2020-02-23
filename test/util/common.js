/**
 *
 */

'use strict';

const assert = require('bsert');
const common = exports;

common.event = async function event(obj, name) {
  return new Promise((resolve) => {
    obj.once(name, resolve);
  });
};

common.forValue = async function(obj, key, val, timeout = 30000) {
  assert(typeof obj === 'object');
  assert(typeof key === 'string');

  const ms = 10;
  let interval = null;
  let count = 0;

  return new Promise((resolve, reject) => {
    interval = setInterval(() => {
      if (obj[key] === val) {
        clearInterval(interval);
        resolve();
      } else if (count * ms >= timeout) {
        clearInterval(interval);
        reject(new Error('Timeout waiting for value.'));
      }
      count += 1;
    }, ms);
  });
};
