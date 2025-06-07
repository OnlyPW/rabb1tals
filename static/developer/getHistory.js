/**********************************************************
 * Utility: Debounce function to prevent multiple calls
 **********************************************************/
function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/**********************************************************
 * Utility: Format time since a given timestamp
 **********************************************************/
function formatTimeSince(timestamp) {
    const currentTime = Date.now();
    const txTime = new Date(timestamp * 1000); // timestamp expected in seconds
    const timeSince = Math.floor((currentTime - txTime) / 1000);

    if (timeSince < 60) {
        return `${timeSince} seconds ago`;
    } else if (timeSince < 3600) {
        return `${Math.floor(timeSince / 60)} mins ago`;
    } else if (timeSince < 86400) {
        return `${Math.floor(timeSince / 3600)} hours ago`;
    } else {
        return `${Math.floor(timeSince / 86400)} days ago`;
    }
}

/**********************************************************
 * Utility: Create a DOM element to display a transaction
 **********************************************************/
function createTransactionElement(netAmount, timestamp, txid, confirmations) {
    const txElement = document.createElement('div');
    txElement.className = 'transaction';
    txElement.dataset.txid = txid; // Add txid as data attribute for uniqueness

    const absAmount = Math.abs(netAmount).toFixed(2);
    const timeSinceText = formatTimeSince(timestamp);

    let label;
    let color = '#888888';

    if (netAmount > 0) {
        label = `Sent ${absAmount}`;
        color = '#ff4444';
    } else if (netAmount < 0) {
        label = `Received ${absAmount}`;
        color = '#44ff44';
    } else {
        label = `Internal 0.00`;
    }

    const confirmationStatus = confirmations > 0 ? 'Confirmed' : 'Unconfirmed';

    txElement.textContent = `${label} — ${timeSinceText} (${confirmationStatus}) — TxID: ${txid.substring(0, 5)}...`;
    txElement.style.color = color;
    txElement.style.cursor = 'pointer';

    txElement.onclick = () => {
        const dialog = document.createElement('div');
        dialog.className = 'dialog';

        const title = document.createElement('h2');
        title.className = 'dialog-title';
        title.textContent = 'Transaction ID';

        const shortTxid = `${txid.substring(0, 5)}....${txid.substring(txid.length - 5)}`;
        const txidDisplay = document.createElement('div');
        txidDisplay.className = 'styled-text';
        txidDisplay.textContent = shortTxid;

        const hiddenInput = document.createElement('input');
        hiddenInput.value = txid;
        hiddenInput.style.position = 'absolute';
        hiddenInput.style.left = '-9999px';
        document.body.appendChild(hiddenInput);

        const copyButton = document.createElement('button');
        copyButton.className = 'styled-button';
        copyButton.textContent = 'Copy Full TxID';
        copyButton.onclick = () => {
            hiddenInput.select();
            try {
                document.execCommand('copy');
                copyButton.textContent = 'Copied!';
                copyButton.disabled = true;
                copyButton.style.backgroundColor = '#44ff44';
                copyButton.style.color = '#000';
            } catch (err) {
                console.error('Failed to copy:', err);
                copyButton.textContent = 'Failed to copy';
                copyButton.style.backgroundColor = '#ff4444';
            }
            document.body.removeChild(hiddenInput);
        };

        const okButton = document.createElement('button');
        okButton.className = 'styled-button';
        okButton.textContent = 'OK';
        okButton.onclick = () => {
            document.body.removeChild(dialog);
        };

        dialog.appendChild(title);
        dialog.appendChild(txidDisplay);
        dialog.appendChild(copyButton);
        dialog.appendChild(okButton);
        document.body.appendChild(dialog);

        dialog.onclick = (e) => {
            if (e.target === dialog) {
                document.body.removeChild(dialog);
            }
        };
    };

    return txElement;
}

/**********************************************************
 * Helper: Fetch details of a single input transaction (vin)
 **********************************************************/
async function getInputTransactionDetails(ticker, txid) {
    try {
        const response = await fetch(`/api/gettransaction/${ticker}/${txid}`);
        const data = await response.json();
        if (data.status === 'success') {
            return data.data;
        }
        return null;
    } catch (error) {
        console.error(`Error getting input transaction ${txid}:`, error);
        return null;
    }
}

/**********************************************************
 * Core: Fetch & analyze transaction details
 **********************************************************/
async function getTransactionDetails(ticker, txid, address) {
    try {
        const response = await fetch(`/api/gettransaction/${ticker}/${txid}`);
        const data = await response.json();

        if (data.status !== 'success') {
            if (data.message && (
                data.message.includes('No such mempool transaction') ||
                data.message.includes('Use -txindex to enable blockchain transaction queries')
            )) {
                const existingTxs = JSON.parse(localStorage.getItem('MyInscriptions')) || [];
                const updatedTxs = existingTxs.filter(tx => tx.txid !== txid);
                localStorage.setItem('MyInscriptions', JSON.stringify(updatedTxs));
                console.log(`Removed transaction ${txid} from history as it's no longer accessible`);
                return null;
            }
            throw new Error(data.message || 'Failed to get transaction details');
        }

        const txDetails = data.data;
        let inputAmount = 0;
        let receivedAmount = 0;

        for (const output of txDetails.vout) {
            const value = parseFloat(output.value) || 0;
            const outAddresses = output.scriptPubKey.addresses || [];
            if (outAddresses.includes(address)) {
                receivedAmount += value;
            }
        }

        for (const input of txDetails.vin) {
            if (!input.txid || input.vout === undefined) continue;

            const inputTx = await getInputTransactionDetails(ticker, input.txid);
            if (!inputTx || !inputTx.vout) continue;

            const inputVout = inputTx.vout[input.vout];
            if (!inputVout || !inputVout.scriptPubKey) continue;

            const inAddresses = inputVout.scriptPubKey.addresses || [];
            if (inAddresses.includes(address)) {
                const val = parseFloat(inputVout.value) || 0;
                inputAmount += val;
            }
        }

        const netAmount = inputAmount - receivedAmount;
        const txTime = txDetails.time || txDetails.blocktime || 0;
        const confirmations = txDetails.confirmations || 0;

        return {
            netAmount,
            time: txTime,
            confirmations
        };
    } catch (error) {
        if (error.message && (
            error.message.includes('No such mempool transaction') ||
            error.message.includes('Use -txindex to enable blockchain transaction queries')
        )) {
            const existingTxs = JSON.parse(localStorage.getItem('MyInscriptions')) || [];
            const updatedTxs = existingTxs.filter(tx => tx.txid !== txid);
            localStorage.setItem('MyInscriptions', JSON.stringify(updatedTxs));
            console.log(`Removed transaction ${txid} from history due to error: ${error.message}`);
            return null;
        }
        console.error(`Error getting transaction details for txid ${txid}:`, error);
        return null;
    }
}

