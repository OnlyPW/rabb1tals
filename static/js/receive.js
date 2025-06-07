import { initializeWallet } from './main.js'; // Ensure this function is exported from main.js
import { coins } from './networks.js';

export function receiveUI(selectedWallet) {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = '';

    // Find the coin data for the selected wallet to get the color
    const selectedCoin = coins.find(coin => coin.ticker === selectedWallet.ticker);
    if (selectedCoin) {
        landingPage.style.backgroundColor = selectedCoin.color;
    }

    // Create header with back button
    const header = document.createElement('div');
    header.className = 'header';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'flex-start';
    header.style.padding = '16px 0 0 16px';

    // Create a back button
    const backButton = document.createElement('button');
    backButton.className = 'back-button';
    backButton.innerHTML = '<img src="/static/images/back.png" alt="Back Icon" style="width:32px;height:32px;" />';
    backButton.style.background = 'none';
    backButton.style.border = 'none';
    backButton.style.cursor = 'pointer';
    backButton.addEventListener('click', () => {
        landingPage.innerHTML = '';
        initializeWallet();
    });
    header.appendChild(backButton);
    landingPage.appendChild(header);

    // Create main content container
    const mainContent = document.createElement('div');
    mainContent.className = 'main-content';
    mainContent.style.display = 'flex';
    mainContent.style.flexDirection = 'column';
    mainContent.style.alignItems = 'center';
    mainContent.style.justifyContent = 'center';
    mainContent.style.minHeight = '80vh';
    mainContent.style.width = '100%';
    mainContent.style.boxSizing = 'border-box';
    mainContent.style.padding = '0 16px';

    // Heading
    const heading = document.createElement('h2');
    heading.textContent = 'Receive';
    heading.style.fontFamily = 'Space Grotesk, sans-serif';
    heading.style.fontWeight = '700';
    heading.style.fontSize = '2rem';
    heading.style.margin = '0 0 24px 0';
    heading.style.textAlign = 'center';
    mainContent.appendChild(heading);

    // Create a container for the QR code and address
    const container = document.createElement('div');
    container.className = 'receive-container';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.background = '#fff';
    container.style.borderRadius = '18px';
    container.style.boxShadow = '0 4px 24px rgba(0,0,0,0.10)';
    container.style.padding = '24px 16px 32px 16px';
    container.style.maxWidth = '350px';
    container.style.width = '100%';
    container.style.margin = '0 auto';

    // Create a canvas element for the QR code
    const qrCanvas = document.createElement('canvas');
    qrCanvas.className = 'qr-code';
    qrCanvas.style.width = 'min(80vw, 300px)';
    qrCanvas.style.height = 'min(80vw, 300px)';
    qrCanvas.style.margin = '0 auto 16px auto';
    container.appendChild(qrCanvas);

    // Generate the QR code
    QRCode.toCanvas(qrCanvas, selectedWallet.address, {
        width: 300,
        height: 300,
        margin: 1,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        },
        maskPattern: 4
    }, (error) => {
        if (error) console.error('Error generating QR code:', error);
    });

    // Add the selected coin's icon in the center of the QR code
    const coinIcon = document.createElement('img');
    coinIcon.src = `/static/images/${selectedWallet.ticker}icon.png`;
    coinIcon.alt = `${selectedWallet.ticker} Icon`;
    coinIcon.className = 'qr-coin-icon';
    coinIcon.style.width = '64px';
    coinIcon.style.height = '64px';
    coinIcon.style.position = 'absolute';
    coinIcon.style.left = '50%';
    coinIcon.style.top = '50%';
    coinIcon.style.transform = 'translate(-50%, -50%)';
    coinIcon.style.pointerEvents = 'none';
    coinIcon.style.background = '#fff';
    coinIcon.style.borderRadius = '50%';
    coinIcon.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
    coinIcon.style.border = '2px solid #eee';
    // Place icon over QR code
    const qrWrapper = document.createElement('div');
    qrWrapper.style.position = 'relative';
    qrWrapper.style.display = 'inline-block';
    qrWrapper.appendChild(qrCanvas);
    qrWrapper.appendChild(coinIcon);
    container.appendChild(qrWrapper);

    // Create a text input for the address
    const addressInput = document.createElement('input');
    addressInput.type = 'text';
    addressInput.value = selectedWallet.address;
    addressInput.readOnly = true;
    addressInput.className = 'address-input styled-text';
    addressInput.style.margin = '24px 0 8px 0';
    addressInput.style.fontSize = '1.1rem';
    addressInput.style.textAlign = 'center';
    addressInput.style.width = '100%';
    addressInput.style.border = '1px solid #ccc';
    addressInput.style.borderRadius = '8px';
    addressInput.style.padding = '10px';
    addressInput.style.background = '#f9f9f9';
    addressInput.style.overflowWrap = 'break-word';
    addressInput.style.color = '#111';
    container.appendChild(addressInput);

    // Create a button to copy the address to the clipboard
    const copyButton = document.createElement('button');
    copyButton.className = 'styled-button';
    copyButton.textContent = 'Copy to Clipboard';
    copyButton.style.margin = '8px 0 0 0';
    copyButton.style.width = '100%';
    copyButton.style.padding = '12px';
    copyButton.style.fontSize = '1rem';
    copyButton.style.background = '#222';
    copyButton.style.color = '#fff';
    copyButton.style.border = 'none';
    copyButton.style.borderRadius = '8px';
    copyButton.style.cursor = 'pointer';
    copyButton.style.transition = 'background 0.2s';
    copyButton.addEventListener('mouseenter', () => {
        copyButton.style.background = '#444';
    });
    copyButton.addEventListener('mouseleave', () => {
        copyButton.style.background = '#222';
    });
    copyButton.addEventListener('click', () => {
        addressInput.select();
        document.execCommand('copy');
        copyButton.textContent = 'Copied!';
        setTimeout(() => { copyButton.textContent = 'Copy to Clipboard'; }, 1200);
    });
    container.appendChild(copyButton);

    mainContent.appendChild(container);
    landingPage.appendChild(mainContent);
} 