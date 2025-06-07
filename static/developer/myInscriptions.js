import { initializeWallet } from './main.js';
import { userSettingsUI } from './userSettings.js';

export function myInscriptionsUI(selectedWallet) {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = '';

    // Create header with back button
    const header = document.createElement('div');
    header.className = 'header';

    const backButton = document.createElement('button');
    backButton.className = 'back-button';
    backButton.innerHTML = '<img src="./static/images/back.png" alt="Back Icon" />';
    backButton.addEventListener('click', () => {
        landingPage.innerHTML = '';
        userSettingsUI(selectedWallet);
    });

    header.appendChild(backButton);
    landingPage.appendChild(header);

    // Title
    const title = document.createElement('h1');
    title.textContent = 'My Inscriptions Made';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // Create main content container
    const mainContent = document.createElement('div');
    mainContent.className = 'main-content';

    // Scrollable iframe container
    const iframe = document.createElement('iframe');
    iframe.className = 'scrollable-iframe';
    mainContent.appendChild(iframe);

    // Copy to Clipboard button
    const copyButton = document.createElement('button');
    copyButton.textContent = 'Copy';
    copyButton.className = 'styled-button';
    copyButton.addEventListener('click', () => {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const pre = doc.querySelector('pre');
        if (pre) {
            navigator.clipboard.writeText(pre.textContent)
                .then(() => alert('JSON data copied to clipboard!'))
                .catch(err => console.error('Failed to copy text: ', err));
        }
    });
    mainContent.appendChild(copyButton);

    // Add main content to landing page
    landingPage.appendChild(mainContent);

    // Function to show inscriptions
    function showInscriptions() {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(`
            <html>
                <head>
                    <style>
                        body {
                            background-color: black;
                            color: white;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                            padding: 20px;
                        }
                        .json-button {
                            background-color: black;
                            color: white;
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            padding: 10px;
                            margin: 5px;
                            width: 90%;
                            cursor: pointer;
                            font-family: inherit;
                        }
                        pre {
                            white-space: pre-wrap;
                            word-break: break-word;
                            padding: 10px;
                        }
                        .inscription-item {
                            padding: 10px;
                            border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                        }
                    </style>
                </head>
                <body></body>
            </html>
        `);
        doc.close();
        const body = doc.body;

        // Get inscriptions from localStorage and filter for selected wallet
        const myInscriptions = JSON.parse(localStorage.getItem('MyInscriptions')) || [];
        const walletInscriptions = myInscriptions.filter(inscription => 
            inscription.sendingaddress === selectedWallet.address
        );

        if (walletInscriptions.length === 0) {
            const noInscriptions = doc.createElement('div');
            noInscriptions.className = 'inscription-item';
            noInscriptions.textContent = 'No inscriptions made with this wallet';
            body.appendChild(noInscriptions);
            return;
        }

        // Create buttons for different JSON views
        const ordinalsButton = doc.createElement('button');
        ordinalsButton.textContent = 'Ordinals Wallet Format';
        ordinalsButton.className = 'json-button';
        ordinalsButton.addEventListener('click', () => showOrdinalsJson(walletInscriptions));
        body.appendChild(ordinalsButton);

        const doggyButton = doc.createElement('button');
        doggyButton.textContent = 'Doggy Market Format';
        doggyButton.className = 'json-button';
        doggyButton.addEventListener('click', () => showDoggyJson(walletInscriptions));
        body.appendChild(doggyButton);

        // Show inscriptions list
        walletInscriptions.forEach(inscription => {
            const inscriptionDiv = doc.createElement('div');
            inscriptionDiv.className = 'inscription-item';
            inscriptionDiv.textContent = `Name: ${inscription.name}`;
            body.appendChild(inscriptionDiv);
        });
    }

    function showOrdinalsJson(inscriptions) {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const dataToDisplay = inscriptions.map(inscription => ({
            id: `${inscription.txid}i0`,
            meta: {
                name: inscription.name
            }
        }));
        displayJson(doc, dataToDisplay);
    }

    function showDoggyJson(inscriptions) {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const dataToDisplay = inscriptions.map(inscription => ({
            inscriptionId: `${inscription.txid}i0`,
            name: inscription.name
        }));
        displayJson(doc, dataToDisplay);
    }

    function displayJson(doc, data) {
        doc.body.innerHTML = '';
        const pre = doc.createElement('pre');
        pre.textContent = JSON.stringify(data, null, 2);
        doc.body.appendChild(pre);
    }

    // Initialize the display
    showInscriptions();
} 