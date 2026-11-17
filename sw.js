const CACHE_NAME = 'teyvat-index-v4';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './data/characters.json',
  './data/weapons.json',
  './data/domains.json',
  './data/tier-list.json',
  './data/abyss.json',
  './data/specialties.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        ASSETS.map(asset => {
          return fetch(new Request(asset, { cache: 'reload' })).then(response => {
            if (response && response.ok) {
              return cache.put(asset, response);
            }
          }).catch(() => {});
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML, JS, CSS, and ./data/*.json so updates never serve stale files,
  // falling back to cache only when offline or the network request fails.
  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.ok && response.type === 'basic') {
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        }).catch(() => {});
      }
      return response;
    }).catch(() => {
      return caches.match(event.request).then(cached => {
        return cached || Response.error();
      });
    })
  );
});
