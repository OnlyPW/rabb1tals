import { initializeWallet } from './main.js'; // Ensure this function is exported from main.js
import { coins } from './networks.js';

export function receiveUI(selectedWallet) {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = ''; // Clear existing content

    // Find the coin data for the selected wallet to get the color
    const selectedCoin = coins.find(coin => coin.ticker === selectedWallet.ticker);
    if (selectedCoin) {
        landingPage.style.backgroundColor = selectedCoin.color; // Keep dynamic color
    }

    // Create header with back button
    const header = document.createElement('div');
    header.className = 'header';

    // Create a back button
    const backButton = document.createElement('button');
    backButton.className = 'back-button';
    backButton.innerHTML = '<img src="./static/images/back.png" alt="Back Icon" />';
    backButton.addEventListener('click', () => {
        landingPage.innerHTML = ''; // Clear the receive UI
        initializeWallet(); // Navigate back to the main wallet UI
    });

    header.appendChild(backButton);
    landingPage.appendChild(header);

    // Create main content container
    const mainContent = document.createElement('div');
    mainContent.className = 'main-content';

    // Create a container for the QR code and address
    const container = document.createElement('div');
    container.className = 'receive-container';

    // Create a canvas element for the QR code
    const qrCanvas = document.createElement('canvas');
    qrCanvas.className = 'qr-code';
    container.appendChild(qrCanvas);

    // Generate the QR code
    QRCode.toCanvas(qrCanvas, selectedWallet.address, {
        width: 325,
        height: 325,
        margin: 1,
        color: {
            dark: '#000000',  // QR code color
            light: '#FFFFFF'  // Background color
        },
        // Add a blank area in the center
        maskPattern: 4 // This is one of the patterns that can create a blank center
    }, (error) => {
        if (error) console.error('Error generating QR code:', error);
    });

    // Create a text input for the address
    const addressInput = document.createElement('input');
    addressInput.type = 'text';
    addressInput.value = selectedWallet.address;
    addressInput.readOnly = true; // Make the input read-only
    addressInput.className = 'address-input styled-text';
    container.appendChild(addressInput);

    // Create a button to copy the address to the clipboard
    const copyButton = document.createElement('button');
    copyButton.className = 'styled-button';
    copyButton.textContent = 'Copy to Clipboard';
    copyButton.addEventListener('click', () => {
        addressInput.select();
        document.execCommand('copy');
        alert('Address copied to clipboard!');
    });
    container.appendChild(copyButton);

    mainContent.appendChild(container);
    landingPage.appendChild(mainContent);

    // Add the selected coin's icon in the center of the QR code
    const coinIcon = document.createElement('img');
    coinIcon.src = `/static/images/${selectedWallet.ticker}icon.png`; // Ensure the correct property is used
    coinIcon.alt = `${selectedWallet.ticker} Icon`;
    coinIcon.className = 'qr-coin-icon';
    container.appendChild(coinIcon);
} 