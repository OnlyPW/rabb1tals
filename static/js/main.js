import { coins } from './networks.js';
import { walletSettingsUI } from './walletSettings.js';
import { receiveUI } from './receive.js'; // Import the receiveUI function
import { sendTXUI } from './sendTX.js';
import { mintUI } from './mint.js';
import { userSettingsUI } from './userSettings.js';
import { displayTransactionHistory } from './getHistory.js';
import { addWalletUI } from './addWallet.js';  // Add this import

// Initialize wallets variable
let wallets = [];
let pricesData = {}; // Add this line to make pricesData global
let selectedCoin = null; // Global variable to store the selected coin
// Make priceView and wildricePrice global
let priceView = 'pounds_of_wildrice';
let wildricePrice = 20.00;

export function initializeWallet() {
  // Refresh wallets data from localStorage each time initializeWallet is called
  wallets = JSON.parse(localStorage.getItem('wallets')) || [];
  
  const landingPage = document.getElementById('landing-page');
  landingPage.innerHTML = ''; // Clear existing content

  // Retrieve saved settings from local storage
  const savedSettings = JSON.parse(localStorage.getItem('coinSettings')) || {};
  priceView = savedSettings['priceView'] || 'pounds_of_wildrice';
  wildricePrice = parseFloat(savedSettings['wildricePrice']) || 20.00;

  // Fetch prices from the /prices/prices route
  fetch('/prices/prices')
    .then(response => response.json())
    .then(data => {
      pricesData = data; // Assign fetched prices to global variable
      // Then, read selected wallets after wallets are loaded
      const savedSelectedWallets = JSON.parse(localStorage.getItem('selectedWallets')) || {};

      // Filter coins based on saved settings
      const activeCoins = coins.filter(coin => savedSettings[coin.ticker] !== false);

      // Create the frame for the wallet UI
      const frame = document.createElement('div');
      frame.className = 'frame';
      frame.style.border = 'none'; // Ensure no border is applied to the frame
      landingPage.appendChild(frame);

      // Create the swiper container
      const swiperContainer = document.createElement('div');
      swiperContainer.className = 'swiper';
      frame.appendChild(swiperContainer);

      // Create the swiper wrapper
      const swiperWrapper = document.createElement('div');
      swiperWrapper.className = 'swiper-wrapper';
      swiperContainer.appendChild(swiperWrapper);

      // Create a slide for each active coin
      activeCoins.forEach((coin, index) => {
        const slide = document.createElement('div');
        slide.className = 'swiper-slide';
        slide.style.backgroundColor = coin.color; // Set the background color
        swiperWrapper.appendChild(slide);

        // Header with settings button and male silhouette
        const header = document.createElement('div');
        header.className = 'header';

        // Blockchainplugz.com button (centered in header)
        const plugzBtn = document.createElement('a');
        plugzBtn.href = 'https://blockchainplugz.com/';
        plugzBtn.target = '_blank';
        plugzBtn.textContent = 'Blockchainplugz.com';
        plugzBtn.className = 'plugz-link-btn';
        // Use flex: 1 to center in header
        plugzBtn.style.flex = '1';
        plugzBtn.style.textAlign = 'center';

        const maleIcon = document.createElement('button');  // Changed from img to button
        maleIcon.className = 'back-button';  // Use the same class as back button
        maleIcon.innerHTML = '<img src="/static/images/male-silhouette.png" alt="Male Silhouette" />';
        
        // Check if there are any wallets for this coin
        const hasWallets = wallets.some(wallet => wallet.ticker === coin.ticker);
        
        if (!hasWallets) {
            maleIcon.disabled = true;
        } else {
            maleIcon.addEventListener('click', () => {
                const selectedWallet = wallets.find(wallet => 
                    wallet.ticker === coin.ticker && 
                    wallet.label === walletSelector.value
                );
                landingPage.innerHTML = '';
                userSettingsUI(selectedWallet);
            });
        }

        const settingsButton = document.createElement('button');
        settingsButton.className = 'settings-button';
        settingsButton.innerHTML = '<img src="/static/images/settings-icon.png" alt="Settings Icon" />';
        settingsButton.style.backgroundColor = 'transparent';
        settingsButton.style.border = 'none';
        settingsButton.addEventListener('click', () => {
            // Get the currently selected wallet
            const selectedWallet = wallets.find(wallet => 
                wallet.ticker === coin.ticker && 
                wallet.label === walletSelector.value
            );
            
            landingPage.innerHTML = '';
            walletSettingsUI(coin, selectedWallet); // Pass both coin and selected wallet
        });

        header.appendChild(maleIcon);
        header.appendChild(plugzBtn);
        header.appendChild(settingsButton);
        slide.appendChild(header);

        // Coin icon
        const coinIcon = document.createElement('img');
        coinIcon.src = `/static/images/${coin.name}icon.png`; // Path to the coin icon
        coinIcon.alt = `${coin.name} Icon`;
        coinIcon.className = 'coin-icon';
        slide.appendChild(coinIcon);

        // --- Swipe Signifiers ---
        // Left arrow
        const leftArrow = document.createElement('div');
        leftArrow.className = 'swipe-arrow swipe-arrow-left';
        leftArrow.innerHTML = '&#8592;'; // Unicode left arrow
        slide.appendChild(leftArrow);
        // Right arrow
        const rightArrow = document.createElement('div');
        rightArrow.className = 'swipe-arrow swipe-arrow-right';
        rightArrow.innerHTML = '&#8594;'; // Unicode right arrow
        slide.appendChild(rightArrow);
        // Swipe hint (only on first load)
        if (index === 0) {
          const swipeHint = document.createElement('div');
          swipeHint.className = 'swipe-hint';
          swipeHint.textContent = 'Swipe left or right to switch coins. Add to home screen for app-like experience.';
          slide.appendChild(swipeHint);
          setTimeout(() => {
            swipeHint.style.opacity = '0';
            setTimeout(() => swipeHint.remove(), 500);
          }, 2500);
        }

        // Wallet selector dropdown
        const walletSelector = document.createElement('select');
        walletSelector.className = 'wallet-selector';
        const walletList = wallets.filter(wallet => wallet.ticker === coin.ticker && wallet.label);
        
        if (walletList.length === 0) {
            // If no wallets exist, show "Add a wallet" option
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No wallet';
            walletSelector.appendChild(option);
            
            // Make the selector clickable to add a wallet
            walletSelector.addEventListener('click', () => {
                landingPage.innerHTML = '';
                addWalletUI(coin);
            });
        } else {
            // Add existing wallets to selector
            walletList.forEach(wallet => {
                const option = document.createElement('option');
                option.value = wallet.label;
                option.textContent = wallet.label;
                walletSelector.appendChild(option);
            });
        }
        slide.appendChild(walletSelector);

        // Balance and price display container
        const balanceContainer = document.createElement('div');
        balanceContainer.className = 'balance-container';
        slide.appendChild(balanceContainer);

        // Balance display
        const balance = document.createElement('div');
        balance.className = 'balance styled-text';
        balanceContainer.appendChild(balance);

        // Price display
        const priceDisplay = document.createElement('div');
        priceDisplay.className = 'price-display';
        balanceContainer.appendChild(priceDisplay);

        // Buttons
        const buttons = document.createElement('div');
        buttons.className = 'buttons';

        const buttonConfigs = [
            { text: 'Send', onClick: () => {
                const selectedWallet = wallets.find(wallet => 
                    wallet.ticker === coin.ticker && 
                    wallet.label === walletSelector.value
                );
                if (selectedWallet) {
                    landingPage.innerHTML = '';
                    sendTXUI(selectedWallet);
                }
            }},
            { text: 'Receive', onClick: () => {
                const selectedWallet = wallets.find(wallet => 
                    wallet.ticker === coin.ticker && 
                    wallet.label === walletSelector.value
                );
                if (selectedWallet) {
                    landingPage.innerHTML = '';
                    receiveUI(selectedWallet);
                }
            }},
            { text: 'Mint', onClick: () => {
                const selectedWallet = wallets.find(wallet => 
                    wallet.ticker === coin.ticker && 
                    wallet.label === walletSelector.value
                );
                if (selectedWallet) {
                    landingPage.innerHTML = '';
                    mintUI(selectedWallet);
                }
            }}
        ];

        buttonConfigs.forEach(config => {
            const button = document.createElement('div');
            button.className = 'button';
            button.textContent = config.text;
            button.addEventListener('click', config.onClick);
            buttons.appendChild(button);
        });

        slide.appendChild(buttons); // Append buttons before transaction history

        // Transaction history
        const transactionHistory = document.createElement('div');
        transactionHistory.className = 'transaction-history';
        slide.appendChild(transactionHistory);

        // Update balance display based on selected wallet
        const updateWalletInfo = () => {
          const selectedWallet = wallets.find(wallet => wallet.label === walletSelector.value && wallet.ticker === coin.ticker);
          if (selectedWallet) {
            balance.textContent = `${selectedWallet.balance} ${coin.name}`;
            balance.style.cursor = 'default';
            balance.onclick = null;

            // Calculate and display the price
            if (priceView !== 'none') {
              const coinPrice = pricesData[coin.ticker]?.aggregated;
              if (coinPrice) {
                const usdValue = selectedWallet.balance * parseFloat(coinPrice);
                let displayValue;
                if (priceView === 'usd') {
                  displayValue = `USD: $${usdValue.toFixed(2)}`;
                } else if (priceView === 'pounds_of_wildrice') {
                  const wildriceValue = usdValue / wildricePrice;
                  displayValue = `Wildrice: ${wildriceValue.toFixed(2)} lbs`;
                }
                priceDisplay.textContent = displayValue;
              } else {
                priceDisplay.textContent = 'Price not available';
              }
            } else {
              priceDisplay.textContent = '';
            }
          } else {
            balance.textContent = `Add ${coin.ticker} wallet`;
            balance.style.cursor = 'pointer';
            balance.onclick = () => {
              landingPage.innerHTML = '';
              addWalletUI(coin);
            };
            priceDisplay.textContent = '';
          }
        };

        // Only call updateWalletInfo on change event
        walletSelector.addEventListener('change', () => {
          updateWalletData(coin.ticker, walletSelector.value, balance);
          updateWalletInfo();

          // Save the selected wallet to local storage
          savedSelectedWallets[coin.ticker] = walletSelector.value;
          localStorage.setItem('selectedWallets', JSON.stringify(savedSelectedWallets));
        });

        updateWalletInfo(); // Initialize balance display
      });

      // Initialize Swiper
      const swiper = new Swiper('.swiper', {
        direction: 'horizontal',
        loop: true,
        pagination: {
          el: '.swiper-pagination',
        },
        navigation: {
          nextEl: '.swiper-button-next',
          prevEl: '.swiper-button-prev',
        },
        slidesPerView: 1,
        slidesPerGroup: 1,
        initialSlide: selectedCoin ? activeCoins.findIndex(c => c.name === selectedCoin.name) : 0,
        on: {
          slideChange: function () {
            const activeIndex = this.realIndex;
            document.body.style.backgroundColor = activeCoins[activeIndex].color;
            selectedCoin = activeCoins[activeIndex];

            setTimeout(() => {
              const activeSlide = document.querySelector('.swiper-slide-active');
              const walletSelector = activeSlide.querySelector('.wallet-selector');
              const balanceElement = activeSlide.querySelector('.balance');

              if (walletSelector && balanceElement) {
                const selectedWallet = wallets.find(wallet => 
                  wallet.ticker === selectedCoin.ticker && 
                  wallet.label === walletSelector.value
                );

                if (!selectedWallet) {
                  balanceElement.textContent = `Add ${selectedCoin.ticker} wallet`;
                  balanceElement.style.cursor = 'pointer';
                  balanceElement.onclick = () => {
                    landingPage.innerHTML = '';
                    addWalletUI(selectedCoin);
                  };
                  return;
                }

                balanceElement.textContent = 'Loading...';
                balanceElement.style.cursor = 'default';
                balanceElement.onclick = null;

                updateWalletData(selectedCoin.ticker, selectedWallet.label, balanceElement);
              }
            }, 100);
          }
        }
      });

      // Enable clicking arrows to move pages
      setTimeout(() => {
        document.querySelectorAll('.swipe-arrow-left').forEach(arrow => {
          arrow.style.pointerEvents = 'auto';
          arrow.style.cursor = 'pointer';
          arrow.onclick = (e) => {
            e.stopPropagation();
            swiper.slidePrev();
          };
        });
        document.querySelectorAll('.swipe-arrow-right').forEach(arrow => {
          arrow.style.pointerEvents = 'auto';
          arrow.style.cursor = 'pointer';
          arrow.onclick = (e) => {
            e.stopPropagation();
            swiper.slideNext();
          };
        });
      }, 0);

      // Set initial background color
      document.body.style.backgroundColor = selectedCoin ? selectedCoin.color : activeCoins[0].color;

      // Update initial wallet data for the first coin and wallet
      const initialWalletSelector = document.querySelector('.swiper-slide-active .wallet-selector');
      const initialBalanceElement = document.querySelector('.swiper-slide-active .balance');
      
      if (initialWalletSelector && initialBalanceElement) {
        initialWalletSelector.selectedIndex = 0; // Select the first wallet initially
        initialBalanceElement.textContent = 'Loading...'; // Clear initial balance display
        updateWalletData(activeCoins[0].ticker, initialWalletSelector.value, initialBalanceElement);
      }
    })
    .catch(error => {
      console.error('Error fetching prices:', error);
    });
}

