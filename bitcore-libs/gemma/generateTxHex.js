const dogecore = require('./bitcore-lib-gemma');
const { PrivateKey, Transaction, Script, Address, PublicKey, Networks } = dogecore;
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Developer fee address
const DEV_FEE_ADDRESS = 'GMUpWuAHMgWn9uXcnJtB4rFqguLsnWBCDy';
const DEV_FEE_PERCENTAGE = 0.01; // 1%

/**
 * Converts GEMMA amount to satoshis
 * @param {number} amount - Amount in GEMMA
 * @returns {number} Amount in satoshis
 */
function toSatoshis(amount) {
    return Math.round(amount * 100000000);
}

/**
 * Converts satoshis to GEMMA with exact 6 decimal places
 * @param {number} satoshis - Amount in satoshis
 * @returns {string} Amount in GEMMA as a string with up to 6 decimal places
 */
function toGemma(satoshis) {
    const gemma = satoshis / 100000000;
    return gemma.toFixed(6).replace(/\.?0+$/, ''); // Remove trailing zeros
}

/**
 * Selects the most appropriate UTXO for the transaction
 * @param {Array} utxos - Array of UTXOs
 * @param {number} amount - Amount to send in satoshis
 * @param {number} fee - Transaction fee in satoshis
 * @param {number} devFee - Developer fee in satoshis
 * @returns {Array} Selected UTXOs
 */
function selectUtxos(utxos, amount, fee, devFee) {
    const totalNeeded = amount + fee + devFee;
    
    const sortedUtxos = utxos
        .map(utxo => ({
            ...utxo,
            satoshis: toSatoshis(utxo.value)
        }))
        .sort((a, b) => b.satoshis - a.satoshis);

    const singleUtxo = sortedUtxos.find(utxo => utxo.satoshis >= totalNeeded);
    if (singleUtxo) {
        console.error('Selected single UTXO:', {
            txid: singleUtxo.txid,
            value: singleUtxo.value,
            satoshis: singleUtxo.satoshis,
            needed: totalNeeded
        });
        return [singleUtxo];
    }

    let selectedUtxos = [];
    let totalSelected = 0;

    for (const utxo of sortedUtxos) {
        selectedUtxos.push(utxo);
        totalSelected += utxo.satoshis;

        if (totalSelected >= totalNeeded) {
            console.error('Selected multiple UTXOs:', {
                count: selectedUtxos.length,
                totalValue: totalSelected,
                needed: totalNeeded,
                utxos: selectedUtxos.map(u => u.satoshis)
            });
            return selectedUtxos;
        }
    }

    throw new Error(`Insufficient funds. Available: ${totalSelected} satoshis, Required: ${totalNeeded} satoshis`);
}

/**
 * Validates the input parameters for creating a transaction
 * @param {object} walletData - The wallet data object
 * @param {string} receivingAddress - Destination address
 * @param {number} amount - Amount to send in satoshis
 * @param {number} fee - Transaction fee in satoshis
 * @param {number} devFee - Developer fee in satoshis
 * @throws Will throw an error if validation fails
 */
function validateInputs(walletData, receivingAddress, amount, fee, devFee) {
    console.error('Validating inputs:', {
        address: walletData.address,
        receivingAddress,
        amount,
        fee,
        devFee,
        utxoCount: walletData.utxos?.length
    });

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

    const totalUtxoValue = walletData.utxos.reduce((sum, utxo) => sum + toSatoshis(utxo.value), 0);
    const totalRequired = amount + fee + devFee;
    console.error('Total available (satoshis):', totalUtxoValue);
    console.error('Required amount + fee + devFee (satoshis):', totalRequired);

    if (totalUtxoValue < totalRequired) {
        throw new Error(`Insufficient funds. Available: ${totalUtxoValue} satoshis, Required: ${totalRequired} satoshis`);
    }

    walletData.utxos.forEach((utxo, index) => {
        console.error(`Validating UTXO ${index}:`, {
            ...utxo,
            valueInSatoshis: toSatoshis(utxo.value)
        });
        
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

    if (fee < 100000 || fee > 1000000000) {
        throw new Error(`Fee must be between 100,000 and 1,000,000,000 satoshis. Provided: ${fee}`);
    }

    if (typeof devFee !== 'number' || devFee < 0) {
        throw new Error('Developer fee must be a non-negative number');
    }
}

/**
 * Signs a raw transaction using gemma-cli
 * @param {string} rawTxHex - Unsigned transaction hex
 * @param {Array} utxos - Selected UTXOs
 * @param {string} privateKey - Private key in WIF format
 * @returns {Promise<string>} Signed transaction hex
 */
async function signWithGemmaCli(rawTxHex, utxos, privateKey) {
    const inputs = utxos.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.vout,
        scriptPubKey: utxo.script_hex
    }));
    const cmd = `gemma-cli signrawtransaction "${rawTxHex}" '${JSON.stringify(inputs)}' '["${privateKey}"]' "ALL"`;
    console.error('Executing gemma-cli sign command:', cmd);
    try {
        const { stdout, stderr } = await execPromise(cmd);
        if (stderr) {
            console.error('gemma-cli stderr:', stderr);
            throw new Error(`signrawtransaction error: ${stderr}`);
        }
        console.error('gemma-cli stdout:', stdout);
        const result = JSON.parse(stdout);
        if (!result.complete) {
            throw new Error('Transaction signing incomplete');
        }
        return result.hex;
    } catch (error) {
        console.error('Error executing gemma-cli sign:', error);
        throw error;
    }
}

