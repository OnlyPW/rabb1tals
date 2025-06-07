#!/usr/bin/env node

const bitcore = require('./bitcore-lib-b1t');
const { PrivateKey, Address } = bitcore;
const bs58 = require('bs58');

// Generate a new private key
const privateKey = new PrivateKey();

// Get the WIF format of the private key
const wif = privateKey.toWIF();

// Generate the corresponding address
const address = privateKey.toAddress();

console.log('New WIF Private Key:', wif);
console.log('Corresponding Address:', address.toString());