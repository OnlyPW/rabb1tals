import { mintPadUI } from './mintpad.js';
import { inscribeUI } from './inscriber.js';

export function mintPadScreen2UI(selectedWallet) {
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
        mintPadUI(selectedWallet);
    });

    header.appendChild(backButton);
    landingPage.appendChild(header);

    // Title
    const title = document.createElement('h1');
    title.textContent = 'Mint Pad Screen 2';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // Display the collection name
    const pendingCollectionDetails = JSON.parse(localStorage.getItem('pendingCollectionDetails'));
    const collectionName = pendingCollectionDetails.collection_name || 'Unknown Collection';
    const collectionNameDisplay = document.createElement('h2');
    collectionNameDisplay.textContent = `Collection: ${collectionName}`;
    collectionNameDisplay.className = 'collection-name';
    landingPage.appendChild(collectionNameDisplay);

    // Automatically select the UTXO with the largest amount
    const mintPriceInCoins = parseFloat(pendingCollectionDetails.mint_price) / 100000000;
    const minUtxoValue = mintPriceInCoins + 0.30;

    const selectedUtxo = selectedWallet.utxos
        .filter(utxo => parseFloat(utxo.value) >= minUtxoValue && utxo.confirmations >= 1)
        .sort((a, b) => parseFloat(b.value) - parseFloat(a.value))[0];

    if (!selectedUtxo) {
        alert('No suitable UTXO found. Please ensure your wallet has sufficient funds.');
        return;
    }

    // Receiving address input
    const addressInput = document.createElement('input');
    addressInput.type = 'text';
    addressInput.placeholder = 'Enter receiving address (optional)';
    addressInput.className = 'styled-input';
    landingPage.appendChild(addressInput);

    // Fee selector (sat/vB)
    const feeInfo = document.createElement('p');
    feeInfo.className = 'styled-text';
    feeInfo.style.margin = '8px 20px 0';
    feeInfo.style.opacity = '0.9';
    feeInfo.textContent = 'Gebühr (sat/vB). Diese Fee wird beim Erzeugen der Transaktionen verwendet.';
    landingPage.appendChild(feeInfo);

    const feeInput = document.createElement('input');
    feeInput.type = 'number';
    feeInput.min = '0.5';
    feeInput.step = '0.1';
    feeInput.value = '1.0';
    feeInput.placeholder = 'z.B. 1.0';
    feeInput.className = 'styled-input';
    landingPage.appendChild(feeInput);

    // Inscribe button
    const inscribeButton = document.createElement('button');
    inscribeButton.textContent = 'Inscribe';
    inscribeButton.className = 'styled-button';
    inscribeButton.addEventListener('click', () => {
        generateTransactions(selectedUtxo).then(() => {
            landingPage.innerHTML = '';
            inscribeUI(selectedWallet);
        }).catch(error => {
            console.error('Error generating transaction:', error);
            alert('An error occurred while generating the transaction.');
        });
    });
    landingPage.appendChild(inscribeButton);

    function generateTransactions(selectedUtxo) {
        return new Promise((resolve, reject) => {
            const pendingHexData = JSON.parse(localStorage.getItem('pendingHexData'));
            if (!pendingHexData) {
                alert('No pending hex data found. Please ensure the data is available.');
                return reject('No pending hex data');
            }

            const receivingAddressInput = addressInput.value.trim();
            const receivingAddress = receivingAddressInput || selectedWallet.address;

            const mintPrice = parseFloat(pendingCollectionDetails.mint_price);
            const mintAddress = pendingCollectionDetails.mint_address;

            const feeSatPerVb = parseFloat(feeInput.value || '1.0');
            const feePerKb = Math.max(1, Math.round(feeSatPerVb * 1000)); // convert to sat/kB as backend expects

            const requestBody = {
                receiving_address: receivingAddress,
                meme_type: pendingHexData.mimeType,
                hex_data: pendingHexData.hexData,
                sending_address: selectedWallet.address,
                privkey: selectedWallet.privkey,
                utxo: selectedUtxo.txid,
                vout: selectedUtxo.vout,
                script_hex: selectedUtxo.script_hex,
                utxo_amount: selectedUtxo.value,
                fee_per_kb: feePerKb
            };

            if (mintPrice > 0) {
                requestBody.mint_address = mintAddress;
                requestBody.mint_price = mintPrice;
            }

            console.log('Request Body:', requestBody);

            fetch(`/rc001/mint_rc001/${selectedWallet.ticker}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            })
            .then(response => {
                if (!response.ok) {
                    return response.text().then(text => {
                        throw new Error(`Server error: ${text}`);
                    });
                }
                return response.json();
            })
            .then(data => {
                console.log('Response Data:', JSON.stringify(data, null, 2));

                if (data.pendingTransactions && Array.isArray(data.pendingTransactions) && data.pendingTransactions.length > 0) {
                    console.log('Pending Transactions:', data.pendingTransactions);

                    try {
                        let existingHexes = JSON.parse(localStorage.getItem('transactionHexes')) || [];
                        const newHexes = data.pendingTransactions.map(tx => tx.hex);
                        existingHexes.push(...newHexes);
                        localStorage.setItem('transactionHexes', JSON.stringify(existingHexes));
                        console.log('Transaction hexes saved successfully:', newHexes);
                    } catch (error) {
                        console.error('Error saving transaction hexes to local storage:', error);
                        alert('An error occurred while saving the transaction hexes.');
                    }

                    try {
                        const pendingTransactions = data.pendingTransactions.map(tx => ({
                            ...tx,
                            ticker: selectedWallet.ticker
                        }));

                        localStorage.setItem('mintResponse', JSON.stringify({ pendingTransactions }));
                        console.log('Mint response saved successfully.');
                        
                        resolve();
                    } catch (error) {
                        console.error('Error saving mintResponse to local storage:', error);
                        alert('An error occurred while saving the mint response.');
                        reject(error);
                    }

                    try {
                        let pendingUTXOs = JSON.parse(localStorage.getItem('pendingUTXOs')) || [];
                        const usedUtxo = {
                            txid: selectedUtxo.txid,
                            vout: selectedUtxo.vout
                        };

                        const isAlreadyPending = pendingUTXOs.some(utxo => utxo.txid === usedUtxo.txid && utxo.vout === usedUtxo.vout);
                        if (!isAlreadyPending) {
                            pendingUTXOs.push(usedUtxo);
                            localStorage.setItem('pendingUTXOs', JSON.stringify(pendingUTXOs));
                            console.log('Pending UTXO saved:', usedUtxo);
                        } else {
                            console.log('UTXO is already marked as pending:', usedUtxo);
                        }
                    } catch (error) {
                        console.error('Error saving pending UTXOs to local storage:', error);
                        alert('An error occurred while saving the pending UTXO.');
                    }

                    localStorage.removeItem('pendingHexData');
                } else {
                    console.error('Mint API did not return pendingTransactions or it is empty:', data);
                    alert(data.message || 'An error occurred.');
                    reject('No pending transactions returned');
                }
            })
            .catch(error => {
                console.error('Error generating transaction:', error);
                alert('An error occurred while generating the transaction.');
                reject(error);
            });
        });
    }
}