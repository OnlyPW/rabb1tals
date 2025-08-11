// createTXhex.js

const dogecore = require('./bitcore-lib-pepe');
const { PrivateKey, Transaction, Script } = dogecore;

// Dev fee configuration
const DEV_FEE_ADDRESS = 'PjH3mdGxpJwuEMP9oeieXf47ygNDEhT2ij';
const DEV_FEE_PERCENTAGE = 0.001; // 0.1% = 0.001
const DUST_THRESHOLD = 1000; // Minimum output size in satoshis (increased from 546)

/**
 * Checks if an amount is above the dust threshold
 * @param {number} amount - Amount in satoshis
 * @returns {boolean} True if above dust threshold
 */
function isAboveDustThreshold(amount) {
    return amount >= DUST_THRESHOLD;
}

/**
 * Adjusts the dev fee to ensure it's above dust threshold
 * @param {number} amount - Original amount in satoshis
 * @returns {object} {devFee, adjustedAmount, shouldIncludeDevFee}
 */
function calculateAdjustedDevFee(amount) {
    const devFee = calculateDevFee(amount);
    
    // If dev fee is below dust threshold, don't include it
    if (!isAboveDustThreshold(devFee)) {
        return {
            devFee: 0,
            adjustedAmount: amount,
            shouldIncludeDevFee: false
        };
    }
    
    return {
        devFee: devFee,
        adjustedAmount: amount,
        shouldIncludeDevFee: true
    };
}



/**
 * Calculates the dev fee for a transaction
 * @param {number} amount - Amount in satoshis
 * @returns {number} Dev fee in satoshis
 */
function calculateDevFee(amount) {
    const devFee = Math.floor(amount * DEV_FEE_PERCENTAGE);
    // Ensure minimum dev fee of 1 satoshi
    return Math.max(devFee, 1);
}

/**
 * Converts PEP amount to satoshis
 * @param {number} amount - Amount in PEP
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
    // Calculate adjusted dev fee based on the amount
    const { devFee, shouldIncludeDevFee } = calculateAdjustedDevFee(amount);
    const totalNeeded = amount + fee + (shouldIncludeDevFee ? devFee : 0);
    
    console.error('UTXO selection calculation:', {
        amount,
        fee,
        devFee,
        shouldIncludeDevFee,
        totalNeeded
    });
    
    // Convert all UTXO values to satoshis and sort by value (largest first)
    const sortedUtxos = utxos
        .map(utxo => ({
            ...utxo,
            satoshis: toSatoshis(utxo.value)
        }))
        .sort((a, b) => b.satoshis - a.satoshis);  // Sort largest to smallest

    // First try to find a single UTXO that's big enough
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

    // If no single UTXO is big enough, combine multiple UTXOs
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
    console.error('Validating inputs:', {
        address: walletData.address,
        receivingAddress,
        amount,
        fee,
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

    // Calculate total UTXO value in satoshis for validation only
    const totalUtxoValue = walletData.utxos.reduce((sum, utxo) => sum + toSatoshis(utxo.value), 0);
    const { devFee, shouldIncludeDevFee } = calculateAdjustedDevFee(amount);
    const totalRequired = amount + fee + (shouldIncludeDevFee ? devFee : 0);
    
    console.error('Funds validation:', {
        totalAvailable: totalUtxoValue,
        amount,
        fee,
        devFee,
        shouldIncludeDevFee,
        totalRequired
    });

    if (totalUtxoValue < totalRequired) {
        const feeText = shouldIncludeDevFee ? ` (including ${devFee} satoshi dev fee)` : '';
        throw new Error(`Insufficient funds. Available: ${totalUtxoValue} satoshis, Required: ${totalRequired} satoshis${feeText}`);
    }

    // Validate UTXO structure
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
        console.error('Starting transaction generation with:', {
            address: walletData.address,
            receivingAddress,
            amount,
            fee
        });

        // Validate inputs
        validateInputs(walletData, receivingAddress, amount, fee);

        // Select the appropriate UTXO(s)
        const selectedUtxos = selectUtxos(walletData.utxos, amount, fee);

        // Format selected UTXOs
        const formattedUtxos = selectedUtxos.map(utxo => {
            console.error('Processing selected UTXO:', utxo);
            
            // Handle script conversion
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

        // Initialize private key
        const privateKey = PrivateKey.fromWIF(walletData.privkey);
        console.error('Private key initialized successfully');

        // Calculate adjusted dev fee
        const { devFee, shouldIncludeDevFee } = calculateAdjustedDevFee(amount);
        
        // Create transaction
        console.error('Creating transaction with:', {
            utxoCount: formattedUtxos.length,
            amount,
            fee,
            devFee,
            shouldIncludeDevFee,
            changeAddress: walletData.address
        });

        let transaction = new Transaction()
            .from(formattedUtxos)
            .to(receivingAddress, amount);
        
        // Only add dev fee output if it's above dust threshold
        if (shouldIncludeDevFee) {
            transaction = transaction.to(DEV_FEE_ADDRESS, devFee);
        }
        
        transaction = transaction
            .fee(fee)
            .change(walletData.address)
            .sign(privateKey);

        console.error('Transaction created successfully');
        console.error('Transaction summary:', {
            amount: amount,
            fee: fee,
            devFee: devFee,
            shouldIncludeDevFee: shouldIncludeDevFee,
            devFeeAddress: shouldIncludeDevFee ? DEV_FEE_ADDRESS : 'N/A',
            totalOutputs: amount + (shouldIncludeDevFee ? devFee : 0),
            changeAddress: walletData.address
        });

        // Serialize and return transaction hex
        const txHex = transaction.serialize(true);
        
        if (!txHex) {
            throw new Error("Transaction hex generation failed");
        }

        console.error('Transaction hex generated:', txHex.substring(0, 64) + '...');
        return txHex;

    } catch (error) {
        console.error('Error in generateTransactionHex:', error);
        throw error;
    }
}

module.exports = {
    generateTransactionHex,
    calculateDevFee,
    calculateAdjustedDevFee,
    isAboveDustThreshold,
    DEV_FEE_ADDRESS,
    DEV_FEE_PERCENTAGE,
    DUST_THRESHOLD
};