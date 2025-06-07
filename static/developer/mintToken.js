import { mintUI } from './mint.js';
import { inscribeUI } from './inscriber.js';

export function mintTokenUI(selectedWallet) {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = '';

    // Header with back button
    const header = document.createElement('div');
    header.className = 'header';
    const backButton = document.createElement('button');
    backButton.className = 'back-button';
    backButton.innerHTML = '<img src="./static/images/back.png" alt="Back Icon" />';
    backButton.addEventListener('click', () => {
        landingPage.innerHTML = '';
        mintUI(selectedWallet);
    });
    header.appendChild(backButton);
    landingPage.appendChild(header);

    // Set token standard based on wallet ticker
    const standardMap = {
        'doge': 'drc-20',
        'lky': 'lky-20',
        'pep': 'prc-20',
        'shic': 'shc-20',
        'bonc': 'bnk-20',
        'dgb': 'dgb-20',
        'dev': 'dev-20'
    };
    
    const ticker = selectedWallet.ticker.toLowerCase();
    if (!standardMap[ticker]) {
        // If no standard exists, only show the message
        const title = document.createElement('h1');
        title.textContent = 'No token standard available for this chain';
        title.className = 'page-title';
        landingPage.appendChild(title);
        return;
    }

    // Rest of UI only renders if there is a standard
    const title = document.createElement('h1');
    title.textContent = 'Mint Token';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // UTXO selection dropdown
    const utxoDropdown = document.createElement('select');
    utxoDropdown.className = 'wallet-selector input-margin';
    if (selectedWallet.utxos && selectedWallet.utxos.length > 0) {
        selectedWallet.utxos
            .filter(utxo => parseFloat(utxo.value) > 0.01 && utxo.confirmations >= 1)
            .forEach(utxo => {
                const option = document.createElement('option');
                option.value = `${utxo.txid}:${utxo.vout}`;
                option.textContent = `${utxo.value} ${selectedWallet.ticker}`;
                utxoDropdown.appendChild(option);
            });
        if (selectedWallet.utxos.filter(utxo => parseFloat(utxo.value) > 0.01 && utxo.confirmations >= 1).length === 0) {
            utxoDropdown.innerHTML = '<option disabled selected>No UTXOs available above 0.01 with sufficient confirmations</option>';
        }
    } else {
        utxoDropdown.innerHTML = '<option disabled selected>No UTXOs available</option>';
    }
    landingPage.appendChild(utxoDropdown);

    // Token standard display
    const standardDisplay = document.createElement('div');
    standardDisplay.className = 'styled-text';
    landingPage.appendChild(standardDisplay);

    // Token standard selector
    const tokenStandardDropdown = document.createElement('select');
    tokenStandardDropdown.className = 'wallet-selector input-margin';
    ['drc-20', 'lky-20', 'prc-20', 'shc-20', 'bnk-20', 'dgb-20'].forEach(standard => {
        const option = document.createElement('option');
        option.value = standard;
        option.textContent = standard;
        tokenStandardDropdown.appendChild(option);
    });
    landingPage.appendChild(tokenStandardDropdown);

    // Set initial token standard based on wallet ticker
    if (standardMap[ticker]) {
        tokenStandardDropdown.value = standardMap[ticker];
        standardDisplay.textContent = `${standardMap[ticker]}`;
        tokenStandardDropdown.style.display = 'none';
    }

    // Operation selector
    const operationDropdown = document.createElement('select');
    operationDropdown.className = 'wallet-selector input-margin';
    ['mint', 'deploy', 'transfer'].forEach(op => {
        const option = document.createElement('option');
        option.value = op;
        option.textContent = op;
        operationDropdown.appendChild(option);
    });
    landingPage.appendChild(operationDropdown);

    // Tick input
    const tickInput = document.createElement('input');
    tickInput.type = 'text';
    tickInput.placeholder = 'plgz';
    tickInput.className = 'styled-input input-margin';
    tickInput.autocapitalize = 'off';
    landingPage.appendChild(tickInput);

    // Amount input
    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.placeholder = '420';
    amountInput.className = 'styled-input input-margin';
    amountInput.autocapitalize = 'off';
    landingPage.appendChild(amountInput);

    // Max input
    const maxInput = document.createElement('input');
    maxInput.type = 'text';
    maxInput.placeholder = 'Enter max supply';
    maxInput.className = 'styled-input input-margin';
    maxInput.autocapitalize = 'off';
    maxInput.style.display = 'none';
    landingPage.appendChild(maxInput);

    // Limit input
    const limitInput = document.createElement('input');
    limitInput.type = 'text';
    limitInput.placeholder = 'Enter limit';
    limitInput.className = 'styled-input input-margin';
    limitInput.autocapitalize = 'off';
    limitInput.style.display = 'none';
    landingPage.appendChild(limitInput);

    // Receiving address input
    const addressInput = document.createElement('input');
    addressInput.type = 'text';
    addressInput.placeholder = selectedWallet.address;
    addressInput.className = 'styled-input input-margin';
    landingPage.appendChild(addressInput);

    // Next button
    const nextButton = document.createElement('button');
    nextButton.textContent = 'Next';
    nextButton.className = 'styled-button input-margin';
    landingPage.appendChild(nextButton);

    // Event Listeners
    operationDropdown.addEventListener('change', () => {
        const op = operationDropdown.value;
        amountInput.style.display = (op === 'mint' || op === 'transfer') ? 'block' : 'none';
        maxInput.style.display = op === 'deploy' ? 'block' : 'none';
        limitInput.style.display = op === 'deploy' ? 'block' : 'none';
    });

    nextButton.addEventListener('click', async () => {
        nextButton.disabled = true;
        nextButton.textContent = 'Processing...';

        const [txid, vout] = utxoDropdown.value.split(':');
        const selectedUtxo = selectedWallet.utxos.find(utxo => 
            utxo.txid === txid && utxo.vout.toString() === vout
        );

        const tokenData = {
            p: tokenStandardDropdown.value,
            op: operationDropdown.value,
            tick: tickInput.value
        };

        if (operationDropdown.value === 'mint' || operationDropdown.value === 'transfer') {
            tokenData.amt = amountInput.value;
        }
        if (operationDropdown.value === 'deploy') {
            if (maxInput.value) tokenData.max = maxInput.value;
            if (limitInput.value) tokenData.lim = limitInput.value;
        }

        const requestBody = {
            receiving_address: addressInput.value.trim() || selectedWallet.address,
            meme_type: 'text/plain; charset=utf-8',
            hex_data: stringToHex(JSON.stringify(tokenData)),
            sending_address: selectedWallet.address,
            privkey: selectedWallet.privkey,
            utxo: selectedUtxo.txid,
            vout: selectedUtxo.vout,
            script_hex: selectedUtxo.script_hex,
            utxo_amount: selectedUtxo.value
        };

        try {
            const response = await fetch(`/bitcore_lib/generate_ord_hexs/${selectedWallet.ticker}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();
            console.log('Response Data:', JSON.stringify(data, null, 2));

            if (data.pendingTransactions && Array.isArray(data.pendingTransactions) && data.pendingTransactions.length > 0) {
                try {
                    // Save transaction hexes
                    let existingHexes = JSON.parse(localStorage.getItem('transactionHexes')) || [];
                    const newHexes = data.pendingTransactions.map(tx => tx.hex);
                    existingHexes.push(...newHexes);
                    localStorage.setItem('transactionHexes', JSON.stringify(existingHexes));

                    // Save pending transactions
                    const pendingTxs = data.pendingTransactions.map(tx => ({
                        ...tx,
                        ticker: selectedWallet.ticker
                    }));
                    localStorage.setItem('mintResponse', JSON.stringify({ pendingTransactions: pendingTxs }));

                    // Save pending UTXO
                    let pendingUTXOs = JSON.parse(localStorage.getItem('pendingUTXOs')) || [];
                    const usedUtxo = {
                        txid: selectedUtxo.txid,
                        vout: selectedUtxo.vout
                    };
                    
                    if (!pendingUTXOs.some(utxo => utxo.txid === usedUtxo.txid && utxo.vout === usedUtxo.vout)) {
                        pendingUTXOs.push(usedUtxo);
                        localStorage.setItem('pendingUTXOs', JSON.stringify(pendingUTXOs));
                    }

                    // Navigate to inscribe UI
                    landingPage.innerHTML = '';
                    inscribeUI(selectedWallet);

                } catch (error) {
                    console.error('Error processing response:', error);
                    alert('An error occurred while processing the response.');
                    nextButton.disabled = false;
                    nextButton.textContent = 'Next';
                }
            } else {
                console.error('Invalid response format:', data);
                alert(data.message || 'An error occurred.');
                nextButton.disabled = false;
                nextButton.textContent = 'Next';
            }
        } catch (error) {
            console.error('Error generating transaction:', error);
            alert('An error occurred while generating the transaction.');
            nextButton.disabled = false;
            nextButton.textContent = 'Next';
        }
    });
}

// Utility function
function stringToHex(str) {
    return str.split('').map(c => 
        c.charCodeAt(0).toString(16).padStart(2, '0')
    ).join('');
} 