/**********************************************************
 * TransactionManager: Manages unique transactions per address
 **********************************************************/
class TransactionManager {
    constructor(ticker, address) {
        this.ticker = ticker;
        this.address = address;
        this.storageKey = `processedTxs_${ticker}_${address}`;
        this.loadProcessedTransactions();
        this.isProcessing = new Set(); // Tracks txids currently being processed
    }

    loadProcessedTransactions() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            this.processedTransactions = stored ? new Map(JSON.parse(stored)) : new Map();
        } catch (error) {
            console.error('Error loading processed transactions:', error);
            this.processedTransactions = new Map();
        }
    }

    saveProcessedTransactions() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify([...this.processedTransactions]));
        } catch (error) {
            console.error('Error saving processed transactions:', error);
        }
    }

    async addTransaction(txid) {
        if (this.processedTransactions.has(txid)) {
            console.log(`Transaction ${txid} already processed for address ${this.address}, skipping`);
            return false;
        }
        if (this.isProcessing.has(txid)) {
            console.log(`Transaction ${txid} is currently being processed for address ${this.address}, skipping`);
            return false;
        }

        this.isProcessing.add(txid);
        try {
            const txInfo = await getTransactionDetails(this.ticker, txid, this.address);
            if (txInfo) {
                this.processedTransactions.set(txid, { ...txInfo, txid });
                this.saveProcessedTransactions();
                console.log(`Added transaction ${txid} for address ${this.address}`);
                return true;
            }
            return false;
        } finally {
            this.isProcessing.delete(txid);
        }
    }

    getTransactions() {
        return Array.from(this.processedTransactions.values());
    }
}

const transactionManagers = new Map(); // `${ticker}-${address}` -> TransactionManager
const requestQueue = new Map(); // `${ticker}-${address}` -> Promise chain for queuing

function getTransactionManager(ticker, address) {
    const key = `${ticker}-${address}`;
    if (!transactionManagers.has(key)) {
        transactionManagers.set(key, new TransactionManager(ticker, address));
    }
    return transactionManagers.get(key);
}

/**********************************************************
 * Main function: Display transaction history with queuing
 **********************************************************/
async function displayTransactionHistoryInner(ticker, address, container) {
    const key = `${ticker}-${address}`;
    console.log(`Starting displayTransactionHistory for ${key}`);

    // Initialize the queue for this ticker-address pair if not exists
    if (!requestQueue.has(key)) {
        requestQueue.set(key, Promise.resolve());
    }

    // Add the current request to the queue
    const task = async () => {
        const txManager = getTransactionManager(ticker, address);
        try {
            container.innerHTML = '<div style="margin-left: 20px;">Loading transactions...</div>';

            const response = await fetch(`/api/getlasttransactions/${ticker}/${address}`);
            const data = await response.json();
            if (data.status !== 'success') {
                throw new Error(data.message || 'Failed to fetch transactions');
            }

            const txids = [...new Set(data.data.transactions.map(tx => tx.txid))];
            console.log(`Fetched ${txids.length} unique transactions for address ${address}`);

            for (const txid of txids) {
                await txManager.addTransaction(txid);
            }

            const transactions = txManager.getTransactions();
            transactions.sort((a, b) => b.time - a.time);

            container.innerHTML = '';
            const renderedTxids = new Set();
            for (const txInfo of transactions) {
                if (renderedTxids.has(txInfo.txid)) {
                    console.log(`Skipping duplicate render of txid: ${txInfo.txid} for address ${address}`);
                    continue;
                }
                renderedTxids.add(txInfo.txid);
                const txElement = createTransactionElement(txInfo.netAmount, txInfo.time, txInfo.txid, txInfo.confirmations);
                container.appendChild(txElement);
            }

            if (!container.children.length) {
                container.innerHTML = '<div style="margin-left: 20px;">No recent transactions</div>';
            }
        } catch (error) {
            console.error('Error displaying transaction history:', error);
            container.innerHTML = '<div style="margin-left: 20px;">Error loading transactions</div>';
        }
    };

    // Chain the task to the queue
    const currentQueue = requestQueue.get(key);
    const newQueue = currentQueue.then(task).catch(error => {
        console.error(`Queue error for ${key}:`, error);
    });
    requestQueue.set(key, newQueue);

    await newQueue;
}

/**********************************************************
 * Export debounced version of displayTransactionHistory
 **********************************************************/
export const displayTransactionHistory = debounce(displayTransactionHistoryInner, 1000); // Increased to 1000ms