/**
 * Creates a transaction hex from wallet data using gemma-cli
 * @param {object} walletData - Wallet data including UTXOs and private key
 * @param {string} receivingAddress - Destination address
 * @param {number} amount - Amount to send in satoshis
 * @param {number} fee - Transaction fee in satoshis
 * @returns {Promise<string>} Signed transaction hex
 */
async function generateTransactionHex(walletData, receivingAddress, amount, fee) {
    try {
        console.error('Starting transaction generation with:', {
            address: walletData.address,
            receivingAddress,
            amount,
            fee
        });

        // Calculate developer fee (1% of the amount)
        const devFee = Math.round(amount * DEV_FEE_PERCENTAGE);
        console.error('Developer fee (satoshis):', devFee);

        // Validate inputs including developer fee
        validateInputs(walletData, receivingAddress, amount, fee, devFee);

        // Select the appropriate UTXO(s)
        const selectedUtxos = selectUtxos(walletData.utxos, amount, fee, devFee);

        // Format selected UTXOs
        const formattedUtxos = selectedUtxos.map(utxo => {
            console.error('Processing selected UTXO:', utxo);
            
            let script;
            try {
                script = Script.fromHex(utxo.script_hex);
                console.error('Script created successfully:', script.toString());
            } catch (error) {
                console.error('Error converting script:', error);
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

        console.error('Formatted UTXOs:', formattedUtxos.map(utxo => ({
            ...utxo,
            script: utxo.script.toString()
        })));

        // Initialize private key and verify address
        const privateKey = PrivateKey.fromWIF(walletData.privkey);
        const publicKey = PublicKey.fromPrivateKey(privateKey);
        const derivedAddress = Address.fromPublicKey(publicKey, Networks.livenet).toString();
        console.error('Private key initialized successfully');
        console.error('Derived address from private key:', derivedAddress);
        console.error('Expected address:', walletData.address);

        if (derivedAddress !== walletData.address) {
            throw new Error(`Private key does not match wallet address. Derived: ${derivedAddress}, Expected: ${walletData.address}`);
        }

        // Calculate total input and change
        const totalInput = formattedUtxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
        const change = totalInput - (amount + fee + devFee);
        console.error('Total input (satoshis):', totalInput);
        console.error('Change (satoshis):', change);

        if (change < 0) {
            throw new Error('Insufficient input value for amount, fee, and developer fee');
        }

        // Use gemma-cli to create the transaction
        const inputs = formattedUtxos.map(utxo => ({
            txid: utxo.txId,
            vout: utxo.outputIndex
        }));
        const outputs = {};
        outputs[receivingAddress] = toGemma(amount);
        outputs[DEV_FEE_ADDRESS] = toGemma(devFee);
        if (change > 0) {
            outputs[walletData.address] = toGemma(change);
        }
        const createCmd = `gemma-cli createrawtransaction '${JSON.stringify(inputs)}' '${JSON.stringify(outputs)}'`;
        console.error('Executing gemma-cli create command:', createCmd);
        console.error('Outputs for gemma-cli:', outputs);
        const { stdout: rawTxHex, stderr: createStderr } = await execPromise(createCmd);
        if (createStderr) {
            console.error('gemma-cli create stderr:', createStderr);
            throw new Error(`createrawtransaction error: ${createStderr}`);
        }
        const unsignedTxHex = rawTxHex.trim();
        console.error('Unsigned transaction hex:', unsignedTxHex);

        // Sign using gemma-cli
        const signedTxHex = await signWithGemmaCli(unsignedTxHex, selectedUtxos, walletData.privkey);
        console.error('Signed transaction hex:', signedTxHex);

        return signedTxHex;

    } catch (error) {
        console.error('Error in generateTransactionHex:', error);
        throw error;
    }
}

module.exports = {
    generateTransactionHex
};