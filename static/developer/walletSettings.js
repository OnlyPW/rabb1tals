import { initializeWallet } from './main.js'; // Ensure this function is exported from main.js
import { coins } from './networks.js';
import { addWalletUI } from './addWallet.js'; // Import the addWalletUI function
import { settingsUI } from './settings.js'; // Import the settingsUI function

export function walletSettingsUI(selectedCoin, currentWallet) {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = ''; // Clear existing content
    landingPage.style.backgroundColor = selectedCoin.color; // Set background color

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

    const title = document.createElement('h1');
    title.textContent = 'Wallet Settings';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // Retrieve wallets from local storage
    const walletsData = JSON.parse(localStorage.getItem('wallets')) || [];
    // Filter wallets for the selected coin and exclude those without a label
    const walletsForCoin = walletsData.filter(wallet => wallet.ticker === selectedCoin.ticker && wallet.label);

    if (walletsForCoin.length === 0) {
        const noWalletMessage = document.createElement('div');
        noWalletMessage.textContent = 'No wallets found';
        noWalletMessage.className = 'styled-text';
        noWalletMessage.style.textAlign = 'center';
        noWalletMessage.style.margin = '20px 0';
        landingPage.appendChild(noWalletMessage);
    } else {
        const walletDropdown = document.createElement('select');
        walletDropdown.className = 'wallet-selector styled-text';

        // Populate dropdown with wallets for the selected coin
        walletsForCoin.forEach(wallet => {
            const option = document.createElement('option');
            option.value = wallet.label;
            option.textContent = wallet.label;
            option.className = 'styled-text';
            walletDropdown.appendChild(option);
        });

        // Set the selected wallet if provided
        if (currentWallet) {
            walletDropdown.value = currentWallet.label;
        }

        landingPage.appendChild(walletDropdown);
    }

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'stacked-buttons';

    // Only show these buttons if there are wallets
    if (walletsForCoin.length > 0) {
        const renameButton = document.createElement('button');
        renameButton.className = 'styled-button';
        renameButton.textContent = 'Rename Wallet';
        renameButton.addEventListener('click', () => {
            const walletDropdown = document.querySelector('.wallet-selector');
            const currentLabel = walletDropdown.value;
            const newLabel = prompt('Enter new wallet label:', currentLabel);
            if (newLabel && newLabel !== currentLabel) {
                // Update the wallet label in local storage
                const walletIndex = walletsData.findIndex(wallet => wallet.label === currentLabel && wallet.ticker === selectedCoin.ticker);
                if (walletIndex !== -1) {
                    walletsData[walletIndex].label = newLabel;
                    localStorage.setItem('wallets', JSON.stringify(walletsData));
                    console.log('Wallet label updated:', newLabel);
                    // Update the dropdown option text
                    walletDropdown.options[walletDropdown.selectedIndex].textContent = newLabel;
                }
            }
        });
        buttonContainer.appendChild(renameButton);

        const viewPrivateKeyButton = document.createElement('button');
        viewPrivateKeyButton.className = 'styled-button';
        viewPrivateKeyButton.textContent = 'View Private Key';
        viewPrivateKeyButton.addEventListener('click', () => {
            const walletDropdown = document.querySelector('.wallet-selector');
            const currentLabel = walletDropdown.value;
            const wallet = walletsData.find(wallet => wallet.label === currentLabel && wallet.ticker === selectedCoin.ticker);
            if (wallet) {
                const dialog = document.createElement('div');
                dialog.className = 'dialog';

                const privKeyInput = document.createElement('input');
                privKeyInput.type = 'text';
                privKeyInput.value = wallet.privkey;
                privKeyInput.readOnly = true;
                privKeyInput.className = 'styled-input styled-text';

                const copyButton = document.createElement('button');
                copyButton.className = 'styled-button';
                copyButton.textContent = 'Copy to Clipboard';
                copyButton.addEventListener('click', () => {
                    privKeyInput.select();
                    document.execCommand('copy');
                    alert('Private key copied to clipboard!');
                });

                const closeButton = document.createElement('button');
                closeButton.className = 'styled-button';
                closeButton.textContent = 'Close';
                closeButton.addEventListener('click', () => {
                    landingPage.removeChild(dialog);
                });

                dialog.appendChild(privKeyInput);
                dialog.appendChild(copyButton);
                dialog.appendChild(closeButton);
                landingPage.appendChild(dialog);
            }
        });
        buttonContainer.appendChild(viewPrivateKeyButton);

        const deleteButton = document.createElement('button');
        deleteButton.className = 'styled-button delete-button';
        deleteButton.textContent = 'Delete Wallet';
        deleteButton.addEventListener('click', () => {
            const walletDropdown = document.querySelector('.wallet-selector');
            const currentLabel = walletDropdown.value;
            const confirmDelete = confirm('Are you sure? This action cannot be undone.');
            if (confirmDelete) {
                // Find the index of the wallet to delete
                const walletIndex = walletsData.findIndex(wallet => wallet.label === currentLabel && wallet.ticker === selectedCoin.ticker);
                if (walletIndex !== -1) {
                    // Remove the wallet from the array
                    walletsData.splice(walletIndex, 1);
                    // Update local storage
                    localStorage.setItem('wallets', JSON.stringify(walletsData));
                    console.log('Wallet deleted:', currentLabel);
                    // Refresh the page to show updated wallet list
                    walletSettingsUI(selectedCoin);
                }
            }
        });
        buttonContainer.appendChild(deleteButton);
    }

    const addWalletButton = document.createElement('button');
    addWalletButton.className = 'styled-button';
    addWalletButton.textContent = 'Add Wallet';
    addWalletButton.addEventListener('click', () => {
        landingPage.innerHTML = ''; // Clear the wallet settings UI
        addWalletUI(selectedCoin); // Pass the entire selectedCoin object
    });
    buttonContainer.appendChild(addWalletButton);

    const settingsButton = document.createElement('button');
    settingsButton.className = 'styled-button';
    settingsButton.textContent = 'Settings';
    settingsButton.addEventListener('click', () => {
        landingPage.innerHTML = ''; // Clear the wallet settings UI
        settingsUI(selectedCoin); // Navigate to the Settings page
    });
    buttonContainer.appendChild(settingsButton);

    landingPage.appendChild(buttonContainer);

}
