const CACHE_NAME = 'painter-plus-v1';
const BASE_PATH = self.location.pathname.includes('/painter-plus-website/') ? '/painter-plus-website/' : '/';
const ASSETS = [
  `${BASE_PATH}`,
  `${BASE_PATH}index.html`,
  `${BASE_PATH}about.html`,
  `${BASE_PATH}services.html`,
  `${BASE_PATH}portfolio.html`,
  `${BASE_PATH}contact.html`,
  `${BASE_PATH}privacy.html`,
  `${BASE_PATH}terms.html`,
  `${BASE_PATH}css/style.css`,
  `${BASE_PATH}js/script.js`,
  `${BASE_PATH}manifest.json`
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
