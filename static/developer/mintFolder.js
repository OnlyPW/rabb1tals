import { mintUI } from './mint.js';
import { folderInscribeUI } from './folderInscriber.js';
import { jsonViewerUI } from './jsonViewer.js';

export function mintFolderUI(selectedWallet) {
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
    title.textContent = 'Mint Folder';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // UTXO selection dropdown
    const utxoDropdown = document.createElement('select');
    utxoDropdown.className = 'wallet-selector input-margin';
    if (selectedWallet.utxos && selectedWallet.utxos.length > 0) {
        selectedWallet.utxos
            .filter(utxo => parseFloat(utxo.value) > 0.01 && utxo.confirmations >= 1)
            .forEach(utxo => {
                const option = document.createElement('option');
                option.value = `${utxo.txid}:${utxo.vout}`;
                option.textContent = `${utxo.value} ${selectedWallet.ticker}`;
                utxoDropdown.appendChild(option);
            });
        if (selectedWallet.utxos.filter(utxo => parseFloat(utxo.value) > 0.01 && utxo.confirmations >= 1).length === 0) {
            utxoDropdown.innerHTML = '<option disabled selected>No UTXOs available above 0.01 with sufficient confirmations</option>';
        }
    } else {
        utxoDropdown.innerHTML = '<option disabled selected>No UTXOs available</option>';
    }
    landingPage.appendChild(utxoDropdown);

    // Folder input (hidden)
    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.id = 'folder-input';
    folderInput.webkitdirectory = true;
    folderInput.style.display = 'none';
    landingPage.appendChild(folderInput);

    // Select Folder button
    const folderButton = document.createElement('button');
    folderButton.textContent = 'Select Folder';
    folderButton.className = 'styled-button input-margin';
    folderButton.addEventListener('click', () => folderInput.click());
    landingPage.appendChild(folderButton);

    // Selected folder display
    const folderDisplay = document.createElement('div');
    folderDisplay.className = 'styled-text input-margin';
    landingPage.appendChild(folderDisplay);

    // Next button
    const nextButton = document.createElement('button');
    nextButton.textContent = 'Next';
    nextButton.className = 'styled-button input-margin';
    nextButton.disabled = true;
    landingPage.appendChild(nextButton);

    // View JSON button
    const jsonButton = document.createElement('button');
    jsonButton.textContent = 'View JSON';
    jsonButton.className = 'styled-button input-margin';
    jsonButton.addEventListener('click', () => {
        landingPage.innerHTML = '';
        jsonViewerUI(selectedWallet);
    });
    landingPage.appendChild(jsonButton);

    // Handle folder selection
    folderInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files);
        const fileDataArray = files
            .filter(file => file.size <= 65 * 1024 && !file.webkitRelativePath.includes('/'))
            .map(file => ({
                name: file.name.split('.').slice(0, -1).join('.'),
                file_path: file.webkitRelativePath,
                file_size: file.size,
                mime_type: file.type || 'application/octet-stream'
            }))
            .sort((a, b) => {
                const numA = a.name.match(/\d+/);
                const numB = b.name.match(/\d+/);

                if (numA && numB) {
                    // Both names contain numbers, sort numerically
                    return parseInt(numA[0], 10) - parseInt(numB[0], 10);
                } else if (numA) {
                    // Only 'a' contains a number, it should come first
                    return -1;
                } else if (numB) {
                    // Only 'b' contains a number, it should come first
                    return 1;
                } else {
                    // Neither name contains a number, sort alphabetically
                    return a.name.localeCompare(b.name);
                }
            });

        if (fileDataArray.length > 0) {
            localStorage.setItem('folderFileData', JSON.stringify(fileDataArray));
            folderDisplay.textContent = `Selected ${fileDataArray.length} files`;
            nextButton.disabled = false;

            // Alert for any skipped files
            const skippedFiles = files.filter(file => file.size > 65 * 1024 || file.webkitRelativePath.includes('/'));
            if (skippedFiles.length > 0) {
                alert(`Skipped ${skippedFiles.length} files larger than 65KB or in subfolders:\n${skippedFiles.map(f => f.name).join('\n')}`);
            }
        } else {
            folderDisplay.textContent = '';
            nextButton.disabled = true;
            alert('No valid files found in folder (all files must be under 65KB and not in subfolders)');
        }
    });

    // Handle next button click
    nextButton.addEventListener('click', () => {
        landingPage.innerHTML = '';
        folderInscribeUI(selectedWallet);
    });
} 