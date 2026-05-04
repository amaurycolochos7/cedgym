// CED-GYM Service Worker
// Cache name bumped to v2 in the Stripe migration so old clients drop
// the v1 cache (which held HTML responses with the old MercadoPago CSP
// header, breaking Stripe.js after the CSP was rotated).
const CACHE = 'cedgym-v2';
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

  // Same-origin page navigations: stale-while-revalidate
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const net = fetch(request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
            return res;
          })
          .catch(() => cached || caches.match('/offline'));
        return cached || net;
      })
    );
    return;
  }

  // Static assets: cache-first
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
