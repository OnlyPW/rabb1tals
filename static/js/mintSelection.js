import { mintFileUI } from './mintFile.js';
import { mintTextUI } from './mintText.js';

export function mintSelectionUI(selectedWallet) {
  const landingPage = document.getElementById('landing-page');
  landingPage.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = 'Choose a mint selection';
  landingPage.appendChild(title);

  const container = document.createElement('div');
  container.className = 'stacked-buttons';

  // Feature flags stored in localStorage to hide options
  const hideFileOption = localStorage.getItem('hideFileOption') === 'true';
  const hideTextOption = localStorage.getItem('hideTextOption') === 'true';

  const options = [
    { label: 'Mint File', onClick: () => mintFileUI(selectedWallet), hidden: hideFileOption },
    { label: 'Mint Text', onClick: () => mintTextUI(selectedWallet), hidden: hideTextOption },
  ];

  options.forEach(opt => {
    if (opt.hidden) return;
    const btn = document.createElement('button');
    btn.className = 'styled-button input-margin';
    btn.textContent = opt.label;
    btn.addEventListener('click', opt.onClick);
    container.appendChild(btn);
  });

  landingPage.appendChild(container);
}