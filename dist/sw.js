const CACHE_NAME = 'vendafacil-pwa-v24-help-modal';
const ASSETS = [
  '/loja.html',
  '/assets/storefront.v14-stable.css',
  '/assets/visual-refresh.v1.css',
  '/assets/styles/store-modals.css',
  '/assets/styles/mobile-responsive.css',
  '/assets/styles/theme-contrast.css',
  '/assets/styles/contrast-audit.css',
  '/assets/theme-controls.js',
  '/assets/storefront.v14-stable.js',
  '/manifest.webmanifest',
  '/assets/pwa-icon-192.png',
  '/assets/pwa-icon-512.png',
  '/assets/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        // Clone imediatamente, antes que o navegador consuma o corpo da resposta.
        // O clone tardio causava "Response body is already used" ao recarregar a página.
        if (response.ok && (url.pathname === '/loja' || url.pathname === '/loja.html')) {
          const responseForCache = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put('/loja.html', responseForCache)).catch(() => {}));
        }
        return response;
      }).catch(() => caches.match('/loja.html'))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(request).then(response => {
        // Preserve a cópia do cache antes de devolver a resposta original ao navegador.
        if (response.ok) {
          const responseForCache = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, responseForCache)).catch(() => {}));
        }
        return response;
      }).catch(() => caches.match(request))
    );
  }
});
