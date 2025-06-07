import { initializeWallet } from './main.js';
import { coins } from './networks.js';

// Mapping of coin tickers to their respective Ord explorer URLs
const ordExplorerUrls = {
    DOGE: 'https://wonky-ord.dogeord.io',
    PEP: 'https://pepinals.com',
    SHIC: 'https://shicinals-ord.com',
    BONC: 'https://inscription.bonkscoin.io',
    FLOP: 'https://flopinals.flopcoin.net',
    DGB: 'https://dgb-ordinals.com',
    DEV: 'https://ord-dogecoinev.io'
};

export function nftsUI(selectedWallet) {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = ''; // Clear existing content

    // Set background color based on selected coin
    const selectedCoin = coins.find(coin => coin.ticker === selectedWallet.ticker);
    if (selectedCoin) {
        landingPage.style.backgroundColor = selectedCoin.color;
    }

    // Preload images
    const imagesToPreload = ['./static/images/back.png'];
    imagesToPreload.forEach(src => {
        const img = new Image();
        img.src = src;
        img.onload = () => console.log(`Image loaded: ${src}`);
        img.onerror = () => console.error(`Failed to load image: ${src}`);
    });

    // Create header with back button
    const header = document.createElement('div');
    header.className = 'header';

    const backButton = document.createElement('button');
    backButton.className = 'back-button';
    backButton.innerHTML = '<img src="./static/images/back.png" alt="Back Icon" width="24" height="24" />';
    backButton.addEventListener('click', () => {
        const iframe = document.querySelector('.scrollable-iframe');
        if (iframe.dataset.view === 'details') {
            displayUtxoList(); // Return to UTXO list
        } else {
            landingPage.innerHTML = '';
            initializeWallet(); // Return to main UI
        }
    });

    header.appendChild(backButton);
    landingPage.appendChild(header);

    // Add title
    const title = document.createElement('h1');
    title.textContent = 'NFTs';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // Create scrollable iframe
    const iframe = document.createElement('iframe');
    iframe.className = 'scrollable-iframe';
    iframe.style.width = '100%';
    iframe.style.height = '550px';
    iframe.style.border = '1px solid #333';
    iframe.style.overflow = 'auto';
    landingPage.appendChild(iframe);

    // Retrieve wallet from local storage
    const wallets = JSON.parse(localStorage.getItem('wallets')) || [];
    const wallet = wallets.find(w => w.label === selectedWallet.label && w.ticker === selectedWallet.ticker);

    // Function to display UTXOs with Inscription Events
    async function displayUtxoList() {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write('<html><body style="background-color: #1a1a1a; color: #ffffff; padding: 20px;">');

        if (wallet && wallet.utxos) {
            const explorerUrl = ordExplorerUrls[selectedWallet.ticker];
            if (!explorerUrl) {
                doc.write('<div>No explorer URL for this wallet.</div>');
                doc.write('</body></html>');
                doc.close();
                return;
            }

            for (const utxo of wallet.utxos) {
                const inscriptionData = await checkForInscriptionEvent(selectedWallet.ticker, utxo.txid);
                if (inscriptionData && inscriptionData.inscriptionId) {
                    doc.write(
                        `<div><a href="#" style="color: #00b4ff;" onclick="parent.fetchTransactionDetails('${explorerUrl}', '${utxo.txid}', '${utxo.vout}')">${utxo.txid}<strong>:${utxo.vout}</strong></a></div>`
                    );
                }
                await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit buffer
            }
        } else {
            doc.write('<div>No UTXOs found.</div>');
        }

        doc.write('</body></html>');
        doc.close();
        iframe.dataset.view = 'utxoList';
    }

    // Function to check for Inscription Event and return details
    async function checkForInscriptionEvent(ticker, txid) {
        const explorerUrl = ordExplorerUrls[ticker];
        if (!explorerUrl) {
            console.error(`No explorer URL for ticker: ${ticker}`);
            return null;
        }

        const targetUrl = `${explorerUrl}/tx/${txid}`;
        const proxyUrl = `/proxy?url=${encodeURIComponent(targetUrl)}`;
        console.log(`Fetching: ${proxyUrl}`); // Debug full URL

        const maxRetries = 5;
        let attempt = 0;
        let delay = 1000; // Start with 1-second delay

        while (attempt < maxRetries) {
            try {
                const response = await fetch(proxyUrl);
                if (response.ok) {
                    const text = await response.text();
                    // Parse plain text response for inscription event
                    const inscriptionMatch = text.match(/Inscription Event[\s\S]*?Event\s+(\w+)[\s\S]*?Inscription ID\s+([a-z0-9]+i\d+)/i);
                    if (inscriptionMatch) {
                        const [, event, inscriptionId] = inscriptionMatch;
                        const toMatch = text.match(/to\s+([A-Za-z0-9]+)/);
                        const fromMatch = text.match(/from\s+([A-Za-z0-9]+)/);
                        saveInscriptionId(inscriptionId);
                        return {
                            event: event,
                            inscriptionId: inscriptionId,
                            from: fromMatch ? fromMatch[1] : "N/A",
                            to: toMatch ? toMatch[1] : "N/A"
                        };
                    }
                    return null;
                } else if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;
                    console.warn(`Rate limit hit for ${txid}, retrying in ${waitTime}ms...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    delay *= 2; // Exponential backoff
                    attempt++;
                } else if (response.status === 404) {
                    console.log(`Transaction ${txid} not found or proxy error at ${proxyUrl}`);
                    return null;
                } else {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
            } catch (error) {
                console.error(`Error fetching ${txid} via proxy:`, error);
                if (attempt === maxRetries - 1) return null;
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                attempt++;
            }
        }
        return null;
    }

    // Function to save inscription ID to local storage
    function saveInscriptionId(inscriptionId) {
        const inscriptions = JSON.parse(localStorage.getItem('inscriptions')) || [];
        if (!inscriptions.includes(inscriptionId)) {
            inscriptions.push(inscriptionId);
            localStorage.setItem('inscriptions', JSON.stringify(inscriptions));
            console.log(`Saved inscription ID: ${inscriptionId}`);
        }
    }

    // Function to fetch and display inscription details
    window.fetchTransactionDetails = async function(explorerUrl, txid, vout) {
        const targetUrl = `${explorerUrl}/tx/${txid}`;
        const proxyUrl = `/proxy?url=${encodeURIComponent(targetUrl)}`;
        console.log(`Fetching details: ${proxyUrl}`); // Debug full URL

        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const text = await response.text();
            const inscriptionMatch = text.match(/Inscription Event[\s\S]*?Event\s+(\w+)[\s\S]*?Inscription ID\s+([a-z0-9]+i\d+)/i);
            const toMatch = text.match(/to\s+([A-Za-z0-9]+)/);
            const fromMatch = text.match(/from\s+([A-Za-z0-9]+)/);

            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write('<html><body style="background-color: #1a1a1a; color: #ffffff; padding: 20px;">');
            iframeDoc.write(`<h2>Inscription Details for ${txid}:${vout}</h2>`);
            if (inscriptionMatch) {
                const [, event, inscriptionId] = inscriptionMatch;
                iframeDoc.write(`<p><strong>Event:</strong> ${event}</p>`);
                iframeDoc.write(`<p><strong>Inscription ID:</strong> ${inscriptionId}</p>`);
                if (fromMatch) iframeDoc.write(`<p><strong>From:</strong> ${fromMatch[1]}</p>`);
                if (toMatch) iframeDoc.write(`<p><strong>To:</strong> ${toMatch[1]}</p>`);
            } else {
                iframeDoc.write('<p>No inscription event found.</p>');
            }
            iframeDoc.write(`<pre>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`); // Escape HTML
            iframeDoc.write('</body></html>');
            iframeDoc.close();
            iframe.dataset.view = 'details';
        } catch (error) {
            console.error('Error fetching transaction details:', error);
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write('<html><body style="background-color: #1a1a1a; color: #ffffff; padding: 20px;">');
            iframeDoc.write('<p>Error loading inscription details.</p>');
            iframeDoc.write('</body></html>');
            iframeDoc.close();
            iframe.dataset.view = 'details';
        }
    };

    // Initial display of UTXO list if wallet exists
    if (wallet && wallet.utxos) {
        displayUtxoList();
    }
}