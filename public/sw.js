const CACHE = 'sonora-shell-v3';
const SHELL = ['/', '/manifest.webmanifest', '/pwa-192.png', '/pwa-512.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(async (response) => {
      if (response.ok) {
        const cacheCopy = response.clone();
        await caches.open(CACHE).then((cache) => cache.put('/', cacheCopy));
      }
      return response;
    }).catch(() => caches.match('/')));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then(async (response) => {
    if (response.ok) {
      const cacheCopy = response.clone();
      await caches.open(CACHE).then((cache) => cache.put(event.request, cacheCopy));
    }
    return response;
  })));
});
