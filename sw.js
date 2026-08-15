const CACHE_NAME = 'painter-plus-v4';
const BASE_PATH = self.location.pathname.replace(/\/[^/]*$/, '/');
const ASSETS = [
  `${BASE_PATH}`,
  `${BASE_PATH}index.html`,
  `${BASE_PATH}about.html`,
  `${BASE_PATH}services.html`,
  `${BASE_PATH}portfolio.html`,
  `${BASE_PATH}contact.html`,
  `${BASE_PATH}privacy.html`,
  `${BASE_PATH}terms.html`,
  `${BASE_PATH}offline.html`,
  `${BASE_PATH}color-studio.html`,
  `${BASE_PATH}css/style.css`,
  `${BASE_PATH}js/script.js`,
  `${BASE_PATH}js/color-studio.js`,
  `${BASE_PATH}manifest.json`,
  `${BASE_PATH}images/og-image.svg`,
  `${BASE_PATH}images/icon-192.png`,
  `${BASE_PATH}images/icon-512.png`
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // cache successful same-origin GET responses for offline use
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => caches.match(`${BASE_PATH}offline.html`));
    })
  );
});
