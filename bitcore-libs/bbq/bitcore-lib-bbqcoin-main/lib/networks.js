'use strict';
var _ = require('lodash');

var BufferUtil = require('./util/buffer');
var JSUtil = require('./util/js');
var networks = [];
var networkMaps = {};

/**
 * A network is merely a map containing values that correspond to version
 * numbers for each litecoin network. Currently only supporting "livenet"
 * (a.k.a. "mainnet") and "testnet".
 * @constructor
 */
function Network() {}

Network.prototype.toString = function toString() {
  return this.name;
};

/**
 * @function
 * @member Networks#remove
 * Will remove a custom network
 * @param {Network} network
 */
function removeNetwork(network) {
  if (typeof network !== 'object') {
    network = get(network);
  }
  for (var i = 0; i < networks.length; i++) {
    if (networks[i] === network) {
      networks.splice(i, 1);
    }
  }
  for (var key in networkMaps) {
    if (networkMaps[key].length) {
      const index = networkMaps[key].indexOf(network);
      if (index >= 0) {
        networkMaps[key].splice(index, 1);
      }
      if (networkMaps[key].length === 0) {
        delete networkMaps[key];
      }
    } else if (networkMaps[key] === network) {
      delete networkMaps[key];
    }
  }
}

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
  if (networkMaps[arg] && networkMaps[arg].length >= 1) {
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
    xpubkey: data.xpubkey,
    xprivkey: data.xprivkey
  });

  if (data.name === 'testnet') {
    Object.defineProperty(network, 'networkMagic', {
      enumerable: true,
      configurable: true,
      get: function () {
        return this.regtestEnabled ? REGTEST.NETWORK_MAGIC : TESTNET.NETWORK_MAGIC;
      }
    });
    Object.defineProperty(network, 'port', {
      enumerable: true,
      configurable: true,
      get: function () {
        return this.regtestEnabled ? REGTEST.PORT : TESTNET.PORT;
      }
    });
    Object.defineProperty(network, 'dnsSeeds', {
      enumerable: true,
      configurable: true,
      get: function () {
        return this.regtestEnabled ? REGTEST.DNS_SEEDS : TESTNET.DNS_SEEDS;
      }
    });
  } else {
    JSUtil.defineImmutable(network, {
      networkMagic: BufferUtil.integerAsBuffer(data.networkMagic),
      port: data.port,
      dnsSeeds: data.dnsSeeds
    });
  }

  _.each(network, function (value) {
    if (!_.isUndefined(value) && !_.isObject(value)) {
      if (!networkMaps[value]) {
        networkMaps[value] = [];
      }
      networkMaps[value].push(network);
    }
  });

  networks.push(network);
  return network;
}

// Define TESTNET and REGTEST before using them
var TESTNET = {
  PORT: 19333,
  NETWORK_MAGIC: BufferUtil.integerAsBuffer(0xfcc1b7dc),
  DNS_SEEDS: [
    'testnet.seed01.bbqcoin.link',
    'testnet.seed02.bbqcoin.link',
    'testnet.seed03.bbqcoin.link'
  ]
};

var REGTEST = {
  PORT: 19333,
  NETWORK_MAGIC: BufferUtil.integerAsBuffer(0xc0c0c0c0),
  DNS_SEEDS: []
};

// Add livenet configuration
addNetwork({
  name: 'livenet',
  alias: 'mainnet',
  pubkeyhash: 0x55,
  privatekey: 0xD5,
  scripthash: 0x06,
  xpubkey: 0x0487B01F,
  xprivkey: 0x0487AFE5,
  networkMagic: 0xfde4d942,
  port: 19323,
  dnsSeeds: [
    'seed01.bbqcoin.link',
    'seed02.bbqcoin.link',
    'seed03.bbqcoin.link'
  ]
});

var livenet = get('livenet');

// Add testnet configuration
addNetwork({
  name: 'testnet',
  alias: 'test',
  pubkeyhash: 0x19,
  privatekey: 0x99,
  scripthash: 0x4C,
  xpubkey: 0x02FACAFD,
  xprivkey: 0x02FAC398,
  networkMagic: 0xfcc1b7dc,
  port: 19333,
  dnsSeeds: [
    'testnet.seed01.bbqcoin.link',
    'testnet.seed02.bbqcoin.link',
    'testnet.seed03.bbqcoin.link'
  ]
});

var testnet = get('testnet');

// Add regtest configuration
addNetwork({
  name: 'regtest',
  alias: 'dev',
  pubkeyhash: 0x2F,
  privatekey: 0x99,
  scripthash: 0x05,
  xpubkey: 0x02FACAFD,
  xprivkey: 0x02FAC398,
  networkMagic: 0xc0c0c0c0,
  port: 19333
});

var regtest = get('regtest');

function enableRegtest() {
  testnet.regtestEnabled = true;
}

function disableRegtest() {
  testnet.regtestEnabled = false;
}

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
