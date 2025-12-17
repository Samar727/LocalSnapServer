// Minimal service worker for PWA installability
const CACHE_NAME = 'localsnap-v1';

self.addEventListener('install', (event) => {
    console.log('Service worker installed');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service worker activated');
    event.waitUntil(self.clients.claim());
});

// Optional: basic offline support
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
