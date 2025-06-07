import { initializeWallet } from './main.js'; // Ensure this function is exported from main.js
import { addWalletUI } from './addWallet.js'; // Import the addWalletUI function
import { walletSettingsUI } from './walletSettings.js'; // Import the walletSettingsUI function

export function boilerPlateUI(selectedCoin) {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = ''; // Clear existing content
    landingPage.style.backgroundColor = selectedCoin.color; // Set background color

    // Header with back button
    const header = document.createElement('div');
    header.className = 'header';

    const backButton = document.createElement('button');
    backButton.className = 'back-button';
    backButton.innerHTML = '<img src="./static/images/back.png" alt="Back Icon" />';
    backButton.addEventListener('click', () => {
        landingPage.innerHTML = ''; // Clear the UI
        initializeWallet(); // Reinitialize the main wallet UI
    });

    header.appendChild(backButton);
    landingPage.appendChild(header);

    // Title
    const title = document.createElement('h1');
    title.textContent = 'Boilerplate Page';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // Main content container
    const mainContent = document.createElement('div');
    mainContent.className = 'main-content';

    // Wallet selector
    const walletDropdown = document.createElement('select');
    walletDropdown.className = 'wallet-selector styled-text';

    // Get wallets data and populate dropdown
    const walletsData = JSON.parse(localStorage.getItem('wallets')) || [];
    const walletsForCoin = walletsData.filter(wallet => wallet.ticker === selectedCoin.ticker);

    walletsForCoin.forEach(wallet => {
        const option = document.createElement('option');
        option.value = wallet.label;
        option.textContent = wallet.label;
        option.className = 'styled-text';
        walletDropdown.appendChild(option);
    });
    mainContent.appendChild(walletDropdown);

    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'stacked-buttons';

    // Create and add buttons
    const buttons = [
        {
            text: 'Rename Wallet',
            onClick: () => console.log('Rename Wallet clicked')
        },
        {
            text: 'View Private Key',
            onClick: () => console.log('View Private Key clicked')
        },
        {
            text: 'Delete Wallet',
            className: 'delete-button',
            onClick: () => console.log('Delete Wallet clicked')
        },
        {
            text: 'Add Wallet',
            onClick: () => {
                landingPage.innerHTML = '';
                addWalletUI(selectedCoin);
            }
        },
        {
            text: 'Settings',
            onClick: () => console.log('Settings clicked')
        }
    ];

    buttons.forEach(button => {
        const btn = document.createElement('button');
        btn.className = `styled-button ${button.className || ''}`;
        btn.textContent = button.text;
        btn.addEventListener('click', button.onClick);
        buttonContainer.appendChild(btn);
    });

    mainContent.appendChild(buttonContainer);
    landingPage.appendChild(mainContent);

    // Coin icon
    const coinIcon = document.createElement('img');
    coinIcon.src = `/static/images/${selectedCoin.name}icon.png`; // Ensure the correct property is used
    coinIcon.alt = `${selectedCoin.name} Icon`;
    coinIcon.className = 'coin-icon';
    landingPage.appendChild(coinIcon);
} 