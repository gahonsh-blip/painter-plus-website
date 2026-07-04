const CACHE_NAME = 'painter-v1';
const urlsToCache = [
    '/painter-plus-website/', '/painter-plus-website/index.html', '/painter-plus-website/about.html', '/painter-plus-website/services.html', '/painter-plus-website/portfolio.html',
    '/painter-plus-website/contact.html', '/painter-plus-website/privacy.html', '/painter-plus-website/terms.html',
    '/painter-plus-website/css/style.css', '/painter-plus-website/js/script.js', '/painter-plus-website/offline.html'
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/painter-plus-website/offline.html')))));
