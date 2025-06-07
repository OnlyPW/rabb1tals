import { initializeWallet } from './main.js'; // Ensure this function is exported from main.js
import { walletSettingsUI } from './walletSettings.js'; // Import the walletSettingsUI function

export function walletUI() {
    // Simplified wallet UI handler
    console.log("walletUI function called");
    // Add logic to display the wallet UI
}

export function addWalletUI(selectedCoin) {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = '';
    landingPage.style.backgroundColor = selectedCoin.color; // Keep dynamic color

    const header = document.createElement('div');
    header.className = 'header';

    const backButton = document.createElement('button');
    backButton.className = 'back-button';
    backButton.innerHTML = '<img src="./static/images/back.png" alt="Back Icon" />';
    backButton.addEventListener('click', () => {
        landingPage.innerHTML = '';
        walletSettingsUI(selectedCoin);
    });

    header.appendChild(backButton);
    landingPage.appendChild(header);

    const title = document.createElement('h1');
    title.textContent = 'Add Wallet';
    title.className = 'page-title';
    landingPage.appendChild(title);

    const warningText = document.createElement('p');
    warningText.textContent = 'Only import wallets created with Plugz';
    warningText.className = 'warning-text';
    landingPage.appendChild(warningText);

    const form = document.createElement('form');
    form.className = 'wallet-form';

    const walletLabelInput = document.createElement('input');
    walletLabelInput.type = 'text';
    walletLabelInput.placeholder = 'Wallet Label';
    walletLabelInput.className = 'styled-input styled-text';
    walletLabelInput.autocomplete = 'off';
    form.appendChild(walletLabelInput);

    const addressInput = document.createElement('input');
    addressInput.type = 'text';
    addressInput.placeholder = 'Address';
    addressInput.className = 'styled-input styled-text';
    addressInput.autocomplete = 'off';
    addressInput.disabled = true; // Initially disabled
    form.appendChild(addressInput);

    const privkeyInput = document.createElement('input');
    privkeyInput.type = 'text';
    privkeyInput.placeholder = 'WIF Private key';
    privkeyInput.className = 'styled-input styled-text';
    privkeyInput.autocomplete = 'off';
    privkeyInput.disabled = true; // Initially disabled
    form.appendChild(privkeyInput);

    const infoText = document.createElement('p');
    infoText.className = 'info-text';
    infoText.textContent = 'Self-custodial wallet, It is very important to back up your wallet address and private key.';
    form.appendChild(infoText);

    const newWalletButton = document.createElement('button');
    newWalletButton.className = 'styled-button';
    newWalletButton.textContent = 'New Wallet';
    form.appendChild(newWalletButton);

    const addWalletButton = document.createElement('button');
    addWalletButton.className = 'styled-button';
    addWalletButton.textContent = 'Add Wallet';
    addWalletButton.disabled = true;
    form.appendChild(addWalletButton);

    // Move the checkbox and label here, below the Add Wallet button
    const importKeysCheckbox = document.createElement('input');
    importKeysCheckbox.type = 'checkbox';
    importKeysCheckbox.id = 'import-keys-checkbox';
    form.appendChild(importKeysCheckbox);

    const importKeysLabel = document.createElement('label');
    importKeysLabel.htmlFor = 'import-keys-checkbox';
    importKeysLabel.textContent = 'Import Keys';
    form.appendChild(importKeysLabel);

    landingPage.appendChild(form);

    const coinIcon = document.createElement('img');
    coinIcon.src = `/static/images/${selectedCoin.name}icon.png`;
    coinIcon.alt = `${selectedCoin.name} Icon`;
    coinIcon.className = 'coin-icon';
    landingPage.appendChild(coinIcon);

    // Function to check if all fields are filled
    const checkFields = () => {
        if (walletLabelInput.value && addressInput.value && privkeyInput.value) {
            addWalletButton.disabled = false; // Enable the button if all fields are filled
        } else {
            addWalletButton.disabled = true; // Disable the button if any field is empty
        }
    };

    // Add event listeners to check fields on input
    walletLabelInput.addEventListener('input', checkFields);
    addressInput.addEventListener('input', checkFields);
    privkeyInput.addEventListener('input', checkFields);

    // Add event listener to the checkbox to toggle input fields
    importKeysCheckbox.addEventListener('change', () => {
        const isChecked = importKeysCheckbox.checked;
        addressInput.disabled = !isChecked;
        privkeyInput.disabled = !isChecked;
    });

    // Add event listeners to handle button clicks
    addWalletButton.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent form submission

        // Create a new wallet object with the correct structure
        const newWallet = {
            label: walletLabelInput.value,
            ticker: selectedCoin.ticker,
            address: addressInput.value,
            privkey: privkeyInput.value,
            utxos: [] // Only include utxos array
        };

        // Import the address as watch-only
        fetch(`/api/importaddress/${selectedCoin.ticker}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                address: newWallet.address,
                label: newWallet.label,
                rescan: false
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                console.log('Address imported:', data.imported_address);
            } else {
                console.error('Error importing address:', data.message);
                alert('Failed to import address: ' + data.message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred while importing the address.');
        })
        .finally(() => {
            // Retrieve existing wallets from local storage
            const walletsData = JSON.parse(localStorage.getItem('wallets')) || [];
            console.log('Existing wallets:', walletsData);

            // Add the new wallet to the array
            walletsData.push(newWallet);
            console.log('Updated wallets:', walletsData);

            // Save the updated wallets array back to local storage
            localStorage.setItem('wallets', JSON.stringify(walletsData));
            console.log('New wallet added to local storage:', newWallet);

            // Return to the main UI
            landingPage.innerHTML = ''; // Clear the add wallet UI
            initializeWallet(); // Reinitialize the main wallet UI
        });
    });

    newWalletButton.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent form submission

        // Call the generatekey route
        fetch(`/bitcore_lib/generatekey/${selectedCoin.ticker}`)
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error('Error generating key:', data.error);
                } else {
                    // Fill the text fields with the returned values
                    addressInput.value = data.address;
                    privkeyInput.value = data.wif;
                    checkFields(); // Re-check fields after auto-filling
                }
            })
            .catch(error => {
                console.error('Error fetching key:', error);
            });
    });
}