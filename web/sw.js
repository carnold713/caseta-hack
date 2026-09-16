/* Service worker: caches the app shell so the PWA opens instantly and offline.
   API and WebSocket traffic is never cached. Bump VERSION when shell files change. */
const VERSION = 'v14';
const SHELL = ['/', '/index.html', '/styles.css', '/light.css', '/manifest.webmanifest', '/vendor/gsap.min.js', '/js/core.js', '/js/pico.js', '/js/home.js', '/js/light.js', '/js/remotes.js', '/js/scenes.js', '/js/settings.js', '/js/cities.js', '/js/automations.js', '/js/adddevice.js', '/js/boot.js', '/js/slide.js', '/motion.css', '/js/motion.js', '/js/lightfield.js', '/vendor/three.module.js', '/vendor/three.core.js', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/') || url.pathname.startsWith('/.well-known/')) return;
  // Network first for the shell so deploys show up; cache is the offline fallback.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
  );
});
