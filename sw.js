const CACHE_NAME = 'painter-plus-v25';
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
  `${BASE_PATH}team.html`,
  `${BASE_PATH}gallery.html`,
  `${BASE_PATH}painter-profile.html`,
  `${BASE_PATH}admin.html`,
  `${BASE_PATH}worklog.html`,
  `${BASE_PATH}erp.html`,
  `${BASE_PATH}css/style.css`,
  `${BASE_PATH}js/script.js`,
  `${BASE_PATH}js/color-studio.js`,
  `${BASE_PATH}js/team.js`,
  `${BASE_PATH}js/measure.js`,
  `${BASE_PATH}js/photo-studio.js`,
  `${BASE_PATH}js/team-page.js`,
  `${BASE_PATH}js/profile-page.js`,
  `${BASE_PATH}js/gallery.js`,
  `${BASE_PATH}js/gallery-page.js`,
  `${BASE_PATH}js/worklog.js`,
  `${BASE_PATH}js/erp.js`,
  `${BASE_PATH}js/erp-page.js`,
  `${BASE_PATH}manifest.json`,
  `${BASE_PATH}images/icon-192.png`,
  `${BASE_PATH}images/icon-512.png`,
  `${BASE_PATH}images/icon-maskable-512.png`
];

// Precache each asset independently. `cache.addAll()` is all-or-nothing: one
// missing file (a decorative social image, a renamed asset) rejects the whole
// install, so the service worker never activates and the site loses offline
// support entirely. Caching one at a time means a single bad URL is skipped
// instead of taking the whole install down.
function precache(cache) {
  return Promise.all(ASSETS.map((url) =>
    cache.add(url).catch(() => null)
  ));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(precache).then(() => self.skipWaiting())
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