function updateWalletData(ticker, walletLabel, balanceElement) {
    const selectedWallet = wallets.find(wallet => wallet.label === walletLabel && wallet.ticker === ticker);
    if (!selectedWallet) return;

    fetch(`/api/listunspent/${ticker}/${selectedWallet.address}`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // Calculate total balance and incoming (unconfirmed) amount
                let totalBalance = 0;
                let incomingBalance = 0;

                // Update UTXOs with the correct structure
                selectedWallet.utxos = data.data.txs.map(tx => ({
                    txid: tx.txid,
                    value: parseFloat(tx.value),
                    confirmations: tx.confirmations,
                    vout: tx.vout,
                    script_hex: tx.script_hex
                }));

                // Calculate balances, ignoring UTXOs of 0.01 or less
                selectedWallet.utxos.forEach(utxo => {
                    if (utxo.value > 0.01) { // Only count UTXOs greater than 0.01
                        if (utxo.confirmations === 0) {
                            incomingBalance += utxo.value;
                        }
                        totalBalance += utxo.value;
                    }
                });

                // Update wallet properties
                selectedWallet.balance = totalBalance;
                selectedWallet.incoming = incomingBalance;
                
                // Remove the duplicate unspent_transactions field
                delete selectedWallet.unspent_transactions;
                delete selectedWallet.transactions;

                // Save updated wallet to local storage
                localStorage.setItem('wallets', JSON.stringify(wallets));

                // Update UI
                setTimeout(() => {
                    balanceElement.textContent = `${totalBalance.toFixed(8)} ${ticker}`;
                    
                    // Find the transaction history container in the same slide
                    const slide = balanceElement.closest('.swiper-slide');
                    if (slide) {
                        const transactionHistory = slide.querySelector('.transaction-history');
                        if (transactionHistory) {
                            transactionHistory.innerHTML = '<div class="transaction">Loading transactions...</div>';
                            fetchAndDisplayTransactions(ticker, selectedWallet.address, transactionHistory);
                        }
                    }

                    // Refresh price display
                    const priceDisplay = slide.querySelector('.price-display');
                    if (priceDisplay) {
                        const coinPrice = pricesData[ticker]?.aggregated;
                        if (coinPrice) {
                            const usdValue = totalBalance * parseFloat(coinPrice);
                            let displayValue;
                            if (priceView === 'usd') {
                                displayValue = `USD: $${usdValue.toFixed(2)}`;
                            } else if (priceView === 'pounds_of_wildrice') {
                                const wildriceValue = usdValue / wildricePrice;
                                displayValue = `Wildrice: ${wildriceValue.toFixed(2)} lbs`;
                            }
                            priceDisplay.textContent = displayValue;
                        } else {
                            priceDisplay.textContent = 'Price not available';
                        }
                    }
                }, 500);
            } else {
                console.error('Failed to fetch unspent transactions:', data.message);
                balanceElement.textContent = 'Error loading balance';
            }
        })
        .catch(error => {
            console.error('Error fetching unspent transactions:', error);
            balanceElement.textContent = 'Error loading balance';
        });
}

