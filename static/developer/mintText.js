import { mintUI } from './mint.js';
import { inscribeUI } from './inscriber.js';

export function mintTextUI(selectedWallet) {
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

    // Title
    const title = document.createElement('h1');
    title.textContent = 'Mint Text';
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

    // MIME Type Dropdown
    const mimeTypeDropdown = document.createElement('select');
    mimeTypeDropdown.className = 'wallet-selector input-margin';
    const mimeTypes = [
        'text/plain;charset=utf-8',
        'application/json;charset=utf-8',
        'text/html;charset=utf-8',
        'text/css;charset=utf-8',
        'application/javascript;charset=utf-8'
    ];
    mimeTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        mimeTypeDropdown.appendChild(option);
    });
    landingPage.appendChild(mimeTypeDropdown);

    // Text Input Area
    const textArea = document.createElement('textarea');
    textArea.className = 'styled-input input-margin';
    textArea.style.height = '200px';
    textArea.style.resize = 'none';
    landingPage.appendChild(textArea);

    // Receiving address input
    const addressInput = document.createElement('input');
    addressInput.type = 'text';
    addressInput.placeholder = 'Enter receiving address (optional)';
    addressInput.className = 'styled-input input-margin';
    landingPage.appendChild(addressInput);

    // Next button
    const nextButton = document.createElement('button');
    nextButton.className = 'styled-button input-margin';
    nextButton.textContent = 'Next';
    landingPage.appendChild(nextButton);

    // Handle next button click
    nextButton.addEventListener('click', async () => {
        if (!textArea.value.trim()) {
            alert('Please enter some text');
            return;
        }

        const selectedUtxoValue = utxoDropdown.value;
        if (!selectedUtxoValue || selectedUtxoValue.includes('No UTXOs available')) {
            alert('Please select a valid UTXO');
            return;
        }

        const [txid, vout] = selectedUtxoValue.split(':');
        const selectedUtxo = selectedWallet.utxos.find(
            utxo => utxo.txid === txid && utxo.vout.toString() === vout
        );

        try {
            const textContent = textArea.value;
            const base64Data = btoa(unescape(encodeURIComponent(textContent)));
            const hex = base64ToHex(base64Data);

            const requestBody = {
                receiving_address: addressInput.value.trim() || selectedWallet.address,
                meme_type: mimeTypeDropdown.value,
                hex_data: hex,
                sending_address: selectedWallet.address,
                privkey: selectedWallet.privkey,
                utxo: selectedUtxo.txid,
                vout: selectedUtxo.vout,
                script_hex: selectedUtxo.script_hex,
                utxo_amount: selectedUtxo.value
            };

            nextButton.disabled = true;
            nextButton.textContent = 'Processing...';

            const apiResponse = await fetch(`/bitcore_lib/generate_ord_hexs/${selectedWallet.ticker}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!apiResponse.ok) {
                throw new Error(`HTTP error! status: ${apiResponse.status}`);
            }

            const data = await apiResponse.json();
            
            if (data.pendingTransactions && Array.isArray(data.pendingTransactions) && data.pendingTransactions.length > 0) {
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
            } else {
                throw new Error('Invalid response structure: missing pendingTransactions array');
            }
        } catch (error) {
            console.error('Error details:', error);
            alert('Error generating transaction: ' + error.message);
            nextButton.disabled = false;
            nextButton.textContent = 'Next';
        }
    });
}

// Utility function
function base64ToHex(base64String) {
    const raw = atob(base64String);
    let result = '';
    for (let i = 0; i < raw.length; i++) {
        const hex = raw.charCodeAt(i).toString(16);
        result += (hex.length === 2 ? hex : '0' + hex);
    }
    return result.toUpperCase();
} 