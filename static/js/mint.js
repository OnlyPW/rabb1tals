import { initializeWallet } from './main.js';
import { coins } from './networks.js';
import { mintFileUI } from './mintFile.js';
import { inscribeUI } from './inscriber.js';
import { mintTokenUI } from './mintToken.js';
import { mintImageUI } from './mintImage.js';
import { mintTextUI } from './mintText.js';
import { mintFolderUI } from './mintFolder.js';
import { mintPadUI } from './mintpad.js';

function showGlobalLoadingMint() {
  let overlay = document.getElementById('global-loading-overlay-mint');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'global-loading-overlay-mint';
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
function hideGlobalLoadingMint() {
  const overlay = document.getElementById('global-loading-overlay-mint');
  if (overlay) overlay.style.display = 'none';
}

export function mintUI(selectedWallet) {
    showGlobalLoadingMint();
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = '';

    // Find the coin data for the selected wallet to get the color
    const selectedCoin = coins.find(coin => coin.ticker === selectedWallet.ticker);
    if (selectedCoin) {
        landingPage.style.backgroundColor = selectedCoin.color; // Keep dynamic color
    }

    // Create header with back button
    const header = document.createElement('div');
    header.className = 'header';

    const backButton = document.createElement('button');
    backButton.className = 'back-button';
    backButton.innerHTML = '<img src="./static/images/back.png" alt="Back Icon" />';
    backButton.addEventListener('click', () => {
        landingPage.innerHTML = '';
        initializeWallet();
    });

    header.appendChild(backButton);
    landingPage.appendChild(header);

    // Create title
    const title = document.createElement('h1');
    title.textContent = 'Mint';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // Add warning text below title
    const warningText = document.createElement('p');
    warningText.textContent = 'Choose a mint selection';
    warningText.className = 'warning-text';
    landingPage.appendChild(warningText);

    // Create container for mint buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'stacked-buttons';

    // Create mint buttons
    const mintButtons = [
        { text: 'Mint Pad', handler: () => mintPadUI(selectedWallet) },
        { text: 'Token', handler: () => mintTokenUI(selectedWallet) },
        { text: 'Image', handler: () => mintImageUI(selectedWallet) },
        { text: 'File', handler: () => mintFileUI(selectedWallet) },
        { text: 'Text', handler: () => mintTextUI(selectedWallet) },
        { text: 'Inscriber', handler: () => inscribeUI(selectedWallet) }
    ];

    mintButtons.forEach(btn => {
        const button = document.createElement('button');
        button.className = 'styled-button input-margin';
        button.textContent = btn.text;
        button.addEventListener('click', () => {
            landingPage.innerHTML = '';
            btn.handler();
        });
        buttonContainer.appendChild(button);
    });

    landingPage.appendChild(buttonContainer);
    hideGlobalLoadingMint();
} 