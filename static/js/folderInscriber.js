import { mintUI } from './mint.js';
import { inscribeUI } from './inscriber.js';

export function folderInscribeUI(selectedWallet) {
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

    // Title
    const title = document.createElement('h1');
    title.textContent = 'Inscribe Folder';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // Timer Display
    const timerDisplay = document.createElement('div');
    timerDisplay.className = 'styled-text input-margin';
    landingPage.appendChild(timerDisplay);

    // Status Display
    const statusDisplay = document.createElement('textarea');
    statusDisplay.className = 'styled-input input-margin';
    statusDisplay.readOnly = true;
    statusDisplay.style.height = '200px';
    statusDisplay.style.resize = 'none';
    landingPage.appendChild(statusDisplay);

    // Start/Continue Button
    const startButton = document.createElement('button');
    startButton.textContent = 'Start/Continue';
    startButton.className = 'styled-button input-margin';
    startButton.addEventListener('click', () => {
        startButton.disabled = true;
        processEntries().finally(() => {
            startButton.disabled = false;
        });
    });
    landingPage.appendChild(startButton);

    let continueProcessing = true;

    function updateStatus(entry) {
        statusDisplay.value = JSON.stringify(entry, null, 2);
    }

    // Rest of the processing logic remains similar but uses updateStatus instead of iframe
    // ... (I'll continue with the processing functions in the next part)
} 