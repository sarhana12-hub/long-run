const CACHE = 'peak-v2';
const SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

// GitHub Pages serves everything with Cache-Control: max-age=600, which we
// can't override (static host, no server config). `cache: 'no-store'` makes
// every fetch here bypass that entirely, so installs and revalidation never
// silently reuse a browser-cached response that's up to 10 minutes stale.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(SHELL.map((url) =>
        fetch(url, { cache: 'no-store' }).then((res) => c.put(url, res))
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first: while online, always prefer the live version (this app changes
// often); fall back to the last cached copy only when the network fails.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
