// Офлайн-кэш общий для всех расписаний. Меняй VERSION, чтобы сбросить кэш у всех.
const VERSION = 'v13';
const CACHE = 'schedule-' + VERSION;
// Страницы людей (/nurali/, /nurbek/…) кэшируются при первом открытии.
const ASSETS = ['./', './styles.css', './app.js', './stats.js', './map.js', './map/floors.json',
                './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png']
  .map(p => new URL(p, self.registration.scope).pathname);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// network-first: свежее расписание, офлайн — из кэша
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match(ASSETS[0])))
  );
});
