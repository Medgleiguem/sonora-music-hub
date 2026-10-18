const CACHE = 'sonora-shell-v5';
const SHELL = ['/', '/manifest.webmanifest', '/pwa-192.png', '/pwa-512.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    const html = await (await cache.match('/')).text();
    // Initial page scripts may load before the service worker controls the tab.
    // Precache the build's hashed JS/CSS so the first offline reopen also works.
    const assets = [...new Set([...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map((match) => new URL(match[1].replace(/&amp;/g, '&'), self.location.origin)).filter((url) => url.origin === self.location.origin).map((url) => url.href))];
    await cache.addAll(assets);
  })());
  // Wait for existing tabs to close: replacing their JS cache mid-playback can break them.
});
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('sonora-shell-') && key !== CACHE).map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // The installer and APKs must never replace '/' in the offline music shell.
  if (url.pathname === '/android' || url.pathname.startsWith('/downloads/')) return;
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.searchParams.has('_rsc') || request.headers.has('RSC')) return;
  const save = (key, response) => {
    if (response.ok) event.waitUntil(caches.open(CACHE).then((cache) => cache.put(key, response.clone())).catch(() => {}));
    return response;
  };
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const network = fetch(request).then((response) => save('/', response));
      const cached = await caches.open(CACHE).then((cache) => cache.match('/'));
      if (!cached) return network.catch(() => new Response('Sonora is offline. Connect once to load your music app.', { status: 503, headers: { 'Content-Type': 'text/plain' } }));
      // Slow connections should not keep an installed music player on a blank screen.
      return Promise.race([network.then((response) => response.ok ? response : cached).catch(() => cached), new Promise((resolve) => setTimeout(() => resolve(cached), 3500))]);
    })());
    return;
  }
  // Cache only app assets, never arbitrary audio blobs or development responses.
  if (!['script', 'style', 'image', 'font', 'manifest'].includes(request.destination) || url.pathname.includes('/_next/webpack-hmr')) return;
  event.respondWith(caches.open(CACHE).then((cache) => cache.match(request)).then((cached) => cached || fetch(request).then((response) => save(request, response))));
});
