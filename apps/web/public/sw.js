// CED-GYM Service Worker
// v3: navigations cambian de stale-while-revalidate a network-first.
// Antes el SW siempre servía el HTML cacheado y solo actualizaba en
// background → tras un deploy nuevo, el socio veía el bundle viejo y
// había que recargar 2-3 veces para que apareciera el cambio (banner
// "Mejoramos tu perfil", etc.). Con network-first la primera recarga
// ya trae el HTML/JS nuevo y el cache solo sirve si hay 0 conexión.
const CACHE = 'cedgym-v3';
const OFFLINE_URLS = ['/offline', '/portal/qr'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin requests must not go through the SW. Wrapping a
  // <script src="https://js.stripe.com/..."> load in event.respondWith(fetch())
  // turns it into a connect-src request, which our CSP doesn't grant to
  // Stripe (only script-src does) — Stripe.js then fails to load and the
  // Payment Element never bootstraps.
  if (url.origin !== self.location.origin) return;

  // API calls: network-first with cache fallback only for qr-token
  if (url.pathname.startsWith('/checkins/me/qr-token') || url.pathname.includes('/qr-token')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Page navigations (HTML): NETWORK-FIRST. Cambio crítico vs v2 — la
  // versión vieja era stale-while-revalidate, lo que hacía que el
  // socio viera el HTML/JS de hace 2 deploys hasta recargar 2-3 veces.
  // Ahora pedimos red SIEMPRE y caemos al cache solo si la red falla,
  // así un deploy nuevo se ve a la primera recarga sin importar qué
  // tan agresivo sea el bumpeo de CACHE.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('/offline')))
    );
    return;
  }

  // Static assets: cache-first (los nombres de chunk de Next ya
  // incluyen hash, así que un bundle nuevo cambia de URL y no toca
  // las entradas viejas — éstas las limpia el activate al bumpear
  // CACHE).
  if (/\.(js|css|png|jpg|jpeg|svg|webp|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (c) =>
          c ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cc) => cc.put(request, copy)).catch(() => {});
            return res;
          })
      )
    );
  }
});
