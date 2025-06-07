import { landingPageUI } from './landingPageUI.js';
import { mintPadScreen2UI } from './mintPadScreen2.js';
import { mintPadBulkUI } from './mintPadBulk.js';
import { dogeMintPadUI } from './dogeMintPad.js';
import { inscribeUI } from './inscriber.js';
import { mintSelectionUI } from './mintSelection.js';

export function dogeMintPadUI() {
    const landingPage = document.getElementById('landing-page');
    landingPage.innerHTML = '';

    const title = document.createElement('h1');
    title.textContent = 'Mint Pad';
    title.className = 'page-title';
    landingPage.appendChild(title);

    // Back button
    const backButton = document.createElement('button');
    backButton.textContent = 'Back';
    backButton.className = 'styled-button back-button';
    backButton.addEventListener('click', () => {
        landingPageUI();
    });
    landingPage.appendChild(backButton);

    // Scrollable iframe container for collections
    const iframe = document.createElement('iframe');
    iframe.className = 'scrollable-iframe';
    iframe.style.width = '300px';
    iframe.style.height = '550px';
    iframe.style.border = '1px solid #000';
    iframe.style.overflow = 'auto';
    landingPage.appendChild(iframe);

    function fetchAndDisplayCollections() {
        fetch('/api/v1/rc001/collections')
            .then(response => response.json())
            .then(data => {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                doc.open();
                doc.write('<html><body style="background-color: black; color: white;"></body></html>');
                doc.close();
                const body = doc.body;

                if (data.status === "success") {
                    const collections = Object.entries(data.collections).map(([collectionName, collectionData]) => ({
                        collectionName,
                        collectionData
                    }));

                    collections.sort((a, b) => {
                        if (a.collectionData.percent_minted === 100) return 1;
                        if (b.collectionData.percent_minted === 100) return -1;
                        return b.collectionData.percent_minted - a.collectionData.percent_minted;
                    });

                    const createCollectionBox = ({ collectionName, collectionData }) => {
                        const collectionBox = doc.createElement('div');
                        collectionBox.className = 'collection-box';
                        collectionBox.style.border = '1px solid #ccc';
                        collectionBox.style.padding = '10px';
                        collectionBox.style.marginBottom = '10px';

                        const title = doc.createElement('h2');
                        title.textContent = collectionName;
                        collectionBox.appendChild(title);

                        fetch(`/api/v1/rc001/collection/${collectionName}`)
                            .then(response => response.json())
                            .then(data => {
                                if (data.status === "success" && data.collection.length > 0) {
                                    const randomIndex = Math.floor(Math.random() * data.collection.length);
                                    const randomInscription = data.collection[randomIndex];

                                    const iframeLabel = doc.createElement('p');
                                    iframeLabel.textContent = 'Random Inscription Preview:';
                                    iframeLabel.style.fontStyle = 'italic';
                                    collectionBox.appendChild(iframeLabel);

                                    const inscriptionIframe = doc.createElement('iframe');
                                    inscriptionIframe.src = `https://dogecdn.ordinalswallet.com/inscription/content/${randomInscription.inscription_id}`;
                                    inscriptionIframe.style.width = '200px';
                                    inscriptionIframe.style.height = '200px';
                                    inscriptionIframe.style.border = 'none';
                                    collectionBox.appendChild(inscriptionIframe);
                                }
                            })
                            .catch(error => {
                                console.error('Error fetching DM JSON data:', error);
                            });

                        const percentMinted = doc.createElement('p');
                        percentMinted.textContent = `Percent Minted: ${collectionData.percent_minted}%`;
                        collectionBox.appendChild(percentMinted);

                        const mintPriceInCoins = collectionData.mint_price / 100000000;
                        const mintPrice = doc.createElement('p');
                        mintPrice.textContent = `Mint Price: ${mintPriceInCoins} DOGE`;
                        collectionBox.appendChild(mintPrice);

                        if (collectionData.percent_minted < 100) {
                            const mintButton = doc.createElement('button');
                            mintButton.textContent = 'Mint';
                            mintButton.className = 'styled-button mint-button';
                            mintButton.addEventListener('click', () => {
                                fetch(`/api/v1/rc001/mint_hex/${collectionName}`)
                                    .then(response => response.json())
                                    .then(mintData => {
                                        if (mintData.status === "success") {
                                            const hexString = mintData.hex;
                                            writeToLocalStorage('pendingHexData', { mimeType: 'text/html', hexData: hexString });
                                            writeToLocalStorage('pendingCollectionDetails', { ...collectionData, collection_name: collectionName });
                                            mintPadScreen2UI();
                                        } else {
                                            alert('Error: ' + mintData.message);
                                        }
                                    })
                                    .catch(error => {
                                        console.error('Error fetching mint data:', error);
                                        alert('An error occurred while minting.');
                                    });
                            });
                            collectionBox.appendChild(mintButton);

                            const bulkMintButton = doc.createElement('button');
                            bulkMintButton.textContent = 'Bulk Mint';
                            bulkMintButton.className = 'styled-button bulk-mint-button';
                            bulkMintButton.addEventListener('click', () => {
                                writeToLocalStorage('pendingCollectionDetails', { ...collectionData, collection_name: collectionName });
                                mintPadBulkUI();
                            });
                            collectionBox.appendChild(bulkMintButton);
                        }

                        const infoButton = doc.createElement('button');
                        infoButton.textContent = 'Info';
                        infoButton.className = 'styled-button info-button';
                        infoButton.addEventListener('click', () => {
                            displayCollectionInfo(collectionName, collectionData);
                        });
                        collectionBox.appendChild(infoButton);

                        body.appendChild(collectionBox);
                    };

                    collections.forEach(createCollectionBox);
                } else {
                    const errorMsg = doc.createElement('div');
                    errorMsg.textContent = "Error: " + data.message;
                    body.appendChild(errorMsg);
                }
            })
            .catch(error => {
                console.error('Error fetching collections:', error);
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                doc.open();
                doc.write('<html><body style="background-color: black; color: white;"></body></html>');
                doc.close();
                const body = doc.body;
                const errorMsg = doc.createElement('div');
                errorMsg.textContent = "An error occurred while fetching collections.";
                body.appendChild(errorMsg);
            });
    }

    function displayCollectionInfo(collectionName, collectionData) {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write('<html><body style="background-color: black; color: white;"></body></html>');
        doc.close();
        const body = doc.body;

        const title = doc.createElement('h2');
        title.textContent = collectionName;
        body.appendChild(title);

        fetch(`/api/v1/rc001/collection/${collectionName}`)
            .then(response => response.json())
            .then(data => {
                if (data.status === "success") {
                    const uniqueAddresses = new Set(data.collection.map(item => item.inscription_address));
                    const uniqueAddressCount = uniqueAddresses.size;
                    const deployInscriptionId = `${collectionData.deploy_txid}i0`;

                    const additionalInfo = `
                        <p>Website: ${collectionData.website}</p>
                        <p>Deploy Address: ${collectionData.deploy_address}</p>
                        <p>Deploy Inscription ID: ${deployInscriptionId}</p>
                        <p>Parent Inscription ID: ${collectionData.parent_inscription_id}</p>
                        <p>Emblem Inscription ID: ${collectionData.emblem_inscription_id}</p>
                        <p>Max Supply: ${collectionData.max_supply}</p>
                        <p>Left to Mint: ${collectionData.left_to_mint}</p>
                        <p>Minted: ${collectionData.minted}</p>
                        <p>Mint Price: ${collectionData.mint_price}</p>
                        <p>Percent Minted: ${collectionData.percent_minted}%</p>
                        <p>Unique Inscription Addresses: ${uniqueAddressCount}</p>
                    `;
                    body.innerHTML += additionalInfo;

                    const displayJsonData = (jsonData, format) => {
                        const formattedData = jsonData.map(item => {
                            const itemName = `${collectionName} #${item.item_no}`;
                            if (format === 'ow') {
                                const snSegments = item.sn.match(/.{1,2}/g) || [];
                                const attributes = snSegments.map((segment, index) => ({
                                    trait_type: `sn index ${index}`,
                                    value: segment
                                }));

                                return {
                                    id: `${item.inscription_id}`,
                                    meta: {
                                        name: itemName,
                                        attributes: attributes
                                    }
                                };
                            } else if (format === 'dm') {
                                const snSegments = item.sn.match(/.{1,2}/g) || [];
                                const snObject = snSegments.reduce((acc, segment, index) => {
                                    acc[`sn_ndex_${index}`] = segment;
                                    return acc;
                                }, {});

                                return {
                                    inscriptionId: `${item.inscription_id}`,
                                    name: itemName,
                                    sn: snObject
                                };
                            }
                        });

                        const jsonContainer = doc.createElement('pre');
                        jsonContainer.style.color = 'white';
                        jsonContainer.textContent = JSON.stringify(formattedData, null, 2);
                        body.appendChild(jsonContainer);
                    };

                    const owJsonButton = doc.createElement('button');
                    owJsonButton.textContent = 'OW JSON';
                    owJsonButton.className = 'styled-button ow-json-button';
                    owJsonButton.addEventListener('click', () => {
                        fetch(`/api/v1/rc001/collection/${collectionName}`)
                            .then(response => response.json())
                            .then(data => {
                                if (data.status === "success") {
                                    displayJsonData(data.collection, 'ow');
                                } else {
                                    alert("Error: " + data.message);
                                }
                            })
                            .catch(error => {
                                console.error('Error fetching OW JSON data:', error);
                                alert('An error occurred while fetching OW JSON data.');
                            });
                    });
                    body.appendChild(owJsonButton);

                    const dmJsonButton = doc.createElement('button');
                    dmJsonButton.textContent = 'DM JSON';
                    dmJsonButton.className = 'styled-button dm-json-button';
                    dmJsonButton.addEventListener('click', () => {
                        fetch(`/api/v1/rc001/collection/${collectionName}`)
                            .then(response => response.json())
                            .then(data => {
                                if (data.status === "success") {
                                    displayJsonData(data.collection, 'dm');
                                } else {
                                    alert("Error: " + data.message);
                                }
                            })
                            .catch(error => {
                                console.error('Error fetching DM JSON data:', error);
                                alert('An error occurred while fetching DM JSON data.');
                            });
                    });
                    body.appendChild(dmJsonButton);

                    const backButton = doc.createElement('button');
                    backButton.textContent = 'Back';
                    backButton.className = 'styled-button back-button';
                    backButton.addEventListener('click', fetchAndDisplayCollections);
                    body.appendChild(backButton);
                } else {
                    alert("Error: " + data.message);
                }
            })
            .catch(error => {
                console.error('Error fetching collection data:', error);
                alert('An error occurred while fetching collection data.');
            });
    }

    fetchAndDisplayCollections();
}

function writeToLocalStorage(key, value) {
    console.log(`Write to localStorage [${key}]:`, value);
    localStorage.setItem(key, JSON.stringify(value));
} 