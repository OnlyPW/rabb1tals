'use strict';
var _ = require('lodash');

var BufferUtil = require('./util/buffer');
var JSUtil = require('./util/js');
var networks = [];
var networkMaps = {};

/**
 * A network is merely a map containing values that correspond to version
 * numbers for each bitcoin network. Currently only supporting "livenet"
 * (a.k.a. "mainnet") and "testnet".
 * @constructor
 */
function Network() {}

Network.prototype.toString = function toString() {
  return this.name;
};

/**
 * @function
 * @member Networks#get
 * Retrieves the network associated with a magic number or string.
 * @param {string|number|Network} arg
 * @param {string|Array} keys - if set, only check if the magic number associated with this name matches
 * @return Network
 */
function get(arg, keys) {
  if (~networks.indexOf(arg)) {
    return arg;
  }
  if (keys) {
    if (!_.isArray(keys)) {
      keys = [keys];
    }
    var containsArg = function(key) {
      return networks[index][key] === arg;
    };
    for (var index in networks) {
      if (_.some(keys, containsArg)) {
        return networks[index];
      }
    }
    return undefined;
  }
  if(networkMaps[arg] && networkMaps[arg].length >= 1) {
    return networkMaps[arg][0];
  } else {
    return networkMaps[arg];
  }
}

/**
 * @function
 * @member Networks#add
 * Will add a custom Network
 * @param {Object} data
 * @param {string} data.name - The name of the network
 * @param {string} data.alias - The aliased name of the network
 * @param {Number} data.pubkeyhash - The publickey hash prefix
 * @param {Number} data.privatekey - The privatekey prefix
 * @param {Number} data.scripthash - The scripthash prefix
 * @param {string} data.bech32prefix - The native segwit prefix
 * @param {Number} data.xpubkey - The extended public key magic
 * @param {Number} data.xprivkey - The extended private key magic
 * @param {Number} data.networkMagic - The network magic number
 * @param {Number} data.port - The network port
 * @param {Array}  data.dnsSeeds - An array of dns seeds
 * @return Network
 */
function addNetwork(data) {

  var network = new Network();

  JSUtil.defineImmutable(network, {
    name: data.name,
    alias: data.alias,
    pubkeyhash: data.pubkeyhash,
    privatekey: data.privatekey,
    scripthash: data.scripthash,
    bech32prefix: data.bech32prefix,
    xpubkey: data.xpubkey,
    xprivkey: data.xprivkey
  });

  if (data.networkMagic) {
    JSUtil.defineImmutable(network, {
      networkMagic: BufferUtil.integerAsBuffer(data.networkMagic)
    });
  }

  if (data.port) {
    JSUtil.defineImmutable(network, {
      port: data.port
    });
  }

  if (data.dnsSeeds) {
    JSUtil.defineImmutable(network, {
      dnsSeeds: data.dnsSeeds
    });
  }
  _.each(network, function(value) {
    if (!_.isUndefined(value) && !_.isObject(value)) {
      if(!networkMaps[value]) {
        networkMaps[value] = [];
      }
      networkMaps[value].push(network);
    }
  });

  networks.push(network);

  return network;

}

/**
 * @function
 * @member Networks#remove
 * Will remove a custom network
 * @param {Network} network
 */
function removeNetwork(network) {
  for (var i = 0; i < networks.length; i++) {
    if (networks[i] === network) {
      networks.splice(i, 1);
    }
  }
  for (var key in networkMaps) {
    const index = networkMaps[key].indexOf(network);
    if (index >= 0) {
      delete networkMaps[key][index];
    }
  }
}

addNetwork({
  name: 'livenet',
  alias: 'mainnet',
  pubkeyhash: 0x41,         // 65 decimal (TRMP mainnet - starts with T)
  privatekey: 0x97,         // 151 decimal (TRMP mainnet)
  scripthash: 0x1c,         // 28 decimal (TRMP mainnet)
  bech32prefix: 'trmp',     // TRMP mainnet bech32 prefix
  xpubkey: 0x02fadafe,      // 0x02, 0xfa, 0xda, 0xfe (TRMP mainnet)
  xprivkey: 0x02fac495,     // 0x02, 0xfa, 0xc4, 0x95 (TRMP mainnet)
  networkMagic: 0x54524d50, // 0x54, 0x52, 0x4d, 0x50 (TRMP mainnet)
  port: 33884,
  dnsSeeds: ['dnsseed.trumpow.meme']
});

/**
 * @instance
 * @member Networks#livenet
 */
var livenet = get('livenet');

addNetwork({
  name: 'testnet',
  alias: 'test',
  pubkeyhash: 0x71,         // 113 decimal (TRMP testnet)
  privatekey: 0xf1,         // 241 decimal (TRMP testnet)
  scripthash: 0xc4,         // 196 decimal (TRMP testnet)
  bech32prefix: 'ttrmp',    // TRMP testnet bech32 prefix
  xpubkey: 0x043587cf,      // 0x04, 0x35, 0x87, 0xcf (TRMP testnet)
  xprivkey: 0x04358394,     // 0x04, 0x35, 0x83, 0x94 (TRMP testnet)
  networkMagic: 0x54524d50, // 0x54, 0x52, 0x4d, 0x50 (TRMP testnet)
  port: 44884,
  dnsSeeds: []
});

/**
 * @instance
 * @member Networks#testnet
 */
var testnet = get('testnet');

addNetwork({
  name: 'regtest',
  alias: 'dev',
  pubkeyhash: 0x6f,         // 111 decimal (TRMP regtest)
  privatekey: 0xef,         // 239 decimal (TRMP regtest)
  scripthash: 0xc4,         // 196 decimal (TRMP regtest)
  bech32prefix: 'rtrmp',    // TRMP regtest bech32 prefix
  xpubkey: 0x043587cf,      // 0x04, 0x35, 0x87, 0xcf (TRMP regtest)
  xprivkey: 0x04358394,     // 0x04, 0x35, 0x83, 0x94 (TRMP regtest)
  networkMagic: 0x54524d50, // 0x54, 0x52, 0x4d, 0x50 (TRMP regtest)
  port: 16329,
  dnsSeeds: []
});

/**
 * @instance
 * @member Networks#testnet
 */
var regtest = get('regtest');

/**
 * @function
 * @deprecated
 * @member Networks#enableRegtest
 * Will enable regtest features for testnet
 */
function enableRegtest() {
  testnet.regtestEnabled = true;
}

/**
 * @function
 * @deprecated
 * @member Networks#disableRegtest
 * Will disable regtest features for testnet
 */
function disableRegtest() {
  testnet.regtestEnabled = false;
}

/**
 * @namespace Networks
 */
module.exports = {
  add: addNetwork,
  remove: removeNetwork,
  defaultNetwork: livenet,
  livenet: livenet,
  mainnet: livenet,
  testnet: testnet,
  regtest: regtest,
  get: get,
  enableRegtest: enableRegtest,
  disableRegtest: disableRegtest
};
