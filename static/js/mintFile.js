import { initializeWallet } from './main.js';
import { coins } from './networks.js';
import { inscribeUI } from './inscriber.js';
import { mintUI } from './mint.js';

export function mintFileUI(selectedWallet) {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = '';

    // Create header with back button
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
    title.textContent = 'Mint File';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // UTXO selection dropdown
    const utxoDropdown = document.createElement('select');
    utxoDropdown.className = 'wallet-selector input-margin';
    
    // Populate UTXO dropdown
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

    // Receiving address input
    const addressInput = document.createElement('input');
    addressInput.type = 'text';
    addressInput.placeholder = 'Enter receiving address (optional)';
    addressInput.className = 'styled-input input-margin';
    landingPage.appendChild(addressInput);

    // File selection input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'file-input';
    fileInput.style.display = 'none';
    landingPage.appendChild(fileInput);
    
    // File selection button
    const fileButton = document.createElement('button');
    fileButton.className = 'styled-button input-margin';
    fileButton.textContent = 'Choose File';
    fileButton.addEventListener('click', () => fileInput.click());
    landingPage.appendChild(fileButton);

    // Selected file display
    const fileDisplay = document.createElement('div');
    fileDisplay.className = 'styled-text input-margin';
    landingPage.appendChild(fileDisplay);

    // Next button
    const nextButton = document.createElement('button');
    nextButton.className = 'styled-button input-margin';
    nextButton.textContent = 'Next';
    nextButton.disabled = true;
    landingPage.appendChild(nextButton);

    // Handle file selection
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            if (file.size <= 65 * 1024) {
                fileDisplay.textContent = `Selected: ${file.name}`;
                nextButton.disabled = false;
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    const base64 = e.target.result.split(',')[1];
                    const hex = base64ToHex(base64);
                    localStorage.setItem('mintFile', JSON.stringify({
                        mimeType: file.type,
                        hex: hex,
                        receivingAddress: addressInput.value.trim() || selectedWallet.address
                    }));
                };
                reader.readAsDataURL(file);
            } else {
                alert('File must be under 65 KB');
                fileInput.value = '';
                fileDisplay.textContent = '';
                nextButton.disabled = true;
            }
        }
    });

    // Handle next button click
    nextButton.addEventListener('click', () => {
        const mintFile = JSON.parse(localStorage.getItem('mintFile'));
        if (!mintFile) {
            alert('Please select a file first');
            return;
        }

        if (!utxoDropdown.value) {
            alert('Please select a UTXO');
            return;
        }

        // Check for pending transactions
        const pendingTransactions = JSON.parse(localStorage.getItem('mintResponse'))?.pendingTransactions || [];
        if (pendingTransactions.length > 0) {
            alert('There are pending transactions. Continuing to inscribe UI.');
            landingPage.innerHTML = '';
            inscribeUI(selectedWallet);
            return;
        }

        const [txid, vout] = utxoDropdown.value.split(':');
        const selectedUtxo = selectedWallet.utxos.find(utxo => 
            utxo.txid === txid && utxo.vout.toString() === vout
        );

        if (!selectedUtxo || !selectedUtxo.script_hex) {
            alert('Invalid UTXO selection');
            return;
        }

        // Disable button and show processing state
        nextButton.disabled = true;
        nextButton.textContent = 'Processing...';

        const requestBody = {
            receiving_address: mintFile.receivingAddress,
            meme_type: mintFile.mimeType,
            hex_data: mintFile.hex,
            sending_address: selectedWallet.address,
            privkey: selectedWallet.privkey,
            utxo: selectedUtxo.txid,
            vout: selectedUtxo.vout,
            script_hex: selectedUtxo.script_hex,
            utxo_amount: selectedUtxo.value
        };

        console.log('Request Body:', requestBody);

        fetch(`/bitcore_lib/generate_ord_hexs/${selectedWallet.ticker}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        })
        .then(response => {
            console.log('Full Response:', response);
            return response.json();
        })
        .then(data => {
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

                    // Clear mintFile and navigate
                    localStorage.removeItem('mintFile');
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
        })
        .catch(error => {
            console.error('Error generating transaction:', error);
            alert('An error occurred while generating the transaction.');
            nextButton.disabled = false;
            nextButton.textContent = 'Next';
        });
    });
}

// Utility function
function base64ToHex(base64) {
    const raw = atob(base64);
    let result = '';
    for (let i = 0; i < raw.length; i++) {
        const hex = raw.charCodeAt(i).toString(16);
        result += (hex.length === 2 ? hex : '0' + hex);
    }
    return result.toUpperCase();
} 