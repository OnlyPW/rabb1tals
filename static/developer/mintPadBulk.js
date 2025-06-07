import { mintPadUI } from './mintpad.js';
import { inscribeUI } from './inscriber.js';

export function mintPadBulkUI(selectedWallet) {
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
    title.textContent = 'Mint Pad Bulk';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // Display the collection name
    const pendingCollectionDetails = JSON.parse(localStorage.getItem('pendingCollectionDetails'));
    const collectionName = pendingCollectionDetails.collection_name || 'Unknown Collection';
    const collectionNameDisplay = document.createElement('h2');
    collectionNameDisplay.textContent = `Collection: ${collectionName}`;
    collectionNameDisplay.className = 'collection-name';
    landingPage.appendChild(collectionNameDisplay);

    // Number of mints selector
    const numMintsDropdown = document.createElement('select');
    numMintsDropdown.className = 'styled-select';
    landingPage.appendChild(numMintsDropdown);

    // Automatically update UTXO dropdown based on selected wallet
    const wallets = JSON.parse(localStorage.getItem('wallets')) || [];
    const mintPriceInCoins = parseFloat(pendingCollectionDetails.mint_price) / 100000000;
    const minUtxoValue = mintPriceInCoins + 0.30;

    const selectedWalletUtxos = selectedWallet.utxos
        .filter(utxo => parseFloat(utxo.value) >= minUtxoValue && utxo.confirmations >= 1);

    numMintsDropdown.innerHTML = '';
    for (let i = 1; i <= selectedWalletUtxos.length; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        numMintsDropdown.appendChild(option);
    }

    if (selectedWalletUtxos.length === 0) {
        numMintsDropdown.innerHTML = '<option disabled>No UTXOs available above the required amount with sufficient confirmations</option>';
    }

    // Bulk Inscribe button
    const inscribeButton = document.createElement('button');
    inscribeButton.textContent = 'Bulk Inscribe';
    inscribeButton.className = 'styled-button';
    inscribeButton.addEventListener('click', () => {
        generateBulkTransactions().then(() => {
            landingPage.innerHTML = '';
            inscribeUI(selectedWallet);
        }).catch(error => {
            console.error('Error generating bulk transactions:', error);
            alert('An error occurred while generating bulk transactions.');
        });
    });
    landingPage.appendChild(inscribeButton);

    function generateBulkTransactions() {
        return new Promise((resolve, reject) => {
            const numMints = parseInt(numMintsDropdown.value, 10);
            const selectedUtxos = selectedWalletUtxos.slice(0, numMints);

            if (selectedUtxos.length === 0) {
                alert('Please select a UTXO.');
                return reject('No UTXO selected');
            }

            const mintAddress = pendingCollectionDetails.mint_address;
            const collectionName = pendingCollectionDetails.collection_name;

            if (!collectionName) {
                alert('Collection name is not set. Please try again.');
                return reject('Collection name not set');
            }

            const pendingTransactions = [];
            inscribeButton.textContent = 'Processing';

            const transactionPromises = selectedUtxos.map(utxo => {
                return retryTransaction(utxo, selectedWallet, mintAddress, collectionName, pendingCollectionDetails, 5);
            });

            Promise.all(transactionPromises).then(() => {
                if (pendingTransactions.length > 0) {
                    console.log('Pending Transactions:', pendingTransactions);
                    localStorage.setItem('mintResponse', JSON.stringify({ pendingTransactions }));
                    resolve();
                } else {
                    console.error('No pending transactions were created.');
                    reject('No pending transactions created');
                }
                inscribeButton.textContent = 'Bulk Inscribe';
            }).catch(error => {
                console.error('Error in processing transactions:', error);
                inscribeButton.textContent = 'Bulk Inscribe';
                reject(error);
            });

            function retryTransaction(utxo, selectedWallet, mintAddress, collectionName, pendingCollectionDetails, retries) {
                return new Promise((resolve, reject) => {
                    const attemptTransaction = (attempt) => {
                        fetch(`/rc001/mint_hex/${selectedWallet.ticker}/${collectionName}`)
                            .then(response => response.json())
                            .then(mintData => {
                                if (mintData.status === "success") {
                                    const hexString = mintData.hex;

                                    const requestBody = {
                                        receiving_address: selectedWallet.address,
                                        meme_type: 'text/html',
                                        hex_data: hexString,
                                        sending_address: selectedWallet.address,
                                        privkey: selectedWallet.privkey,
                                        utxo: utxo.txid,
                                        vout: utxo.vout,
                                        script_hex: utxo.script_hex,
                                        utxo_amount: utxo.value,
                                        mint_address: mintAddress,
                                        mint_price: pendingCollectionDetails.mint_price
                                    };

                                    return fetch(`/rc001/mint_rc001/${selectedWallet.ticker}`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify(requestBody)
                                    });
                                } else {
                                    throw new Error('Error generating mint hex: ' + mintData.message);
                                }
                            })
                            .then(response => response.json())
                            .then(data => {
                                if (data.pendingTransactions) {
                                    pendingTransactions.push(...data.pendingTransactions.map(tx => ({
                                        ...tx,
                                        ticker: selectedWallet.ticker
                                    })));
                                    resolve();
                                } else {
                                    alert(data.message || 'An error occurred.');
                                    reject(new Error('No pending transactions returned.'));
                                }
                            })
                            .catch(error => {
                                console.error(`Error generating transaction (attempt ${attempt}):`, error);
                                if (attempt < retries) {
                                    setTimeout(() => attemptTransaction(attempt + 1), 100);
                                } else {
                                    reject(error);
                                }
                            });
                    };

                    attemptTransaction(1);
                });
            }
        });
    }
} 