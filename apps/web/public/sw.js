// CED-GYM Service Worker
// v4: agrega auto-update sin reinstalar la PWA.
//   - Escucha mensaje SKIP_WAITING del cliente para tomar control
//     inmediato cuando hay un SW nuevo esperando
//   - El cliente (PWAUpdater) escucha controllerchange y recarga la
//     app cuando el SW nuevo toma control → cero reinstalaciones
const CACHE = 'cedgym-v4';
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

// Cliente puede pedirle al SW pendiente que se active inmediatamente
// (postMessage({type:'SKIP_WAITING'})). Lo usa PWAUpdater para que un
// deploy nuevo no espere a que el usuario cierre todas las tabs.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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

  // Page navigations (HTML): NETWORK-FIRST. Pedimos red SIEMPRE y
  // caemos al cache solo si la red falla, así un deploy nuevo se ve
  // a la primera recarga sin importar qué tan agresivo sea el
  // bumpeo de CACHE.
  if (request.mode === 'navigate') {
    // /start es el redirector dinámico de la PWA — siempre hace
    // 307 al landing del role. Nunca lo cacheamos: un redirect
    // cacheado puede provocar loops si el role cambia (logout/login
    // como otra cuenta) o si el browser interpreta el cache raro.
    const isStart = url.pathname === '/start' || url.pathname === '/start/';
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (!isStart) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
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
