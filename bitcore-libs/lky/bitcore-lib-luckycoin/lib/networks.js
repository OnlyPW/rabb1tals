'use strict';
var _ = require('lodash');

var BufferUtil = require('./util/buffer');
var JSUtil = require('./util/js');

var networks = [];
var networkMaps = {};

/**
 * A network is merely a map containing values that correspond to version
 * numbers for each LuckyCoin network. Currently supporting "livenet"
 * (a.k.a. "mainnet"), "testnet", and "regtest".
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
      if (!networkMaps[value]) {
        networkMaps[value] = [];
      }
      networkMaps[value].push(network);
    }
  });
  networks.push(network);
  return network;
}

// Mainnet (livenet)
addNetwork({
  name: 'livenet',
  alias: 'mainnet',
  pubkeyhash: 47,          // Matches C++: PUBKEY_ADDRESS (47, 'L')
  privatekey: 176,         // Matches C++: SECRET_KEY (176)
  scripthash: 5,           // Matches C++: SCRIPT_ADDRESS (5, '3')
  xpubkey: 0x0488b21e,     // Matches C++: EXT_PUBLIC_KEY ('xpub')
  xprivkey: 0x0488ade4,    // Matches C++: EXT_SECRET_KEY ('xprv')
  networkMagic: 0xfbc0b6db, // Matches C++: pchMessageStart (fb,c0,b6,db)
  port: 9917,              // Matches C++: nDefaultPort
  dnsSeeds: [
    'dnsseed.luckycoinfoundation.org' // Matches C++: vSeeds
  ]
});

/**
 * @instance
 * @member Networks#livenet
 */
var livenet = get('livenet');

// Testnet
addNetwork({
  name: 'testnet',
  alias: 'test',
  pubkeyhash: 47,          // Matches C++: PUBKEY_ADDRESS (47, 'L')
  privatekey: 153,         // Matches C++: SECRET_KEY (153)
  scripthash: 5,           // Matches C++: SCRIPT_ADDRESS (5, '3')
  xpubkey: 0x02facafd,     // Matches C++: EXT_PUBLIC_KEY ('tpub')
  xprivkey: 0x02fac398,    // Matches C++: EXT_SECRET_KEY ('tprv')
  networkMagic: 0xfcc1b7dc, // Matches C++: pchMessageStart (fc,c1,b7,dc)
  port: 19917,             // Matches C++: nDefaultPort
  dnsSeeds: []             // No DNS seeds specified in C++ for testnet
});

/**
 * @instance
 * @member Networks#testnet
 */
var testnet = get('testnet');

// Regtest
addNetwork({
  name: 'regtest',
  alias: 'dev',
  pubkeyhash: 47,          // Matches C++: PUBKEY_ADDRESS (47, 'L')
  privatekey: 153,         // Matches C++: SECRET_KEY (153)
  scripthash: 5,           // Matches C++: SCRIPT_ADDRESS (5, '3')
  xpubkey: 0x02facafd,     // Matches C++: EXT_PUBLIC_KEY ('tpub')
  xprivkey: 0x02fac398,    // Matches C++: EXT_SECRET_KEY ('tprv')
  networkMagic: 0xc0c0c0c0, // Matches C++: pchMessageStart (c0,c0,c0,c0)
  port: 19917,             // Matches C++: nDefaultPort
  dnsSeeds: []             // No DNS seeds for regtest
});

/**
 * @instance
 * @member Networks#regtest
 */
var regtest = get('regtest');

// Add configurable values for testnet/regtest
var TESTNET = {
  PORT: 19917,
  NETWORK_MAGIC: BufferUtil.integerAsBuffer(0xfcc1b7dc),
  DNS_SEEDS: []
};

for (var key in TESTNET) {
  if (!_.isObject(TESTNET[key])) {
    networkMaps[TESTNET[key]] = testnet;
  }
}

var REGTEST = {
  PORT: 19917,
  NETWORK_MAGIC: BufferUtil.integerAsBuffer(0xc0c0c0c0),
  DNS_SEEDS: []
};

for (var key in REGTEST) {
  if (!_.isObject(REGTEST[key])) {
    networkMaps[REGTEST[key]] = regtest;
  }
}

// Conditionally define testnet properties to avoid redefinition
if (!Object.getOwnPropertyDescriptor(testnet, 'port')) {
  Object.defineProperty(testnet, 'port', {
    enumerable: true,
    configurable: true,
    get: function() {
      if (this.regtestEnabled) {
        return REGTEST.PORT;
      } else {
        return TESTNET.PORT;
      }
    }
  });
}

if (!Object.getOwnPropertyDescriptor(testnet, 'networkMagic')) {
  Object.defineProperty(testnet, 'networkMagic', {
    enumerable: true,
    configurable: true,
    get: function() {
      if (this.regtestEnabled) {
        return REGTEST.NETWORK_MAGIC;
      } else {
        return TESTNET.NETWORK_MAGIC;
      }
    }
  });
}

if (!Object.getOwnPropertyDescriptor(testnet, 'dnsSeeds')) {
  Object.defineProperty(testnet, 'dnsSeeds', {
    enumerable: true,
    configurable: true,
    get: function() {
      if (this.regtestEnabled) {
        return REGTEST.DNS_SEEDS;
      } else {
        return TESTNET.DNS_SEEDS;
      }
    }
  });
}

// Conditionally define regtest properties to avoid redefinition
if (!Object.getOwnPropertyDescriptor(regtest, 'networkMagic')) {
  Object.defineProperty(regtest, 'networkMagic', {
    enumerable: true,
    configurable: true,
    get: function() {
      return REGTEST.NETWORK_MAGIC;
    }
  });
}

if (!Object.getOwnPropertyDescriptor(regtest, 'dnsSeeds')) {
  Object.defineProperty(regtest, 'dnsSeeds', {
    enumerable: true,
    configurable: true,
    get: function() {
      return REGTEST.DNS_SEEDS;
    }
  });
}

if (!Object.getOwnPropertyDescriptor(regtest, 'port')) {
  Object.defineProperty(regtest, 'port', {
    enumerable: true,
    configurable: true,
    get: function() {
      return REGTEST.PORT;
    }
  });
}

/**
 * @function
 * @member Networks#enableRegtest
 * Will enable regtest features for testnet
 */
function enableRegtest() {
  testnet.regtestEnabled = true;
}

/**
 * @function
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