import { mintFolderUI } from './mintFolder.js';

export function jsonViewerUI(selectedWallet) {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = '';

    // State tracking variable
    let currentState = 'initialJson';

    // Header with back button
    const header = document.createElement('div');
    header.className = 'header';
    const backButton = document.createElement('button');
    backButton.className = 'back-button';
    backButton.innerHTML = '<img src="./static/images/back.png" alt="Back Icon" />';
    backButton.addEventListener('click', () => {
        if (currentState === 'initialJson') {
            landingPage.innerHTML = '';
            mintFolderUI(selectedWallet);
        } else {
            currentState = 'initialJson';
            showInitialJson();
        }
    });
    header.appendChild(backButton);
    landingPage.appendChild(header);

    // Title
    const title = document.createElement('h1');
    title.textContent = 'Folder JSON Data';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // JSON Display
    const jsonDisplay = document.createElement('textarea');
    jsonDisplay.className = 'styled-input input-margin';
    jsonDisplay.style.height = '400px';
    jsonDisplay.style.width = '90%';
    jsonDisplay.style.fontFamily = 'monospace';
    jsonDisplay.style.whiteSpace = 'pre';
    jsonDisplay.style.resize = 'vertical';
    jsonDisplay.readOnly = true;

    landingPage.appendChild(jsonDisplay);

    // View buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'button-container stacked-buttons';
    landingPage.appendChild(buttonContainer);

    // DM JSON button
    const dmJsonButton = document.createElement('button');
    dmJsonButton.textContent = 'DM JSON';
    dmJsonButton.className = 'styled-button stacked-button';
    dmJsonButton.addEventListener('click', () => {
        currentState = 'dmJson';
        showDoggyJson();
    });
    buttonContainer.appendChild(dmJsonButton);

    // OW JSON button
    const owJsonButton = document.createElement('button');
    owJsonButton.textContent = 'OW JSON';
    owJsonButton.className = 'styled-button stacked-button';
    owJsonButton.addEventListener('click', () => {
        currentState = 'owJson';
        showOrdinalsJson();
    });
    buttonContainer.appendChild(owJsonButton);

    // Clear JSON button
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear Data';
    clearButton.className = 'styled-button stacked-button';
    clearButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the folder data?')) {
            localStorage.removeItem('folderFileData');
            jsonDisplay.value = 'No folder data available';
            const folderLabel = document.querySelector('.folder-label');
            if (folderLabel) {
                folderLabel.classList.remove('disabled');
                folderLabel.style.pointerEvents = '';
                folderLabel.style.opacity = '';
            }
        }
    });
    buttonContainer.appendChild(clearButton);

    function showInitialJson() {
        const folderData = localStorage.getItem('folderFileData');
        if (folderData) {
            try {
                const parsedData = JSON.parse(folderData);
                parsedData.sort((a, b) => {
                    const numA = extractNumber(a.name);
                    const numB = extractNumber(b.name);
                    return numA - numB;
                });
                jsonDisplay.value = JSON.stringify(parsedData, null, 2);
            } catch (error) {
                jsonDisplay.value = 'Error parsing folder data';
                console.error('Error parsing folder data:', error);
            }
        } else {
            jsonDisplay.value = 'No folder data available';
        }
    }

    function showDoggyJson() {
        const folderData = localStorage.getItem('folderFileData');
        if (folderData) {
            try {
                const jsonData = JSON.parse(folderData);
                const dataToDisplay = jsonData
                    .filter(item => item.inscription_id)
                    .map(item => ({
                        inscriptionId: `${item.txid}i0`,
                        name: item.name
                    }));
                jsonDisplay.value = JSON.stringify(dataToDisplay, null, 2);
            } catch (error) {
                jsonDisplay.value = 'Error parsing folder data';
                console.error('Error parsing folder data:', error);
            }
        }
    }

    function showOrdinalsJson() {
        const folderData = localStorage.getItem('folderFileData');
        if (folderData) {
            try {
                const jsonData = JSON.parse(folderData);
                const dataToDisplay = jsonData
                    .filter(item => item.inscription_id)
                    .map(item => ({
                        id: `${item.txid}i0`,
                        meta: {
                            name: item.name
                        }
                    }));
                jsonDisplay.value = JSON.stringify(dataToDisplay, null, 2);
            } catch (error) {
                jsonDisplay.value = 'Error parsing folder data';
                console.error('Error parsing folder data:', error);
            }
        }
    }

    // Utility function to extract number after '#' in the file name
    function extractNumber(name) {
        const match = name.match(/#(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    // Initialize with initial JSON view
    showInitialJson();
} 