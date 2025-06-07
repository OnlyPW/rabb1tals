import { coins } from './networks.js';
import { walletSettingsUI } from './walletSettings.js'; // Import the walletSettingsUI function
import { initializeWallet } from './main.js';  // Add this import

export function settingsUI(selectedCoin) {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = ''; // Clear existing content

    const header = document.createElement('div');
    header.className = 'header';

    const backButton = document.createElement('button');
    backButton.className = 'back-button';
    backButton.innerHTML = '<img src="./static/images/back.png" alt="Back Icon" />';
    backButton.addEventListener('click', () => {
        const confirmExit = confirm('Go back without saving?');
        if (confirmExit) {
            landingPage.innerHTML = ''; // Clear the settings UI
            walletSettingsUI(selectedCoin); // Navigate back to the Wallet Settings page
        }
    });

    header.appendChild(backButton);
    landingPage.appendChild(header);

    const title = document.createElement('h1');
    title.textContent = 'Settings';
    title.className = 'page-title';
    landingPage.appendChild(title);

    const form = document.createElement('form');
    form.className = 'wallet-form';

    // Create a container for the checkboxes
    const checkboxGroup = document.createElement('div');
    checkboxGroup.className = 'checkbox-group';

    // Retrieve saved settings from local storage
    const savedSettings = JSON.parse(localStorage.getItem('coinSettings')) || {};

    coins.forEach(coin => {
        const label = document.createElement('label');
        label.className = 'checkbox-container';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'styled-checkbox';
        checkbox.checked = savedSettings[coin.ticker] !== false; // Default to true if not set
        checkbox.addEventListener('change', () => {
            // Ensure at least one checkbox is checked
            const checkedBoxes = form.querySelectorAll('input[type="checkbox"]:checked');
            if (checkedBoxes.length === 0) {
                checkbox.checked = true; // Revert change if no boxes are checked
                alert('At least one coin network must be selected.');
            }
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${coin.name}`));
        checkboxGroup.appendChild(label); // Append to the checkbox group
    });

    // Append the checkbox group to the form
    form.appendChild(checkboxGroup);

    // Create a dropdown for price view settings
    const priceViewLabel = document.createElement('label');
    priceViewLabel.textContent = 'Price View:';
    priceViewLabel.className = 'dropdown-label';

    const priceViewSelect = document.createElement('select');
    priceViewSelect.className = 'dropdown-select';

    const options = [
        { value: 'usd', text: 'USD' },
        { value: 'pounds_of_wildrice', text: 'Pounds of Wildrice' },
        { value: 'none', text: 'None' }
    ];

    options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = option.text;
        priceViewSelect.appendChild(opt);
    });

    // Set default value to Pounds of Wildrice
    priceViewSelect.value = 'pounds_of_wildrice';

    // Append the dropdown to the form
    priceViewLabel.appendChild(priceViewSelect);
    form.appendChild(priceViewLabel);

    // Add a text box for the price of wildrice
    const wildricePriceLabel = document.createElement('label');
    wildricePriceLabel.textContent = 'Wildrice (USD):';
    wildricePriceLabel.className = 'text-label';

    const wildricePriceInput = document.createElement('input');
    wildricePriceInput.type = 'text';
    wildricePriceInput.className = 'text-input';
    wildricePriceInput.value = '25.00'; // Default value

    wildricePriceLabel.appendChild(wildricePriceInput);
    form.appendChild(wildricePriceLabel);

    // Save Settings button
    const saveButton = document.createElement('button');
    saveButton.className = 'styled-button';
    saveButton.textContent = 'Save Settings';
    saveButton.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent form submission

        // Save settings to local storage
        const newSettings = {};
        form.querySelectorAll('input[type="checkbox"]').forEach((checkbox, index) => {
            newSettings[coins[index].ticker] = checkbox.checked;
        });

        // Save the selected price view
        newSettings['priceView'] = priceViewSelect.value;

        // Save the price of wildrice
        newSettings['wildricePrice'] = wildricePriceInput.value;

        localStorage.setItem('coinSettings', JSON.stringify(newSettings));
        console.log('Settings saved:', newSettings);
        
        // Show success message and return to main
        alert('Settings saved successfully!');
        landingPage.innerHTML = '';
        initializeWallet();
    });

    form.appendChild(saveButton);
    landingPage.appendChild(form);
} 