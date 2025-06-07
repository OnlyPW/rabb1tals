import { initializeWallet } from './main.js';
import { coins } from './networks.js';
import { myInscriptionsUI } from './myInscriptions.js';

export function userSettingsUI(selectedWallet) {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = ''; // Clear existing content

    // Set default background color if no wallet is selected
    if (selectedWallet && selectedWallet.ticker) {
        const selectedCoin = coins.find(coin => coin.ticker === selectedWallet.ticker);
        if (selectedCoin) {
            landingPage.style.backgroundColor = selectedCoin.color;
        }
    } else {
        // Default background color when no wallet is selected
        landingPage.style.backgroundColor = '#000000'; // Or any default color you prefer
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
    title.textContent = 'User Settings';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // Create buttons array
    const settingsButtons = [
        {
            text: 'My Inscriptions Made',
            onClick: () => {
                landingPage.innerHTML = ''; // Clear the UI
                myInscriptionsUI(selectedWallet); // Navigate to My Inscriptions UI
            }
        },
        {
            text: 'Clear Pending Transactions',
            onClick: () => {
                const confirmClear = confirm('Are you sure you want to clear the pending transactions?');
                if (confirmClear) {
                    localStorage.removeItem('mintCache');
                    // Clear pending transactions by setting them to an empty array
                    localStorage.setItem('mintResponse', JSON.stringify({ pendingTransactions: [] }));
                    console.log('Pending transactions cleared');
                    alert('Pending transactions have been cleared');
                }
            }
        }
    ];

    // Create buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'stacked-buttons';
    landingPage.appendChild(buttonContainer);

    // Create and append buttons
    settingsButtons.forEach(btn => {
        const button = document.createElement('button');
        button.className = 'styled-button';
        button.textContent = btn.text;
        button.addEventListener('click', btn.onClick);
        buttonContainer.appendChild(button);
    });

    // Add the coin icon only if a wallet is selected
    if (selectedWallet && selectedWallet.ticker) {
        const coinIcon = document.createElement('img');
        coinIcon.src = `/static/images/${selectedWallet.ticker}icon.png`;
        coinIcon.alt = `${selectedWallet.ticker} Icon`;
        coinIcon.className = 'coin-icon';
        landingPage.appendChild(coinIcon);
    }
} 