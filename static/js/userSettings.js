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

    // Create info paragraph for broadcast behaviour
    const info = document.createElement('p');
    info.className = 'styled-text';
    info.style.margin = '8px 20px 16px';
    info.style.opacity = '0.85';
    info.innerHTML = 'Hinweis: Beim reinen Broadcast ist die Fee schon in der signierten Transaktion festgelegt. Möchtest du eine andere Fee, musst du die Transaktionen mit dieser Fee neu erzeugen (oder per CPFP-Booster beschleunigen).';
    landingPage.appendChild(info);

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
        },
        {
            text: 'Broadcast Pending Transactions',
            onClick: async () => {
                try {
                    // Prefer structured mintResponse.pendingTransactions, fallback to transactionHexes
                    const mintResponse = JSON.parse(localStorage.getItem('mintResponse') || '{}');
                    let rawHexes = [];
                    if (Array.isArray(mintResponse?.pendingTransactions) && mintResponse.pendingTransactions.length > 0) {
                        rawHexes = mintResponse.pendingTransactions.map(tx => tx.hex).filter(Boolean);
                    }
                    if (rawHexes.length === 0) {
                        const txHexes = JSON.parse(localStorage.getItem('transactionHexes') || '[]');
                        if (Array.isArray(txHexes)) rawHexes = txHexes.filter(Boolean);
                    }

                    if (rawHexes.length === 0) {
                        alert('Keine ausstehenden Transaktionen gefunden.');
                        return;
                    }

                    const confirmSend = confirm(`Jetzt ${rawHexes.length} Transaktion(en) senden?`);
                    if (!confirmSend) return;

                    // Build payload for backend endpoint
                    const payload = { raw_txs: rawHexes };

                    // Only B1T supported by backend for now
                    const res = await fetch('/rc001/broadcast_pending/b1t', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const text = await res.text();
                    let data;
                    try { data = JSON.parse(text); } catch (e) { data = { status: 'error', message: text }; }

                    if (!res.ok || data.status !== 'success') {
                        console.error('Broadcast error:', data);
                        alert(`Fehler beim Senden: ${data.message || 'Serverfehler'}`);
                        return;
                    }

                    // Present concise results
                    if (Array.isArray(data.results)) {
                        const lines = data.results.map((r, i) => `#${i+1} — ${r.success ? 'OK' : 'FEHLER'} — ${r.txid || r.error || ''}`);
                        alert(`Broadcast Ergebnis:\n${lines.join('\n')}`);
                    } else if (Array.isArray(data.broadcastResults)) {
                        const lines = data.broadcastResults.map((r, i) => `#${i+1} — ${r.success ? 'OK' : 'FEHLER'} — ${r.txid || r.error || ''}`);
                        alert(`Broadcast Ergebnis:\n${lines.join('\n')}`);
                    } else {
                        alert('Broadcast abgeschlossen.');
                    }
                } catch (err) {
                    console.error('Broadcast exception:', err);
                    alert(`Unerwarteter Fehler: ${err?.message || err}`);
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