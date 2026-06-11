// Service Worker · Conecta WCP
// Estrategia network-first para el shell (siempre fresco online, funciona offline desde caché).
const CACHE = 'conecta-wcp-v1';
const SHELL = [
  '/', '/css/styles.css', '/manifest.json', '/icon.svg',
  '/js/config.js', '/js/api.js', '/js/data.js', '/js/store.js',
  '/js/predictor.js', '/js/calendar.js', '/js/mis.js', '/js/main.js', '/js/auth.js',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // Solo GET del mismo origen (la API vive en otro dominio → se ignora).
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy).catch(() => {}));
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('/')))
  );
});
