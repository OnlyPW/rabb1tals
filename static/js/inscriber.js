import { initializeWallet } from './main.js';
import { mintUI } from './mint.js';
import { coins } from './networks.js';

export function inscribeUI(selectedWallet) {
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

    // Find the coin data for the selected wallet to get the color
    const selectedCoin = coins.find(coin => coin.ticker === selectedWallet.ticker);
    if (selectedCoin) {
        landingPage.style.backgroundColor = selectedCoin.color;
    }

    // Title
    const title = document.createElement('h1');
    title.textContent = 'Inscribe Transactions';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // Pending Transactions Counter
    const pendingTxDisplay = document.createElement('div');
    pendingTxDisplay.className = 'styled-text input-margin';
    landingPage.appendChild(pendingTxDisplay);

    // Initialize Pending Transactions Counter
    const mintResponse = JSON.parse(localStorage.getItem('mintResponse')) || {};
    let pendingTransactions = mintResponse.pendingTransactions || [];
    updatePendingTxCounter(pendingTransactions.length);

    // Inscription Name Input
    const inscriptionNameInput = document.createElement('input');
    inscriptionNameInput.type = 'text';
    inscriptionNameInput.placeholder = 'Inscription name';
    inscriptionNameInput.className = 'styled-input input-margin';
    landingPage.appendChild(inscriptionNameInput);

    // Inscribe button
    const inscribeButton = document.createElement('button');
    inscribeButton.className = 'styled-button input-margin';
    inscribeButton.textContent = 'Inscribe';
    inscribeButton.addEventListener('click', inscribeAllTransactions);
    landingPage.appendChild(inscribeButton);

    function updatePendingTxCounter(count) {
        pendingTxDisplay.textContent = `Pending Transactions: ${count}`;
    }

    function inscribeTransaction(showAlert = true) {
        const mintResponse = JSON.parse(localStorage.getItem('mintResponse')) || {};
        let pendingTransactions = mintResponse.pendingTransactions || [];
        
        if (pendingTransactions.length === 0) {
            alert('No pending transactions available.');
            return Promise.reject('No pending transactions available.');
        }

        inscribeButton.disabled = true;
        inscribeButton.textContent = 'Processing...';

        const topTransaction = pendingTransactions[0];
        const ticker = topTransaction.ticker || (window.selectedWallet && window.selectedWallet.ticker);

        if (!ticker) {
            console.error('No ticker found in transaction:', topTransaction);
            inscribeButton.disabled = false;
            inscribeButton.textContent = 'Inscribe';
            return Promise.reject('Transaction missing ticker information');
        }

        console.log('Broadcasting transaction:', {
            ticker: ticker,
            hex: topTransaction.hex,
            transactionNumber: topTransaction.transactionNumber
        });

        return fetch(`/api/sendrawtransaction/${ticker}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw_tx: topTransaction.hex })
        })
        .then(response => {
            console.log('Raw response:', response);
            return response.json();
        })
        .then(data => {
            console.log('Response data:', data);
            
            if (data.status === 'success' || data.txid) {
                const inscriptionName = inscriptionNameInput.value.trim();
                const myInscriptions = JSON.parse(localStorage.getItem('MyInscriptions')) || [];

                if (topTransaction.transactionNumber === 2) {
                    const txid = data.txid || data.data?.txid;
                    myInscriptions.push({
                        name: inscriptionName || 'Unnamed Inscription',
                        txid: txid,
                        inscriptionId: `${txid}i0`,
                        sendingaddress: selectedWallet.address
                    });
                    localStorage.setItem('MyInscriptions', JSON.stringify(myInscriptions));
                }

                pendingTransactions.shift();
                localStorage.setItem('mintResponse', JSON.stringify({ pendingTransactions }));
                updatePendingTxCounter(pendingTransactions.length);

                if (showAlert) {
                    const txid = data.txid || data.data?.txid;
                    alert(`Transaction broadcast successfully!\nTXID: ${txid}\nInscription ID: ${txid}i0`);
                }
            } else {
                const errorMessage = data.message || data.error || 'Failed to broadcast transaction';
                console.error('Transaction error:', errorMessage, data);
                throw new Error(errorMessage);
            }
        })
        .catch(error => {
            console.error('Full error details:', error);
            if (showAlert) {
                alert('Error broadcasting transaction: ' + (error.message || error));
            }
            return Promise.reject(error.message || error);
        })
        .finally(() => {
            inscribeButton.disabled = false;
            inscribeButton.textContent = 'Inscribe';
        });
    }

    function inscribeAllTransactions() {
        function processNextTransaction() {
            if (pendingTransactions.length === 0) {
                alert('All transactions processed successfully!');
                return;
            }

            inscribeTransaction(false)
                .then(() => {
                    pendingTransactions = JSON.parse(localStorage.getItem('mintResponse')).pendingTransactions || [];
                    setTimeout(processNextTransaction, 1000);
                })
                .catch(error => {
                    console.error('Error processing transactions:', error);
                    alert('Error processing transactions: ' + error);
                });
        }

        processNextTransaction();
    }
} 