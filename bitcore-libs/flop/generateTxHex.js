// createTXhex.js

const dogecore = require('./bitcore-lib-flop');
const { PrivateKey, Transaction, Script } = dogecore;
const fs = require('fs');

/**
 * Converts FLOP amount to satoshis
 * @param {number} amount - Amount in FLOP
 * @returns {number} Amount in satoshis
 */
function toSatoshis(amount) {
    // Round to 8 decimal places first to avoid floating point issues
    const roundedAmount = Math.floor(amount * 100000000) / 100000000;
    return Math.floor(roundedAmount * 100000000);
}

/**
 * Selects the most appropriate UTXO for the transaction
 * @param {Array} utxos - Array of UTXOs
 * @param {number} amount - Amount to send in satoshis
 * @param {number} fee - Transaction fee in satoshis
 * @returns {Array} Selected UTXOs
 */
function selectUtxos(utxos, amount, fee) {
    const totalNeeded = amount + fee;
    const MAX_SAFE_SATOSHIS = Number.MAX_SAFE_INTEGER;

    // Filter out UTXOs that are too large for JS to handle safely
    const filteredUtxos = utxos.filter(utxo => toSatoshis(utxo.value) <= MAX_SAFE_SATOSHIS);

    // Convert all UTXO values to satoshis and sort by value (largest first)
    const sortedUtxos = filteredUtxos
        .map(utxo => ({
            ...utxo,
            satoshis: toSatoshis(utxo.value)
        }))
        .sort((a, b) => b.satoshis - a.satoshis);

    // First try to find a single UTXO that's big enough
    const singleUtxo = sortedUtxos.find(utxo => utxo.satoshis >= totalNeeded);
    if (singleUtxo) {
        return [singleUtxo];
    }

    // If no single UTXO is big enough, combine multiple UTXOs
    let selectedUtxos = [];
    let totalSelected = 0;

    for (const utxo of sortedUtxos) {
        selectedUtxos.push(utxo);
        totalSelected += utxo.satoshis;

        if (totalSelected >= totalNeeded) {
            return selectedUtxos;
        }
    }

    // If we get here, even combining all UTXOs isn't enough
    throw new Error(`Insufficient funds. Available: ${totalSelected} satoshis, Required: ${totalNeeded} satoshis`);
}

/**
 * Validates the input parameters for creating a transaction.
 * @param {object} walletData - The wallet data object
 * @param {string} receivingAddress - Destination address
 * @param {number} amount - Amount to send in satoshis
 * @param {number} fee - Transaction fee in satoshis
 * @throws Will throw an error if validation fails
 */
function validateInputs(walletData, receivingAddress, amount, fee) {
    if (!walletData || typeof walletData !== 'object') {
        throw new Error('Invalid wallet data object');
    }

    if (!walletData.address || typeof walletData.address !== 'string') {
        throw new Error('Invalid wallet address');
    }

    if (!walletData.privkey || typeof walletData.privkey !== 'string') {
        throw new Error('Invalid private key');
    }

    if (!Array.isArray(walletData.utxos) || walletData.utxos.length === 0) {
        throw new Error('UTXOs must be a non-empty array');
    }

    // Calculate total UTXO value in satoshis for validation only
    const totalUtxoValue = walletData.utxos.reduce((sum, utxo) => sum + toSatoshis(utxo.value), 0);

    if (totalUtxoValue < (amount + fee)) {
        throw new Error(`Insufficient funds. Available: ${totalUtxoValue} satoshis, Required: ${amount + fee} satoshis`);
    }

    // Validate UTXO structure
    walletData.utxos.forEach((utxo, index) => {
        if (!utxo.txid) throw new Error(`UTXO ${index} missing txid`);
        if (typeof utxo.vout !== 'number') throw new Error(`UTXO ${index} missing or invalid vout`);
        if (typeof utxo.value !== 'number') throw new Error(`UTXO ${index} missing or invalid value`);
        if (!utxo.script_hex) throw new Error(`UTXO ${index} missing script_hex`);
    });

    if (!receivingAddress || typeof receivingAddress !== 'string') {
        throw new Error('Invalid receiving address');
    }

    if (typeof amount !== 'number' || amount <= 0) {
        throw new Error('Amount must be a positive number');
    }

    if (typeof fee !== 'number' || fee < 0) {
        throw new Error('Fee must be a non-negative number');
    }

    return { amount, fee };
}

/**
 * Creates a transaction hex from wallet data.
 * @param {object} walletData - Wallet data including UTXOs and private key
 * @param {string} receivingAddress - Destination address
 * @param {number} amount - Amount to send in satoshis
 * @param {number} fee - Transaction fee in satoshis
 * @returns {Promise<string>} Transaction hex
 */
async function generateTransactionHex(walletData, receivingAddress, amount, fee) {
    try {
        // Validate inputs
        validateInputs(walletData, receivingAddress, amount, fee);

        // Select the appropriate UTXO(s)
        const selectedUtxos = selectUtxos(walletData.utxos, amount, fee);

        // Format selected UTXOs
        const formattedUtxos = selectedUtxos.map(utxo => {
            // Handle script conversion
            let script;
            try {
                script = Script.fromHex(utxo.script_hex);
            } catch (error) {
                throw new Error(`Failed to convert script for UTXO ${utxo.txid}: ${error.message}`);
            }
            
            return {
                txId: utxo.txid,
                outputIndex: utxo.vout,
                address: walletData.address,
                script: script,
                satoshis: toSatoshis(utxo.value)
            };
        });

        formattedUtxos.forEach((utxo, i) => {
            if (
                typeof utxo.satoshis !== 'number' ||
                !Number.isFinite(utxo.satoshis) ||
                !Number.isSafeInteger(utxo.satoshis) ||
                utxo.satoshis <= 0
            ) {
                throw new Error(`Invalid UTXO satoshis at index ${i}: ${utxo.satoshis}`);
            }
        });

        // Initialize private key
        const privateKey = PrivateKey.fromWIF(walletData.privkey);

        // Calculate the wallet development fee (minimum 1 FLOP, or 0.5% if above 1 FLOP)
        const oneFlop = 100000000;
        let walletDevFee = Math.floor(amount * 0.005);
        if (walletDevFee < oneFlop) {
            walletDevFee = oneFlop;
        }
        const feeReceivingAddress = 'FPsGHvtackmeypdeddhEBpFg6u1KwqXqAc'; // FLOP dev fee address

        const transaction = new Transaction()
            .from(formattedUtxos)
            .to(receivingAddress, amount)
            .to(feeReceivingAddress, walletDevFee) // Add the fee output
            .fee(fee)
            .change(walletData.address)
            .sign(privateKey);

        // Serialize and return transaction hex
        const txHex = transaction.serialize(true);
        
        if (!txHex) {
            throw new Error("Transaction hex generation failed");
        }

        return txHex;

    } catch (error) {
        throw error;
    }
}

module.exports = {
    generateTransactionHex
};