import { initializeWallet } from './main.js';
import { coins } from './networks.js'; // Import coins to get the color
import { importAddressIfNeeded } from './main.js';

/**
 * Converts coin amount to satoshis
 * @param {number} amount - Amount in coins
 * @returns {number} Amount in satoshis
 */
function toSatoshis(amount) {
    return Math.floor(amount * 100000000);
}

function showGlobalLoadingSend() {
    let overlay = document.getElementById('global-loading-overlay-send');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'global-loading-overlay-send';
        overlay.style.position = 'fixed';
        overlay.style.top = 0;
        overlay.style.left = 0;
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'rgba(0,0,0,0.85)';
        overlay.style.zIndex = 99999;
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.innerHTML = '<div style="color:#44ff44;font-size:2rem;font-family:Space Grotesk,sans-serif;"><span class="spinner" style="margin-right:16px;"></span>Loading...</div>';
        document.body.appendChild(overlay);
    } else {
        overlay.style.display = 'flex';
    }
}

function hideGlobalLoadingSend() {
    const overlay = document.getElementById('global-loading-overlay-send');
    if (overlay) overlay.style.display = 'none';
}

let latestSendBalanceRequest = 0;

export function sendTXUI(walletData) {
    showGlobalLoadingSend();
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

    // Cache the latest UTXOs fetched for this send flow
    let latestUtxosForSend = [];
    // Track available balance in satoshis and developer fee rate
    let availableSats = 0;
    const DEV_FEE_RATE = 0.002; // 0.2%

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

    // Add balance display with loading state
    const balance = document.createElement('div');
    balance.className = 'balance';
    balance.innerHTML = '<span class="spinner" style="margin-right:10px;"></span>Loading...';
    landingPage.appendChild(balance);

    // Fetch latest balance from API before showing
    async function fetchAndShowBalance(retries = 2) {
        const requestId = ++latestSendBalanceRequest;
        const minSpinnerTime = 600;
        const start = Date.now();
        balance.innerHTML = '<span class="spinner" style="margin-right:10px;"></span>Loading...';
        try {
            // Ensure the address is imported (best-effort, only for B1T)
            await importAddressIfNeeded(walletData.ticker, walletData.address);

            const res = await fetch(`/api/listunspent/${walletData.ticker}/${walletData.address}`);
            if (!res.ok) throw new Error('Failed to fetch UTXOs');
            const data = await res.json();
            if (!data.data || !Array.isArray(data.data.txs)) throw new Error('Invalid UTXO data');
            if (requestId !== latestSendBalanceRequest) return;
            const utxos = data.data.txs;
            // Store for later transaction generation
            latestUtxosForSend = utxos;
            const total = utxos.reduce((sum, utxo) => sum + (typeof utxo.value === 'number' ? utxo.value : parseFloat(utxo.value) || 0), 0);
            // also cache available satoshis for suggestions and validation
            availableSats = Math.max(0, Math.floor(total * 100000000));
            const elapsed = Date.now() - start;
            setTimeout(() => {
                if (requestId !== latestSendBalanceRequest) return;
                balance.textContent = `${total.toFixed(8)} ${walletData.ticker}`;
                hideGlobalLoadingSend();
                updateSuggestionsAndNet();
            }, Math.max(0, minSpinnerTime - elapsed));
        } catch (e) {
            if (retries > 0) {
                setTimeout(() => fetchAndShowBalance(retries - 1), 1200);
            } else {
                balance.innerHTML = `<span style='color:#ff4444;font-weight:600;'>Unable to load balance.</span> <button style=\"background:none;border:none;color:#fff;font-size:1.1em;cursor:pointer;vertical-align:middle;margin-left:8px;padding:4px 12px;border-radius:8px;background:#222;\" title=\"Retry\" aria-label=\"Retry balance fetch\">Retry</button>`;
                const retryBtn = balance.querySelector('button');
                retryBtn.onclick = () => {
                    balance.innerHTML = '<span class="spinner" style="margin-right:10px;"></span>Loading...';
                    fetchAndShowBalance(2);
                };
                retryBtn.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') retryBtn.onclick(); };
                retryBtn.focus();
                hideGlobalLoadingSend();
            }
        }
    }
    fetchAndShowBalance();

    // Create form container
    const formContainer = document.createElement('div');
    formContainer.className = 'tx-form-container';

    // Create form
    const form = document.createElement('form');
    form.className = 'wallet-form';

    // Receiving address input
    const addressInputContainer = document.createElement('div');
    addressInputContainer.style.display = 'flex';
    addressInputContainer.style.alignItems = 'center';
    addressInputContainer.style.gap = '8px';

    const receivingAddressInput = document.createElement('input');
    receivingAddressInput.type = 'text';
    receivingAddressInput.id = 'receivingAddress';
    receivingAddressInput.placeholder = 'Receiving Address';
    receivingAddressInput.className = 'styled-input';
    receivingAddressInput.required = true;
    receivingAddressInput.autocomplete = 'off';
    addressInputContainer.appendChild(receivingAddressInput);

    // Scan QR button
    const scanQRButton = document.createElement('button');
    scanQRButton.type = 'button';
    scanQRButton.className = 'styled-button';
    scanQRButton.textContent = 'Scan QR';
    addressInputContainer.appendChild(scanQRButton);
    form.appendChild(addressInputContainer);

    // --- BASIC QR SCANNER MODAL ---
    let qrModalOpen = false;
    scanQRButton.addEventListener('click', () => {
        if (qrModalOpen) return;
        qrModalOpen = true;
        scanQRButton.disabled = true;
        openBasicQRScannerModal(receivingAddressInput);
    });

    function openBasicQRScannerModal(addressInput) {
        let qrModal = null;
        let html5QrCode = null;
        let closeBtn = null;
        let lastFocusedEl = document.activeElement;
        let closed = false;

        // Modal overlay
        qrModal = document.createElement('div');
        qrModal.style.position = 'fixed';
        qrModal.style.top = 0;
        qrModal.style.left = 0;
        qrModal.style.width = '100vw';
        qrModal.style.height = '100vh';
        qrModal.style.background = 'rgba(0,0,0,0.85)';
        qrModal.style.zIndex = 99999;
        qrModal.style.display = 'flex';
        qrModal.style.alignItems = 'center';
        qrModal.style.justifyContent = 'center';
        qrModal.setAttribute('role', 'dialog');
        qrModal.setAttribute('aria-modal', 'true');
        qrModal.setAttribute('aria-label', 'QR Code Scanner');
        qrModal.tabIndex = -1;

        // Modal box
        const modalBox = document.createElement('div');
        modalBox.style.background = '#181818';
        modalBox.style.borderRadius = '18px';
        modalBox.style.boxShadow = '0 4px 24px rgba(0,0,0,0.25)';
        modalBox.style.padding = '24px 16px 32px 16px';
        modalBox.style.maxWidth = '95vw';
        modalBox.style.width = '350px';
        modalBox.style.position = 'relative';
        modalBox.style.display = 'flex';
        modalBox.style.flexDirection = 'column';
        modalBox.style.alignItems = 'center';

        // Close (X) button
        closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Close';
        closeBtn.setAttribute('aria-label', 'Close QR Scanner');
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '10px';
        closeBtn.style.right = '10px';
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.fontSize = '2rem';
        closeBtn.style.color = '#fff';
        closeBtn.style.cursor = 'pointer';
        closeBtn.onclick = closeModal;
        modalBox.appendChild(closeBtn);

        // Title
        const title = document.createElement('div');
        title.textContent = 'Scan QR Code';
        title.style.fontFamily = 'Space Grotesk, sans-serif';
        title.style.fontWeight = '700';
        title.style.fontSize = '1.5rem';
        title.style.margin = '0 0 10px 0';
        title.style.textAlign = 'center';
        title.style.color = '#fff';
        modalBox.appendChild(title);

        // QR code region
        const qrRegion = document.createElement('div');
        qrRegion.id = 'qr-reader';
        qrRegion.style.width = 'min(80vw, 300px)';
        qrRegion.style.height = 'min(80vw, 300px)';
        qrRegion.style.background = '#000';
        qrRegion.style.position = 'relative';
        qrRegion.style.borderRadius = '12px';
        qrRegion.style.overflow = 'hidden';
        modalBox.appendChild(qrRegion);

        // Cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.setAttribute('aria-label', 'Cancel QR Scanner');
        cancelBtn.style.marginTop = '20px';
        cancelBtn.onclick = closeModal;
        modalBox.appendChild(cancelBtn);

        qrModal.appendChild(modalBox);
        document.body.appendChild(qrModal);
        setTimeout(() => { qrModal.classList.add('show'); }, 10);

        // Start camera after modal is shown
        setTimeout(() => {
            startCamera();
        }, 200);

        function startCamera() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert('No camera available on this device.');
                closeModal();
                return;
            }
            if (html5QrCode) {
                html5QrCode.stop().then(() => html5QrCode.clear());
            }
            html5QrCode = new Html5Qrcode('qr-reader');
            html5QrCode.start(
                { facingMode: 'environment' },
                { fps: 15, qrbox: 250 },
                (decodedText) => {
                    addressInput.value = decodedText;
                    closeModal();
                },
                () => {}
            ).catch((err) => {
                alert('Unable to access camera for QR scanning.');
                closeModal();
            });
        }

        function closeModal() {
            if (closed) return;
            closed = true;
            qrModalOpen = false;
            scanQRButton.disabled = false;
            if (html5QrCode) {
                html5QrCode.stop().then(() => {
                    html5QrCode.clear();
                    html5QrCode = null;
                    removeModal();
                }).catch(() => {
                    removeModal();
                });
            } else {
                removeModal();
            }
            if (lastFocusedEl) lastFocusedEl.focus();
        }

        function removeModal() {
            if (qrModal) {
                closeBtn.onclick = null;
                cancelBtn.onclick = null;
                qrModal.remove();
                qrModal = null;
            }
        }
    }

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

    // ===== Suggestions row and net info =====
    const suggestionsRow = document.createElement('div');
    suggestionsRow.style.display = 'flex';
    suggestionsRow.style.gap = '8px';
    suggestionsRow.style.marginTop = '6px';
    suggestionsRow.style.flexWrap = 'wrap';

    const suggestionsLabel = document.createElement('span');
    suggestionsLabel.textContent = 'Suggestions:';
    suggestionsLabel.style.opacity = '0.85';
    suggestionsRow.appendChild(suggestionsLabel);

    function makeSuggBtn() {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'styled-button';
        b.style.padding = '4px 10px';
        b.style.fontSize = '0.85rem';
        b.style.background = '#222';
        b.style.borderRadius = '10px';
        return b;
    }

    const btnMax = makeSuggBtn();
    const btnHalf = makeSuggBtn();
    const btnQuarter = makeSuggBtn();

    suggestionsRow.appendChild(btnMax);
    suggestionsRow.appendChild(btnHalf);
    suggestionsRow.appendChild(btnQuarter);
    form.appendChild(suggestionsRow);

    const netInfo = document.createElement('div');
    netInfo.style.marginTop = '6px';
    netInfo.style.fontSize = '0.9rem';
    netInfo.style.lineHeight = '1.3';
    netInfo.style.opacity = '0.9';
    form.appendChild(netInfo);

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
                updateSuggestionsAndNet();
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
                updateSuggestionsAndNet();
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

    // Prepare a slider reference in outer scope so handlers can access it
    let feeSlider = null;

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
                    // Update slider value within its min/max bounds when available
                    if (feeSlider) {
                        feeSlider.value = Math.min(Math.max(feeInSats, parseInt(feeSlider.min)), parseInt(feeSlider.max));
                    }
                    // Display can show any value
                    feeDisplay.textContent = newFee.toFixed(8);
                }
                feeInput.remove();
                feeDisplay.style.display = 'inline';
                updateSuggestionsAndNet();
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
        feeSlider = document.createElement('input');
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
            updateSuggestionsAndNet();
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
            fetchAndShowBalance();
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

    // Helper formatting and computations
    function toCoins(sats) { return (sats / 100000000).toFixed(8); }
    function currentFeeSats() {
        const v = parseFloat(feeDisplay.textContent);
        return isNaN(v) ? 0 : Math.floor(v * 100000000);
    }
    function maxRecipientSatsGivenFee(feeSats) {
        // Max recipient such that amount + fee + dev(amount) <= available
        // => (1 + r) * amount <= available - fee
        const numer = availableSats - (feeSats || 0);
        if (numer <= 0) return 0;
        return Math.max(0, Math.floor(numer / (1 + DEV_FEE_RATE)));
    }

    function updateSuggestionsAndNet() {
        const feeSats = currentFeeSats();
        const enteredCoins = parseFloat(amountInput.value);
        const enteredSats = isNaN(enteredCoins) ? 0 : Math.floor(enteredCoins * 100000000);
        let recipientSats = 0;
        if (subtractFeeCheckbox.checked) {
            recipientSats = Math.floor((enteredSats - feeSats) / (1 + DEV_FEE_RATE));
        } else {
            recipientSats = enteredSats;
        }
        if (recipientSats < 0) recipientSats = 0;
        const serverFeeEst = Math.floor(recipientSats * DEV_FEE_RATE);
        const totalSpend = recipientSats + feeSats + serverFeeEst;

        // Suggestions text and handlers
        const maxRec = maxRecipientSatsGivenFee(feeSats);
        const halfRec = Math.floor(maxRec * 0.5);
        const quarterRec = Math.floor(maxRec * 0.25);

        if (subtractFeeCheckbox.checked) {
            // In subtract mode, suggestions set the INPUT (gross) so that net to recipient equals the target
            const s1 = Math.floor(availableSats); // use-all gross
            const s2 = Math.floor(availableSats * 0.5);
            const s3 = Math.floor(availableSats * 0.25);
            btnMax.textContent = `Max (${toCoins(Math.floor((s1 - feeSats) / (1 + DEV_FEE_RATE)))})`;
            btnHalf.textContent = `50% (${toCoins(Math.floor((s2 - feeSats) / (1 + DEV_FEE_RATE)))})`;
            btnQuarter.textContent = `25% (${toCoins(Math.floor((s3 - feeSats) / (1 + DEV_FEE_RATE)))})`;
            btnMax.onclick = () => { amountInput.value = toCoins(s1); updateSuggestionsAndNet(); };
            btnHalf.onclick = () => { amountInput.value = toCoins(s2); updateSuggestionsAndNet(); };
            btnQuarter.onclick = () => { amountInput.value = toCoins(s3); updateSuggestionsAndNet(); };
        } else {
            // In normal mode, suggestions directly set recipient amount
            btnMax.textContent = `Max (${toCoins(maxRec)})`;
            btnHalf.textContent = `50% (${toCoins(halfRec)})`;
            btnQuarter.textContent = `25% (${toCoins(quarterRec)})`;
            btnMax.onclick = () => { amountInput.value = toCoins(maxRec); updateSuggestionsAndNet(); };
            btnHalf.onclick = () => { amountInput.value = toCoins(halfRec); updateSuggestionsAndNet(); };
            btnQuarter.onclick = () => { amountInput.value = toCoins(quarterRec); updateSuggestionsAndNet(); };
        }

        // Net info preview (English + Server fee)
        netInfo.innerHTML = `Net to recipient: <b>${toCoins(recipientSats)} ${walletData.ticker}</b><br>` +
            `Server fee (0.2%): ${toCoins(serverFeeEst)} ${walletData.ticker}<br>` +
            `Total spend: ${toCoins(totalSpend)} ${walletData.ticker} · Available: ${toCoins(availableSats)} ${walletData.ticker}`;
    }

    // Recompute when checkbox toggles
    subtractFeeCheckbox.addEventListener('change', updateSuggestionsAndNet);

    // Append the entire fee container to the form (already done above)

    // Create submit button handler
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

            // Filter out UTXOs less than or equal to 0.01 FROM THE LATEST FETCHED SET
            // Ensure we have a fresh UTXO set before proceeding
            if (!latestUtxosForSend || latestUtxosForSend.length === 0) {
            try {
                const res = await fetch(`/api/listunspent/${walletData.ticker}/${walletData.address}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.data && Array.isArray(data.data.txs)) {
                        latestUtxosForSend = data.data.txs;
                        const total = latestUtxosForSend.reduce((sum, u) => sum + (typeof u.value === 'number' ? u.value : parseFloat(u.value) || 0), 0);
                        availableSats = Math.max(0, Math.floor(total * 100000000));
                    }
                }
            } catch (_) { /* ignore and use whatever we have */ }
            }
            const filteredWalletData = {
                ...walletData,
                // Use all fetched UTXOs; let the backend select appropriately
                utxos: (latestUtxosForSend || [])
            };

            // Compute effective available sats from the UTXOs that we will actually use (all fetched)
            const effectiveAvailableSats = Math.max(0, Math.floor(((filteredWalletData.utxos || []).reduce((sum, u) => sum + (typeof u.value === 'number' ? u.value : parseFloat(u.value) || 0), 0)) * 100000000));

            // Convert amount to satoshis
            const enteredSats = toSatoshis(amountInputValue);
            let amountInSats = enteredSats;
            
            // If subtract fee is checked, reduce the amount by the fee AND server fee (0.2%)
            if (subtractFee) {
                // Clamp gross entered to available first
                if (enteredSats > effectiveAvailableSats) {
                    amountInput.value = toCoins(effectiveAvailableSats);
                    updateSuggestionsAndNet();
                    errorDiv.textContent = `Insufficient funds. I've set the total spend to your available balance. Please review and press Send again.`;
                    errorDiv.style.display = 'block';
                    submitButton.disabled = false;
                    submitButton.textContent = 'Send';
                    return;
                }
                amountInSats = Math.floor((enteredSats - feeInSats) / (1 + DEV_FEE_RATE));
                if (amountInSats <= 0) {
                    errorDiv.textContent = 'Amount after subtracting network fee and server fee must be greater than 0.';
                    errorDiv.style.display = 'block';
                    submitButton.disabled = false;
                    submitButton.textContent = 'Send';
                    return;
                }
            }
            
            // Local sufficiency check using effectiveAvailableSats only
            const serverFeeEst = Math.floor(amountInSats * DEV_FEE_RATE);
            const required = amountInSats + feeInSats + serverFeeEst;
            if (required > effectiveAvailableSats) {
                const maxRec = Math.max(0, Math.floor((Math.max(0, effectiveAvailableSats - feeInSats)) / (1 + DEV_FEE_RATE)));
                // Auto-adjust UI to the maximum spendable and require user confirmation
                if (subtractFee) {
                    // In subtract mode, the input represents gross spend; set it to available
                    amountInput.value = toCoins(effectiveAvailableSats);
                } else {
                    // In normal mode, set amount to max recipient
                    amountInput.value = toCoins(maxRec);
                }
                updateSuggestionsAndNet();
                errorDiv.textContent = `Insufficient funds. I've set the ${subtractFee ? 'total spend' : 'amount'} to the maximum spendable given the current network fee and server fee. Please review and press Send again.`;
                errorDiv.style.display = 'block';
                submitButton.disabled = false;
                submitButton.textContent = 'Send';
                return;
            }
            
            console.log(`Converting ${amountInputValue} ${walletData.ticker} to ${amountInSats} satoshis${subtractFee ? ' (fee & server fee subtracted)' : ''}`);

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
                // Surface detailed error information when available
                const details = generateResult.details ? `: ${generateResult.details}` : '';
                throw new Error((generateResult.error || 'Failed to generate transaction') + details);
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

    // Recompute suggestions when fee or amount context changes initially
    setTimeout(updateSuggestionsAndNet, 0);

    // Add this helper function at the end of the file
    function playScanChime() {
        // Use a simple oscillator for a chime sound
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'triangle';
            o.frequency.value = 880;
            g.gain.value = 0.15;
            o.connect(g).connect(ctx.destination);
            o.start();
            o.frequency.linearRampToValueAtTime(1760, ctx.currentTime + 0.18);
            g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
            o.stop(ctx.currentTime + 0.25);
            o.onended = () => ctx.close();
        } catch (e) { /* ignore errors */ }
    }
}