function fetchAndDisplayTransactions(ticker, address, transactionHistoryContainer) {
    displayTransactionHistory(ticker, address, transactionHistoryContainer);
}

document.addEventListener('DOMContentLoaded', () => {
  initializeWallet();

  let deferredPrompt;
  const installPrompt = document.getElementById('install-prompt');
  const installMessage = document.getElementById('install-message');

  // Listen for the beforeinstallprompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('beforeinstallprompt event fired');

    // Show the install prompt
    installPrompt.style.display = 'block';
  });

  // Check if the app is in standalone mode
  const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  
  if (!isInStandaloneMode) {
    console.log('App is not in standalone mode');
    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    // Detect Android
    const isAndroid = /Android/.test(navigator.userAgent);
    
    if (isIOS) {
      console.log('iOS device detected');
      installMessage.innerHTML = 'To install this app on your iPhone: tap the share button <img src="/static/images/ios-share.png" style="height: 20px; vertical-align: middle;"> and then "Add to Home Screen"';
      installPrompt.style.display = 'block';
    } else if (isAndroid) {
      console.log('Android device detected');
      installMessage.innerHTML = 'To install this app on your Android device: tap the menu button <img src="/static/images/three-dots.png" style="height: 20px; vertical-align: middle;"> and select "Add to Home Screen"';
      installPrompt.style.display = 'block';
    }
  } else {
    console.log('App is in standalone mode');
  }
});

function closeInstallPrompt() {
  document.getElementById('install-prompt').style.display = 'none';
}

const overlay = document.getElementById('global-loading-overlay-receive');
if (overlay) overlay.style.display = 'none'; 