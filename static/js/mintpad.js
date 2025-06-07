import { mintUI } from './mint.js';
import { mintPadScreen2UI } from './mintPadScreen2.js';
import { mintPadBulkUI } from './mintPadBulk.js';

// Mapping of coin tickers to their respective Ord explorer URLs
const ordExplorerUrls = {
    DOGE: 'https://wonky-ord.dogeord.io/content/',
    PEP: 'https://pepinals.com/content/',
    SHIC: 'https://shicinals-ord.com/content/',
    BONC: 'https://inscription.bonkscoin.io/content/',
    FLOP: 'https://flopinals.flopcoin.net/content/',
    DGB: 'https://dgb-ordinals.com/content/',
    DEV: 'https://ord-dogecoinev.io/content/'
};

// Define a blacklist of collection names
const collectionBlacklist = ["BC-Plugz"];

export function mintPadUI(selectedWallet) {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = ''; // Clear existing content

    // Preload images with onload and onerror handlers
    const imagesToPreload = [
        './static/images/back.png',
        // Add other images you need to preload here
    ];

    imagesToPreload.forEach(src => {
        const img = new Image();
        img.src = src;
        img.onload = () => console.log(`Image loaded successfully: ${src}`);
        img.onerror = () => console.error(`Failed to load image: ${src}`);
    });

    // Create header with back button
    const header = document.createElement('div');
    header.className = 'header';

    const backButton = document.createElement('button');
    backButton.className = 'back-button';
    backButton.innerHTML = '<img src="./static/images/back.png" alt="Back Icon" width="24" height="24" />';
    backButton.addEventListener('click', () => {
        landingPage.innerHTML = '';
        mintUI(selectedWallet); // Navigate back to mint UI
    });

    header.appendChild(backButton);
    landingPage.appendChild(header);

    // Title
    const title = document.createElement('h1');
    title.textContent = 'Mint Pad';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // Scrollable iframe container for collections
    const iframe = document.createElement('iframe');
    iframe.className = 'scrollable-iframe';
    iframe.style.width = '100%'; // Match the app's style
    iframe.style.height = '550px'; // Match the app's style
    iframe.style.border = '1px solid #333'; // Match the app's style
    iframe.style.overflow = 'auto'; // Enable scrolling
    landingPage.appendChild(iframe);

    // Function to fetch and display collections
    function fetchAndDisplayCollections() {
        fetch('/rc001/collections')
            .then(response => response.json())
            .then(data => {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                doc.open();
                doc.write(`
                    <html>
                        <head>
                            <style>
                                body {
                                    background-color: #1a1a1a;
                                    color: #ffffff;
                                    font-family: Arial, sans-serif;
                                    margin: 0;
                                    padding: 20px;
                                }
                                .collections-container {
                                    display: grid;
                                    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                                    gap: 15px;
                                }
                                .collection-item {
                                    background-color: #2a2a2a;
                                    padding: 15px;
                                    border-radius: 8px;
                                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
                                    transition: transform 0.2s, box-shadow 0.2s;
                                }
                                .collection-item:hover {
                                    transform: translateY(-5px);
                                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
                                }
                                .collection-title {
                                    font-size: 1.1em;
                                    margin: 0 0 8px 0;
                                    color: #00b4ff;
                                }
                                .collection-stats {
                                    font-size: 0.85em;
                                    color: #b0b0b0;
                                    margin-bottom: 8px;
                                }
                                .inscription-preview {
                                    width: 100px;
                                    height: 100px;
                                    border: none;
                                    margin-bottom: 10px;
                                    background-color: #333; /* Reserve space */
                                }
                                .button-container {
                                    display: flex;
                                    flex-wrap: wrap;
                                    gap: 8px;
                                }
                                .action-button {
                                    background-color: #00b4ff;
                                    color: #ffffff;
                                    border: none;
                                    padding: 6px 10px;
                                    border-radius: 5px;
                                    cursor: pointer;
                                    font-size: 0.9em;
                                    transition: background-color 0.2s;
                                }
                                .action-button:hover {
                                    background-color: #008ecc;
                                }
                                .action-button:disabled {
                                    background-color: #555;
                                    cursor: not-allowed;
                                }
                                .error-message {
                                    color: #ff4d4d;
                                    text-align: center;
                                    padding: 20px;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="collections-container"></div>
                        </body>
                    </html>
                `);
                doc.close();

                const container = doc.querySelector('.collections-container');

                if (data.status === "success") {
                    const collections = Object.entries(data.collections)
                        .filter(([collectionName, collectionData]) => 
                            collectionData.coin_ticker === selectedWallet.ticker &&
                            !collectionBlacklist.includes(collectionName) // Exclude blacklisted collections
                        )
                        .map(([collectionName, collectionData]) => ({
                            collectionName,
                            collectionData
                        }));

                    // Sort collections: highest number of mints at the top, fully minted at the bottom
                    collections.sort((a, b) => {
                        if (a.collectionData.percent_minted === 100 && b.collectionData.percent_minted !== 100) {
                            return 1;
                        }
                        if (b.collectionData.percent_minted === 100 && a.collectionData.percent_minted !== 100) {
                            return -1;
                        }
                        return b.collectionData.minted - a.collectionData.minted;
                    });

                    if (collections.length === 0) {
                        const noCollections = doc.createElement('div');
                        noCollections.className = 'error-message';
                        noCollections.textContent = 'No collections found for this wallet.';
                        container.appendChild(noCollections);
                        return;
                    }

                    collections.forEach(({ collectionName, collectionData }) => {
                        const collectionDiv = doc.createElement('div');
                        collectionDiv.className = 'collection-item';

                        // Collection title
                        const title = doc.createElement('div');
                        title.className = 'collection-title';
                        title.textContent = `${collectionData.coin_ticker}: ${collectionName}`;
                        collectionDiv.appendChild(title);

                        // Collection stats
                        const stats = doc.createElement('div');
                        stats.className = 'collection-stats';
                        stats.textContent = `Minted: ${collectionData.minted}/${collectionData.max_supply} (${collectionData.percent_minted}%)`;
                        collectionDiv.appendChild(stats);

                        // Fetch and display a random inscription preview
                        fetch(`/rc001/collection/${collectionData.coin_ticker}/${collectionName}`)
                            .then(response => response.json())
                            .then(data => {
                                if (data.status === "success" && data.collection.length > 0) {
                                    const randomIndex = Math.floor(Math.random() * data.collection.length);
                                    const randomInscription = data.collection[randomIndex];

                                    const inscriptionIframe = doc.createElement('iframe');
                                    // Use the correct Ord explorer URL based on the selected wallet's coin ticker
                                    const explorerUrl = ordExplorerUrls[selectedWallet.ticker] || 'https://default-explorer.com/content/';
                                    inscriptionIframe.src = `${explorerUrl}${randomInscription.inscription_id}`;
                                    inscriptionIframe.className = 'inscription-preview';
                                    inscriptionIframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
                                    collectionDiv.appendChild(inscriptionIframe);
                                }
                            })
                            .catch(error => {
                                console.error(`Error fetching inscription for ${collectionName}:`, error);
                            });

                        // Mint price in DOGE
                        const mintPriceInCoins = collectionData.mint_price / 100000000;
                        const mintPrice = doc.createElement('div');
                        mintPrice.className = 'collection-stats';
                        mintPrice.textContent = `Mint Price: ${mintPriceInCoins} DOGE`;
                        collectionDiv.appendChild(mintPrice);

                        // Button container
                        const buttonContainer = doc.createElement('div');
                        buttonContainer.className = 'button-container';

                        // Mint button (only if not fully minted)
                        if (collectionData.percent_minted < 100) {
                            const mintButton = doc.createElement('button');
                            mintButton.className = 'action-button';
                            mintButton.textContent = 'Mint';
                            mintButton.addEventListener('click', () => {
                                fetch(`/rc001/mint_hex/${collectionData.coin_ticker}/${collectionName}`)
                                    .then(response => response.json())
                                    .then(mintData => {
                                        console.log('Mint Data:', mintData);
                                        if (mintData.status === "success") {
                                            const hexString = mintData.hex;
                                            writeToLocalStorage('pendingHexData', { mimeType: 'text/html', hexData: hexString });
                                            writeToLocalStorage('pendingCollectionDetails', { ...collectionData, collection_name: collectionName });
                                            mintPadScreen2UI(selectedWallet);
                                        } else {
                                            alert('Error: ' + mintData.message);
                                        }
                                    })
                                    .catch(error => {
                                        console.error('Error fetching mint data:', error);
                                        alert('An error occurred while minting.');
                                    });
                            });
                            buttonContainer.appendChild(mintButton);

                            // Bulk Mint button
                            const bulkMintButton = doc.createElement('button');
                            bulkMintButton.className = 'action-button';
                            bulkMintButton.textContent = 'Bulk';
                            bulkMintButton.addEventListener('click', () => {
                                writeToLocalStorage('pendingCollectionDetails', { ...collectionData, collection_name: collectionName });
                                mintPadBulkUI(selectedWallet);
                            });
                            buttonContainer.appendChild(bulkMintButton);
                        }

                        // Info button
                        const infoButton = doc.createElement('button');
                        infoButton.className = 'action-button';
                        infoButton.textContent = 'Info';
                        infoButton.addEventListener('click', () => {
                            displayCollectionInfo(collectionName, collectionData);
                        });
                        buttonContainer.appendChild(infoButton);

                        collectionDiv.appendChild(buttonContainer);
                        container.appendChild(collectionDiv);
                    });
                } else {
                    const errorMsg = doc.createElement('div');
                    errorMsg.className = 'error-message';
                    errorMsg.textContent = `Error: ${data.message || 'Unknown server error'}`;
                    container.appendChild(errorMsg);
                }
            })
            .catch(error => {
                console.error('Error fetching collections:', error);
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const errorMsg = doc.createElement('div');
                errorMsg.className = 'error-message';
                errorMsg.textContent = 'An error occurred while fetching collections.';
                doc.body.appendChild(errorMsg);
            });
    }

    // Function to display detailed collection info
    function displayCollectionInfo(collectionName, collectionData) {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write('<html><body style="background-color: #1a1a1a; color: #ffffff; padding: 20px;"></body></html>');
        doc.close();
        const body = doc.body;

        const title = doc.createElement('h2');
        title.textContent = collectionName;
        title.style.color = '#00b4ff';
        body.appendChild(title);

        fetch(`/rc001/collection/${collectionData.coin_ticker}/${collectionName}`)
            .then(response => response.json())
            .then(data => {
                if (data.status === "success") {
                    const uniqueAddresses = new Set(data.collection.map(item => item.inscription_address));
                    const uniqueAddressCount = uniqueAddresses.size;
                    const deployInscriptionId = `${collectionData.deploy_txid}i0`;

                    const infoDiv = doc.createElement('div');
                    infoDiv.innerHTML = `
                        <p><strong>Website:</strong> ${collectionData.website || 'N/A'}</p>
                        <p><strong>Deploy Address:</strong> ${collectionData.deploy_address}</p>
                        <p><strong>Deploy Inscription ID:</strong> ${deployInscriptionId}</p>
                        <p><strong>Parent Inscription ID:</strong> ${collectionData.parent_inscription_id}</p>
                        <p><strong>Emblem Inscription ID:</strong> ${collectionData.emblem_inscription_id}</p>
                        <p><strong>Max Supply:</strong> ${collectionData.max_supply}</p>
                        <p><strong>Left to Mint:</strong> ${collectionData.left_to_mint}</p>
                        <p><strong>Minted:</strong> ${collectionData.minted}</p>
                        <p><strong>Mint Price:</strong> ${collectionData.mint_price / 100000000} DOGE</p>
                        <p><strong>Percent Minted:</strong> ${collectionData.percent_minted}%</p>
                        <p><strong>Unique Addresses:</strong> ${uniqueAddressCount}</p>
                    `;
                    body.appendChild(infoDiv);

                    const backButton = doc.createElement('button');
                    backButton.textContent = 'Back';
                    backButton.className = 'action-button';
                    backButton.addEventListener('click', fetchAndDisplayCollections);
                    body.appendChild(backButton);
                } else {
                    const errorMsg = doc.createElement('div');
                    errorMsg.className = 'error-message';
                    errorMsg.textContent = `Error: ${data.message}`;
                    body.appendChild(errorMsg);
                }
            })
            .catch(error => {
                console.error('Error fetching collection data:', error);
                const errorMsg = doc.createElement('div');
                errorMsg.className = 'error-message';
                errorMsg.textContent = 'An error occurred while fetching collection data.';
                body.appendChild(errorMsg);
            });
    }

    // Initialize the display
    fetchAndDisplayCollections();
}

// Helper function to write to localStorage with logging
function writeToLocalStorage(key, value) {
    console.log(`Write to localStorage [${key}]:`, value);
    localStorage.setItem(key, JSON.stringify(value));
}