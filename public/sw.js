/* Before Ruin — service worker
   Reading happens in pews, easy chairs and kitchens with one bar of signal.
   This keeps the pages readable when the signal is not. */

const VERSION = 'br-2026-09-18-01';
const SHELL   = `shell-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;

/* Cached on install, so a first-time visitor who installs the app
   already has the whole reading set offline. */
const PRECACHE = [
  '/',
  '/index.html',
  '/sources.html',
  '/texts.html',
  '/method.html',
  '/her.html',
  '/how-to-search.html',
  '/terms.html',
  '/BR-002-001.html',
  '/BR-001-001.html',
  '/print.css',
  '/br_hands.jpg',
  '/404.html',
  '/site.webmanifest',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/favicon-192x192.png',
  '/favicon-512x512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      // addAll fails the whole install if one file 404s; add them one by one
      // so a single missing asset never costs the user offline reading.
      .then(cache => Promise.all(
        PRECACHE.map(url =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== RUNTIME)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Google Fonts: cache-first and keep them. They never change,
     and without them the pages fall back to Georgia — which is fine,
     but the real faces are better and they are small. */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(RUNTIME).then(c => c.put(req, copy));
        return res;
      }).catch(() => hit))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  /* Pages: network first, so a reader always gets the current version
     when there is signal — corrections matter more than speed here.
     Falls back to the cached copy, then to the offline notice. */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(RUNTIME).then(c => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req)
            .then(hit => hit || caches.match('/offline.html'))
            .then(hit => hit || caches.match('/index.html'))
        )
    );
    return;
  }

  /* Everything else — css, images, icons: cache first, refresh quietly behind. */
  event.respondWith(
    caches.match(req).then(hit => {
      const live = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(RUNTIME).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || live;
    })
  );
});
