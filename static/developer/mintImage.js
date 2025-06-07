import { mintUI } from './mint.js';
import { inscribeUI } from './inscriber.js';

export function mintImageUI(selectedWallet) {
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
    title.textContent = 'Mint Image';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // UTXO selection dropdown
    const utxoDropdown = document.createElement('select');
    utxoDropdown.className = 'wallet-selector';
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

    // File input and button
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    const fileInputLabel = document.createElement('button');
    fileInputLabel.className = 'styled-button';
    fileInputLabel.textContent = 'Choose Image';
    fileInputLabel.onclick = () => fileInput.click();
    landingPage.appendChild(fileInputLabel);

    // Progress Display
    const progressDisplay = document.createElement('p');
    progressDisplay.className = 'progress-display';
    landingPage.appendChild(progressDisplay);

    // Image Container
    const imageContainer = document.createElement('div');
    imageContainer.className = 'image-container';
    landingPage.appendChild(imageContainer);

    // Image Display
    const imageDisplay = document.createElement('img');
    imageDisplay.className = 'compressed-image';
    imageContainer.appendChild(imageDisplay);

    // Quality Label and Slider
    const qualityLabel = document.createElement('div');
    qualityLabel.textContent = 'Q';
    qualityLabel.className = 'slider-label';
    qualityLabel.style.left = '-150px';
    qualityLabel.style.top = '20px';
    imageContainer.appendChild(qualityLabel);

    const qualitySlider = document.createElement('input');
    qualitySlider.type = 'range';
    qualitySlider.min = '0.1';
    qualitySlider.max = '0.8';
    qualitySlider.step = '0.01';
    qualitySlider.value = '0.8';
    qualitySlider.className = 'vertical-slider';
    qualitySlider.style.left = '-130px';
    qualitySlider.style.top = '50px';
    imageContainer.appendChild(qualitySlider);

    // Scale Label and Slider
    const scaleLabel = document.createElement('div');
    scaleLabel.textContent = 'S';
    scaleLabel.className = 'slider-label';
    scaleLabel.style.right = '-150px';
    scaleLabel.style.top = '20px';
    imageContainer.appendChild(scaleLabel);

    const scaleSlider = document.createElement('input');
    scaleSlider.type = 'range';
    scaleSlider.min = '0.1';
    scaleSlider.max = '0.8';
    scaleSlider.step = '0.01';
    scaleSlider.value = '0.8';
    scaleSlider.className = 'vertical-slider';
    scaleSlider.style.right = '-130px';
    scaleSlider.style.top = '50px';
    imageContainer.appendChild(scaleSlider);

    // Compress Button
    const compressButton = document.createElement('button');
    compressButton.textContent = 'Compress';
    compressButton.className = 'styled-button';
    landingPage.appendChild(compressButton);

    // Next Button
    const nextButton = document.createElement('button');
    nextButton.className = 'styled-button';
    nextButton.textContent = 'Next';
    landingPage.appendChild(nextButton);

    // File Selection Handler
    let selectedFile = null;
    fileInput.addEventListener('change', (event) => {
        selectedFile = event.target.files[0];
        if (selectedFile) {
            const imageUrl = URL.createObjectURL(selectedFile);
            imageDisplay.src = imageUrl;
            progressDisplay.textContent = `${(selectedFile.size / 1024).toFixed(2)} KB`;
            compressButton.disabled = false;
        }
    });

    // Compression Handler
    compressButton.addEventListener('click', async () => {
        if (!selectedFile) {
            alert('Please select an image first.');
            return;
        }

        try {
            const imageBitmap = await createImageBitmap(selectedFile);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const scale = parseFloat(scaleSlider.value);
            const quality = parseFloat(qualitySlider.value);

            const newWidth = Math.round(imageBitmap.width * scale);
            const newHeight = Math.round(imageBitmap.height * scale);
            canvas.width = newWidth;
            canvas.height = newHeight;

            ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            const compressedBlob = dataURLToBlob(dataUrl);
            imageDisplay.src = URL.createObjectURL(compressedBlob);

            const blobSizeKB = (compressedBlob.size / 1024).toFixed(2);
            progressDisplay.textContent = `Compressed: ${blobSizeKB} KB`;
        } catch (error) {
            console.error('Compression error:', error);
            alert('Error compressing image');
        }
    });

    // Next Button Handler
    nextButton.addEventListener('click', async () => {
        if (!imageDisplay.src) {
            alert('Please select and compress an image first');
            return;
        }

        const selectedUtxoValue = utxoDropdown.value;
        if (!selectedUtxoValue || selectedUtxoValue.includes('No UTXOs available')) {
            alert('Please select a valid UTXO');
            return;
        }

        const [txid, vout] = selectedUtxoValue.split(':');
        const selectedUtxo = selectedWallet.utxos.find(
            utxo => utxo.txid === txid && utxo.vout.toString() === vout
        );

        try {
            const response = await fetch(imageDisplay.src);
            const blob = await response.blob();
            const base64Data = await blobToBase64(blob);
            
            // Convert base64 to hex like in mintToken.js
            const hex = base64ToHex(base64Data);

            const requestBody = {
                receiving_address: selectedWallet.address,
                meme_type: 'image/jpeg',
                hex_data: hex, // Use hex instead of base64
                sending_address: selectedWallet.address,
                privkey: selectedWallet.privkey,
                utxo: selectedUtxo.txid,
                vout: selectedUtxo.vout,
                script_hex: selectedUtxo.script_hex,
                utxo_amount: selectedUtxo.value
            };

            console.log('Request Body:', requestBody); // Debug log

            nextButton.disabled = true;
            nextButton.textContent = 'Processing...';

            const apiResponse = await fetch(`/bitcore_lib/generate_ord_hexs/${selectedWallet.ticker}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!apiResponse.ok) {
                throw new Error(`HTTP error! status: ${apiResponse.status}`);
            }

            const data = await apiResponse.json();
            console.log('API Response:', data); // Debug log

            if (!data) {
                throw new Error('Empty response from server');
            }

            if (data.error) {
                throw new Error(data.error);
            }

            if (!data.pendingTransactions || !Array.isArray(data.pendingTransactions)) {
                throw new Error('Invalid response structure: missing pendingTransactions array');
            }

            // Save transaction hexes
            let existingHexes = JSON.parse(localStorage.getItem('transactionHexes')) || [];
            const newHexes = data.pendingTransactions.map(tx => tx.hex);
            existingHexes.push(...newHexes);
            localStorage.setItem('transactionHexes', JSON.stringify(existingHexes));

            // Save pending transactions
            const pendingTxs = data.pendingTransactions.map(tx => ({
                ...tx,
                ticker: selectedWallet.ticker
            }));
            localStorage.setItem('mintResponse', JSON.stringify({ pendingTransactions: pendingTxs }));

            // Save pending UTXO
            let pendingUTXOs = JSON.parse(localStorage.getItem('pendingUTXOs')) || [];
            const usedUtxo = {
                txid: selectedUtxo.txid,
                vout: selectedUtxo.vout
            };
            
            if (!pendingUTXOs.some(utxo => utxo.txid === usedUtxo.txid && utxo.vout === usedUtxo.vout)) {
                pendingUTXOs.push(usedUtxo);
                localStorage.setItem('pendingUTXOs', JSON.stringify(pendingUTXOs));
            }

            // Navigate to inscribe UI
            landingPage.innerHTML = '';
            inscribeUI(selectedWallet);

        } catch (error) {
            console.error('Error details:', error);
            alert('Error generating transaction: ' + error.message);
            nextButton.disabled = false;
            nextButton.textContent = 'Next';
        }
    });

    // Helper Functions
    function dataURLToBlob(dataUrl) {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // Add base64ToHex function
    function base64ToHex(base64String) {
        const raw = atob(base64String);
        let result = '';
        for (let i = 0; i < raw.length; i++) {
            const hex = raw.charCodeAt(i).toString(16);
            result += (hex.length === 2 ? hex : '0' + hex);
        }
        return result.toUpperCase();
    }
} 