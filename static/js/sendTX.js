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
    
    // Add connection status indicator
    const connectionStatus = document.createElement('div');
    connectionStatus.id = 'connectionStatus';
    connectionStatus.className = 'connection-status';
    connectionStatus.style.fontSize = '0.8em';
    connectionStatus.style.marginTop = '5px';
    connectionStatus.style.textAlign = 'center';
    landingPage.appendChild(connectionStatus);

    // Function to update connection status
    function updateConnectionStatus(status, message) {
        const statusDiv = document.getElementById('connectionStatus');
        if (statusDiv) {
            switch (status) {
                case 'connected':
                    statusDiv.textContent = '✓ Connected';
                    statusDiv.style.color = '#44ff44';
                    break;
                case 'connecting':
                    statusDiv.textContent = '⟳ Connecting...';
                    statusDiv.style.color = '#ffaa44';
                    break;
                case 'error':
                    statusDiv.textContent = `✗ ${message}`;
                    statusDiv.style.color = '#ff4444';
                    break;
                case 'rate-limited':
                    statusDiv.textContent = '⚠ Rate Limited';
                    statusDiv.style.color = '#ff8844';
                    break;
                default:
                    statusDiv.textContent = message || 'Unknown status';
                    statusDiv.style.color = '#888';
            }
        }
    }

    // Test connection first
    updateConnectionStatus('connecting', 'Testing connection...');
    
    // Fetch latest balance from API before showing
    async function fetchAndShowBalance(retries = 2) {
        const requestId = ++latestSendBalanceRequest;
        const minSpinnerTime = 600;
        const start = Date.now();
        balance.innerHTML = '<span class="spinner" style="margin-right:10px;"></span>Loading...';
        
        try {
            updateConnectionStatus('connecting', 'Fetching balance...');
            
            // Add timeout and better error handling
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            const res = await fetch(`/api/listunspent/${walletData.ticker}/${walletData.address}`, {
                signal: controller.signal,
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!res.ok) {
                if (res.status === 429) {
                    throw new Error('Rate limit exceeded. Please wait a moment before retrying.');
                } else if (res.status === 503) {
                    throw new Error('Service temporarily unavailable. Please try again later.');
                } else if (res.status >= 500) {
                    throw new Error('Server error. Please try again later.');
                } else {
                    throw new Error(`Failed to fetch UTXOs: ${res.status} ${res.statusText}`);
                }
            }
            
            const data = await res.json();
            if (!data.data || !Array.isArray(data.data.txs)) {
                throw new Error('Invalid UTXO data received from server');
            }
            
            if (requestId !== latestSendBalanceRequest) return;
            
            const utxos = data.data.txs;
            const total = utxos.reduce((sum, utxo) => {
                const value = typeof utxo.value === 'number' ? utxo.value : parseFloat(utxo.value) || 0;
                return sum + value;
            }, 0);
            
            const elapsed = Date.now() - start;
            setTimeout(() => {
                if (requestId !== latestSendBalanceRequest) return;
                balance.textContent = `${total.toFixed(8)} ${walletData.ticker}`;
                updateConnectionStatus('connected', 'Balance updated');
                hideGlobalLoadingSend();
            }, Math.max(0, minSpinnerTime - elapsed));
            
        } catch (e) {
            clearTimeout(timeoutId);
            
            let errorMessage = 'Unable to load balance.';
            let isRetryable = true;
            
            if (e.name === 'AbortError') {
                errorMessage = 'Request timed out. Please try again.';
                updateConnectionStatus('error', 'Request timeout');
            } else if (e.message.includes('Rate limit')) {
                errorMessage = 'Rate limit exceeded. Please wait before retrying.';
                isRetryable = false;
                updateConnectionStatus('rate-limited', 'Rate limit exceeded');
            } else if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                errorMessage = 'Network error. Please check your connection.';
                updateConnectionStatus('error', 'Network error');
            } else if (e.message.includes('Service temporarily unavailable')) {
                errorMessage = 'Service unavailable. Please try again later.';
                updateConnectionStatus('error', 'Service unavailable');
            } else {
                updateConnectionStatus('error', 'Connection failed');
            }
            
            if (retries > 0 && isRetryable) {
                // Exponential backoff with jitter
                const delay = Math.min(1200 * Math.pow(2, 2 - retries) + Math.random() * 1000, 5000);
                console.log(`Retrying balance fetch in ${delay}ms (attempt ${3 - retries}/3)`);
                
                // Show countdown for retry
                updateConnectionStatus('connecting', `Retrying in ${Math.ceil(delay/1000)}s...`);
                
                setTimeout(() => fetchAndShowBalance(retries - 1), delay);
            } else {
                balance.innerHTML = `
                    <span style='color:#ff4444;font-weight:600;'>${errorMessage}</span> 
                    ${isRetryable ? `<button style="background:none;border:none;color:#fff;font-size:1.1em;cursor:pointer;vertical-align:middle;margin-left:8px;padding:4px 12px;border-radius:8px;background:#222;" title="Retry" aria-label="Retry balance fetch">Retry</button>` : ''}
                `;
                
                if (isRetryable) {
                    const retryBtn = balance.querySelector('button');
                    retryBtn.onclick = () => {
                        balance.innerHTML = '<span class="spinner" style="margin-right:10px;"></span>Loading...';
                        fetchAndShowBalance(2);
                    };
                    retryBtn.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') retryBtn.onclick(); };
                    retryBtn.focus();
                }
                
                hideGlobalLoadingSend();
                
                // Log error for debugging
                console.error('Balance fetch failed:', e.message, 'Retries left:', retries, 'Retryable:', isRetryable);
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
                updateSubtractFeeCalculation();
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
    
    // Add real-time calculation display for subtract fee
    const subtractFeeCalculation = document.createElement('div');
    subtractFeeCalculation.id = 'subtractFeeCalculation';
    subtractFeeCalculation.className = 'subtract-fee-calculation';
    subtractFeeCalculation.style.display = 'none';
    
    subtractFeeContainer.appendChild(subtractFeeCalculation);
    form.appendChild(subtractFeeContainer);

    // Function to update subtract fee calculation display
    function updateSubtractFeeCalculation() {
        const calculationDiv = document.getElementById('subtractFeeCalculation');
        const amountValue = parseFloat(amountInput.value) || 0;
        const feeValue = parseFloat(feeDisplay.textContent) || 0;
        const subtractFeeChecked = subtractFeeCheckbox.checked;
        
        if (subtractFeeChecked && amountValue > 0) {
            const finalAmount = amountValue - feeValue;
            if (finalAmount > 0) {
                calculationDiv.innerHTML = `Fee Calculation: Amount: ${amountValue.toFixed(8)} ${walletData.ticker}, Fee: ${feeValue.toFixed(8)} ${walletData.ticker}, Final Amount: ${finalAmount.toFixed(8)} ${walletData.ticker}`;
                calculationDiv.style.display = 'block';
            } else {
                calculationDiv.innerHTML = `Warning: Amount too small! Amount: ${amountValue.toFixed(8)} ${walletData.ticker}, Fee: ${feeValue.toFixed(8)} ${walletData.ticker}, Final Amount: ${finalAmount.toFixed(8)} ${walletData.ticker}`;
                calculationDiv.style.display = 'block';
            }
        } else {
            calculationDiv.style.display = 'none';
        }
    }

    // Add event listeners for real-time calculation updates
    amountInput.addEventListener('input', updateSubtractFeeCalculation);
    subtractFeeCheckbox.addEventListener('change', updateSubtractFeeCalculation);

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
            
            // Update subtract fee calculation when fee changes
            updateSubtractFeeCalculation();
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
            
            // Validate subtract fee logic before proceeding
            if (subtractFee) {
                const feeInCoins = parseFloat(feeDisplay.textContent);
                if (amountInputValue <= feeInCoins) {
                    throw new Error(`Amount (${amountInputValue.toFixed(8)} ${walletData.ticker}) must be greater than fee (${feeInCoins.toFixed(8)} ${walletData.ticker}) when using 'Subtract fee'. Try increasing the amount or reducing the fee.`);
                }
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
                const originalAmountInSats = amountInSats;
                amountInSats -= feeInSats;
                
                // Validate that amount after fee subtraction is still positive
                if (amountInSats <= 0) {
                    throw new Error(`Amount after fee subtraction (${(amountInSats / 100000000).toFixed(8)} ${walletData.ticker}) must be greater than 0. Try reducing the amount or unchecking 'Subtract fee'.`);
                }
                
                // Log the fee subtraction for debugging
                console.log(`Subtract fee enabled: Original amount ${(originalAmountInSats / 100000000).toFixed(8)} ${walletData.ticker}, Fee: ${(feeInSats / 100000000).toFixed(8)} ${walletData.ticker}, Final amount: ${(amountInSats / 100000000).toFixed(8)} ${walletData.ticker}`);
            } else {
                console.log(`Subtract fee disabled: Amount ${(amountInSats / 100000000).toFixed(8)} ${walletData.ticker}, Fee: ${(feeInSats / 100000000).toFixed(8)} ${walletData.ticker}`);
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