import { initializeWallet } from './main.js';
import { coins } from './networks.js'; // Import coins to get the color

/**
 * Converts coin amount to satoshis
 * @param {number} amount - Amount in coins
 * @returns {number} Amount in satoshis
 */
function toSatoshis(amount) {
    return Math.floor(amount * 100000000);
}

export function sendTXUI(walletData) {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = ''; // Clear existing content

    // Find the coin data for the selected wallet to get the color
    const selectedCoin = coins.find(coin => coin.ticker === walletData.ticker);
    if (selectedCoin) {
        landingPage.style.backgroundColor = selectedCoin.color; // Set background color
    }

    // Create header with back button
    const header = document.createElement('div');
    header.className = 'header';

    const backButton = document.createElement('button');
    backButton.className = 'back-button';
    backButton.innerHTML = '<img src="./static/images/back.png" alt="Back Icon" />';
    backButton.addEventListener('click', () => {
        landingPage.innerHTML = ''; // Clear the UI
        initializeWallet(); // Return to main wallet UI
    });

    header.appendChild(backButton);
    landingPage.appendChild(header);

    // Create title
    const title = document.createElement('h1');
    title.textContent = 'Send Transaction';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // Add wallet selector with mobile-friendly styling
    const walletSelector = document.createElement('select');
    walletSelector.className = 'wallet-selector';
    const wallets = JSON.parse(localStorage.getItem('wallets')) || [];
    wallets
        .filter(wallet => wallet.ticker === walletData.ticker)
        .forEach(wallet => {
            const option = document.createElement('option');
            option.value = wallet.label;
            option.textContent = wallet.label;
            if (wallet.label === walletData.label) {
                option.selected = true;
            }
            walletSelector.appendChild(option);
        });
    landingPage.appendChild(walletSelector);

    // Add balance display with mobile-friendly styling
    const balance = document.createElement('div');
    balance.className = 'balance';
    balance.textContent = `${walletData.balance.toFixed(8)} ${walletData.ticker}`;
    landingPage.appendChild(balance);

    // Create form container
    const formContainer = document.createElement('div');
    formContainer.className = 'tx-form-container';

    // Create form
    const form = document.createElement('form');
    form.className = 'wallet-form';

    // Receiving address input
    const receivingAddressInput = document.createElement('input');
    receivingAddressInput.type = 'text';
    receivingAddressInput.id = 'receivingAddress';
    receivingAddressInput.placeholder = 'Receiving Address';
    receivingAddressInput.className = 'styled-input';
    receivingAddressInput.required = true;
    receivingAddressInput.autocomplete = 'off';
    form.appendChild(receivingAddressInput);

    // Amount input in coins
    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.id = 'amount';
    amountInput.placeholder = `Amount in ${walletData.ticker}`;
    amountInput.className = 'styled-input';
    amountInput.required = true;
    amountInput.step = '0.00000001';
    amountInput.min = '0.00000001';
    amountInput.autocomplete = 'off';
    form.appendChild(amountInput);

    // Amount input in USD
    const usdAmountContainer = document.createElement('div');
    usdAmountContainer.className = 'usd-amount-container';

    const usdLabel = document.createElement('span');
    usdLabel.textContent = '$';
    usdLabel.className = 'usd-label';

    const usdAmountInput = document.createElement('input');
    usdAmountInput.type = 'number';
    usdAmountInput.id = 'usdAmount';
    usdAmountInput.placeholder = 'Amount in USD';
    usdAmountInput.className = 'styled-input';
    usdAmountInput.step = '0.01';
    usdAmountInput.autocomplete = 'off';

    usdAmountContainer.appendChild(usdLabel);
    usdAmountContainer.appendChild(usdAmountInput);
    form.appendChild(usdAmountContainer);

    // Fetch prices and set up event listeners
    fetch('/prices/prices')
        .then(response => response.json())
        .then(pricesData => {
            const coinPriceInUSD = parseFloat(pricesData[walletData.ticker]?.aggregated);

            if (!coinPriceInUSD) {
                console.error('Price data not available for the selected coin.');
                return;
            }

            // Update USD amount when coin amount is entered
            amountInput.addEventListener('input', () => {
                const coinAmount = parseFloat(amountInput.value);
                if (!isNaN(coinAmount)) {
                    const usdAmount = coinAmount * coinPriceInUSD;
                    usdAmountInput.value = usdAmount.toFixed(2);
                } else {
                    usdAmountInput.value = '';
                }
            });

            // Update coin amount when USD amount is entered
            usdAmountInput.addEventListener('input', () => {
                const usdAmount = parseFloat(usdAmountInput.value);
                if (!isNaN(usdAmount)) {
                    const coinAmount = usdAmount / coinPriceInUSD;
                    amountInput.value = coinAmount.toFixed(8); // Adjust precision as needed
                } else {
                    amountInput.value = '';
                }
            });
        })
        .catch(error => {
            console.error('Error fetching prices:', error);
        });

    // Subtract fee checkbox
    const subtractFeeContainer = document.createElement('div');
    subtractFeeContainer.className = 'checkbox-container';
    
    const subtractFeeCheckbox = document.createElement('input');
    subtractFeeCheckbox.type = 'checkbox';
    subtractFeeCheckbox.id = 'subtractFee';
    subtractFeeCheckbox.className = 'styled-checkbox';
    
    const subtractFeeLabel = document.createElement('label');
    subtractFeeLabel.htmlFor = 'subtractFee';
    subtractFeeLabel.textContent = 'Subtract fee';
    
    subtractFeeContainer.appendChild(subtractFeeCheckbox);
    subtractFeeContainer.appendChild(subtractFeeLabel);
    form.appendChild(subtractFeeContainer);

    // Fee container and label first
    const feeContainer = document.createElement('div');
    feeContainer.className = 'fee-container';

    const feeLabel = document.createElement('div');
    feeLabel.textContent = 'Fee: ';
    feeLabel.className = 'fee-label';

    const feeDisplay = document.createElement('span');
    feeDisplay.id = 'feeDisplay';
    feeDisplay.style.cursor = 'pointer';

    const networkFeeMin = selectedCoin?.networkfee_min || 100000; // Default min fee
    const networkFeeMax = selectedCoin?.networkfee_max || 10000000; // Default max fee
    const defaultFee = (networkFeeMin + networkFeeMax) / 2; // Use average as default

    feeDisplay.textContent = (defaultFee / 100000000).toFixed(8);

    // Add click handler for fee display only if no networkFee is defined
    if (!selectedCoin || !selectedCoin.networkfee) {
        feeDisplay.addEventListener('click', () => {
            const currentFee = parseFloat(feeDisplay.textContent);
            const feeInput = document.createElement('input');
            feeInput.type = 'number';
            feeInput.value = currentFee;
            feeInput.step = '0.00000001';
            feeInput.style.width = '150px';
            feeInput.className = 'styled-input';
            
            // Replace fee display with input
            feeDisplay.style.display = 'none';
            feeLabel.insertBefore(feeInput, feeDisplay);
            feeInput.focus();
            
            // Handle input blur
            feeInput.addEventListener('blur', () => {
                const newFee = parseFloat(feeInput.value);
                if (!isNaN(newFee)) {
                    const feeInSats = Math.floor(newFee * 100000000);
                    // Update slider value within its min/max bounds
                    feeSlider.value = Math.min(Math.max(feeInSats, feeSlider.min), feeSlider.max);
                    // Display can show any value
                    feeDisplay.textContent = newFee.toFixed(8);
                }
                feeInput.remove();
                feeDisplay.style.display = 'inline';
            });
            
            // Handle enter key
            feeInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    feeInput.blur();
                }
            });
        });
    }

    // Append fee display to label and add to container first
    feeLabel.appendChild(feeDisplay);
    feeLabel.appendChild(document.createTextNode(` ${walletData.ticker}`));
    feeContainer.appendChild(feeLabel);

    // Only create and append slider if no networkFee is defined
    if (!selectedCoin || !selectedCoin.networkfee) {
        const feeSlider = document.createElement('input');
        feeSlider.type = 'range';
        feeSlider.id = 'fee';
        feeSlider.className = 'styled-slider';

        // Set slider min, max, and default value based on network fee range
        feeSlider.min = networkFeeMin.toString();
        feeSlider.max = networkFeeMax.toString();
        feeSlider.value = defaultFee.toString();

        feeSlider.addEventListener('input', (e) => {
            const feeInSats = parseInt(e.target.value);
            feeDisplay.textContent = (feeInSats / 100000000).toFixed(8);

            // Remove any fee input box if present
            const feeInput = feeLabel.querySelector('input[type="number"]');
            if (feeInput) {
                feeInput.remove();
                feeDisplay.style.display = 'inline';
            }
        });

        feeContainer.appendChild(feeSlider);
    }

    // Append the entire fee container to the form
    form.appendChild(feeContainer);

    // Create submit button
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'styled-button';
    submitButton.textContent = 'Send';
    form.appendChild(submitButton);

    // Add error message div
    const errorDiv = document.createElement('div');
    errorDiv.id = 'errorMessage';
    errorDiv.className = 'error-message';
    errorDiv.style.display = 'none';
    form.appendChild(errorDiv);

    // Append form to landing page
    formContainer.appendChild(form);
    landingPage.appendChild(formContainer);

    // Add wallet selector change handler
    walletSelector.addEventListener('change', () => {
        const selectedWallet = wallets.find(wallet => 
            wallet.ticker === walletData.ticker && 
            wallet.label === walletSelector.value
        );
        if (selectedWallet) {
            walletData = selectedWallet;
            balance.textContent = `${selectedWallet.balance.toFixed(8)} ${selectedWallet.ticker}`;
        }
    });

    // Create result container
    const resultContainer = document.createElement('div');
    resultContainer.className = 'tx-result-container';
    resultContainer.innerHTML = `
        <div class="tx-hex-container" style="display: none;">
            <textarea id="txHex" readonly class="styled-input styled-text"></textarea>
            <button id="copyTxHex" class="button styled-text">Copy</button>
        </div>
        <div id="errorMessage" class="error-message styled-text" style="display: none;"></div>
    `;

    // Add form submission handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorDiv = document.getElementById('errorMessage');
        const submitButton = form.querySelector('button[type="submit"]');

        try {
            submitButton.disabled = true;
            submitButton.textContent = 'Sending...';

            const amountInputValue = parseFloat(document.getElementById('amount').value);
            // Get fee from the display text instead of slider value
            const feeInSats = Math.floor(parseFloat(feeDisplay.textContent) * 100000000);
            const receivingAddress = document.getElementById('receivingAddress').value.trim();
            const subtractFee = document.getElementById('subtractFee').checked;

            // Validate inputs
            if (!receivingAddress) throw new Error('Receiving address is required');
            if (isNaN(amountInputValue) || amountInputValue <= 0) {
                throw new Error('Invalid amount');
            }
            if (amountInputValue < 0.00000001) {
                throw new Error('Amount must be at least 0.00000001');
            }
            
            // Updated fee validation to allow higher network fees
            if (networkFeeMin && feeInSats < networkFeeMin) {
                throw new Error(`Fee must be at least ${(networkFeeMin / 100000000).toFixed(8)} ${walletData.ticker}`);
            }
            if (networkFeeMax && feeInSats > networkFeeMax) {
                throw new Error(`Fee must not exceed ${(networkFeeMax / 100000000).toFixed(8)} ${walletData.ticker}`);
            }

            // Filter out UTXOs less than or equal to 0.01
            const filteredWalletData = {
                ...walletData,
                utxos: walletData.utxos.filter(utxo => utxo.value > 0.01)
            };

            // Convert amount to satoshis
            let amountInSats = toSatoshis(amountInputValue);
            
            // If subtract fee is checked, reduce the amount by the fee
            if (subtractFee) {
                amountInSats -= feeInSats;
                if (amountInSats <= 0) {
                    throw new Error('Amount after fee subtraction must be greater than 0');
                }
            }
            
            console.log(`Converting ${amountInputValue} ${walletData.ticker} to ${amountInSats} satoshis${subtractFee ? ' (fee subtracted)' : ''}`);

            // Generate the transaction with filtered UTXOs
            const generateResponse = await fetch('/bitcore_lib/generate-tx', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    walletData: filteredWalletData,
                    receivingAddress,
                    amount: amountInSats,
                    fee: feeInSats
                })
            });

            const generateResult = await generateResponse.json();

            if (!generateResponse.ok) {
                throw new Error(generateResult.error || 'Failed to generate transaction');
            }

            // Broadcast the transaction
            const broadcastResponse = await fetch(`/api/sendrawtransaction/${walletData.ticker}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    raw_tx: generateResult.txHex
                })
            });

            const broadcastResult = await broadcastResponse.json();

            if (!broadcastResponse.ok) {
                throw new Error(broadcastResult.error || 'Failed to broadcast transaction');
            }

            // Show success message with txid
            alert(`Transaction sent successfully!\nTransaction ID: ${broadcastResult.txid}`);
            
            // Return to wallet
            landingPage.innerHTML = '';
            initializeWallet();

        } catch (error) {
            errorDiv.textContent = `Error: ${error.message}`;
            errorDiv.style.display = 'block';
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Send';
        }
    });

    // Add copy button handler
    const copyButton = resultContainer.querySelector('#copyTxHex');
    copyButton.addEventListener('click', () => {
        const txHex = document.getElementById('txHex');
        txHex.select();
        document.execCommand('copy');
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
            copyButton.textContent = 'Copy Hex';
        }, 2000);
    });
} 