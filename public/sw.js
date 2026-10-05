/**
 * TourGuyed service worker
 *  - App shell (HTML, CSS, JS, icons): opens instantly, works offline for viewing.
 *  - /api/* (bookings, chat, payments, uploads, video calls): NEVER cached — always live.
 * Bump CACHE_VERSION on deploys that change the shell.
 */
const CACHE_VERSION = 'tourguyed-v2';
const SHELL = ['/', '/app.html', '/css/style.css', '/js/app.js', '/site.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;           // other sites (PayMongo, fonts, photos) untouched
  if (url.pathname.startsWith('/api/')) return;                                 // live data: straight to network
  if (req.mode === 'navigate') {                                                // pages: network first, offline fallback
    e.respondWith(fetch(req).then(res => {
      if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) { const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match(url.pathname.startsWith('/app') ? '/app.html' : '/'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {                                  // assets: cache first, refresh in background
    const net = fetch(req).then(res => { if (res && res.status === 200 && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
