<<<<<<< HEAD
﻿const CACHE_NAME = 'painter-v1';
const urlsToCache = [
    '/painter-plus-website/', '/painter-plus-website/index.html', '/painter-plus-website/about.html', '/painter-plus-website/services.html', '/painter-plus-website/portfolio.html',
    '/painter-plus-website/contact.html', '/painter-plus-website/privacy.html', '/painter-plus-website/terms.html',
    '/painter-plus-website/css/style.css', '/painter-plus-website/js/script.js', '/painter-plus-website/offline.html'
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/painter-plus-website/offline.html')))));
=======
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
>>>>>>> 6e6b646c42f798484e7208b221540adad4ec9f46
