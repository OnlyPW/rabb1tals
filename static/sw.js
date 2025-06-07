const CACHE_NAME = 'plugz-wallet-v1';
const ASSETS_TO_CACHE = [
  '/wallet',
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/addWallet.js',
  '/static/js/walletSettings.js',
  '/static/js/settings.js',
  '/static/js/sendTX.js',
  '/static/js/receive.js',
  '/static/js/mint.js',
  '/static/js/mintFile.js',
  '/static/js/inscriber.js',
  '/static/js/myInscriptions.js',
  '/static/js/userSettings.js',
  '/static/js/networks.js',
  '/static/images/back.png',
  '/static/images/settings-icon.png',
  '/static/images/male-silhouette.png',
  'https://unpkg.com/swiper/swiper-bundle.min.css',
  'https://unpkg.com/swiper/swiper-bundle.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js',
  '/static/manifest.json',
  '/static/images/icon-192x192.png',
  '/static/images/icon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache opened');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch((error) => {
        console.error('Cache failed:', error);
      })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            return response;
          });
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
}); 