const bitcore = require('./bitcore-lib-xbt');
const { PrivateKey, Transaction, Script } = bitcore;

// Developer fee constants
const DEVELOPER_ADDRESS = '1Hjtk8fVKB1ZkeQwE2Eos3Ph6LZyooKszk';
const DEVELOPER_FEE_PERCENTAGE = 0.002; // 0.2% of the transaction amount
const DUST_THRESHOLD = 100000; // Bitcoin dust threshold for P2PKH outputs (in satoshis)

/**
 * Converts XBT amount to satoshis
 * @param {number} amount - Amount in XBT
 * @returns {number} Amount in satoshis
 */
function toSatoshis(amount) {
    // Round to 8 decimal places first to avoid floating point issues
    const roundedAmount = Math.floor(amount * 100000000) / 100000000;
    return Math.floor(roundedAmount * 100000000);
}

/**
 * Calculates the developer fee based on the transaction amount
 * @param {number} amount - Amount to send in satoshis
 * @returns {number} Developer fee in satoshis
 */
function calculateDeveloperFee(amount) {
    const fee = Math.floor(amount * DEVELOPER_FEE_PERCENTAGE);
    return fee > 0 ? fee : 0; // Ensure fee is non-negative
}

/**
 * Selects the most appropriate UTXO for the transaction
 * @param {Array} utxos - Array of UTXOs
 * @param {number} amount - Amount to send in satoshis
 * @param {number} fee - Transaction fee in satoshis
 * @returns {Array} Selected UTXOs
 */
function selectUtxos(utxos, amount, fee) {
    const developerFee = calculateDeveloperFee(amount);
    const totalNeeded = amount + fee + developerFee; // Include developer fee

    // Convert all UTXO values to satoshis and sort by value (largest first)
    const sortedUtxos = utxos
        .map(utxo => ({
            ...utxo,
            satoshis: toSatoshis(utxo.value)
        }))
        .sort((a, b) => b.satoshis - a.satoshis); // Sort largest to smallest

    // First try to find a single UTXO that's big enough
    const singleUtxo = sortedUtxos.find(utxo => utxo.satoshis >= totalNeeded);
    if (singleUtxo) {
        console.error('Selected single UTXO:', {
            txid: singleUtxo.txid,
            value: singleUtxo.value,
            satoshis: singleUtxo.satoshis,
            needed: totalNeeded,
            developerFee
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
                developerFee,
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
    const developerFee = calculateDeveloperFee(amount);
    console.error('Validating inputs:', {
        address: walletData.address,
        receivingAddress,
        amount,
        fee,
        developerFee,
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

    // Calculate total UTXO value in satoshis for validation
    const totalUtxoValue = walletData.utxos.reduce((sum, utxo) => sum + toSatoshis(utxo.value), 0);
    console.error('Total available (satoshis):', totalUtxoValue);
    console.error('Required amount + fee + devFee (satoshis):', amount + fee + developerFee);

    if (totalUtxoValue < (amount + fee + developerFee)) {
        throw new Error(`Insufficient funds. Available: ${totalUtxoValue} satoshis, Required: ${amount + fee + developerFee} satoshis`);
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

    if (developerFee === 0) {
        throw new Error('Developer fee is zero; amount may be too small');
    }

    if (developerFee < DUST_THRESHOLD) {
        throw new Error(`Developer fee (${developerFee} satoshis) is below dust threshold (${DUST_THRESHOLD} satoshis)`);
    }

    return { amount, fee, developerFee };
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
        const developerFee = calculateDeveloperFee(amount);
        console.error('Starting transaction generation with:', {
            address: walletData.address,
            receivingAddress,
            amount,
            fee,
            developerFee,
            developerAddress: DEVELOPER_ADDRESS
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

        // Create transaction
        console.error('Creating transaction with:', {
            utxoCount: formattedUtxos.length,
            amount,
            fee,
            developerFee,
            changeAddress: walletData.address
        });

        const transaction = new Transaction()
            .from(formattedUtxos)
            .to(receivingAddress, amount)
            .to(DEVELOPER_ADDRESS, developerFee) // Add developer fee output
            .fee(fee)
            .change(walletData.address)
            .sign(privateKey);

        console.error('Transaction created successfully');

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
    generateTransactionHex
};