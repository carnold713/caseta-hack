/* Service worker: caches the app shell so the PWA opens instantly and offline.
   API and WebSocket traffic is never cached. Bump VERSION when shell files change.

   Two shells since the cutover: the Copper Night app at / (web/index.html, web/ui/, web/data/) and the previous
   design kept at /classic/ (web/classic/index.html and web/js/). An offline navigation lands on whichever it asked
   for. Network first throughout, so a deploy shows up on the next open. */
const VERSION = 'v34';
const APP = [
  '/', '/index.html', '/ui/', '/ui/index.html', '/ui/app.js', '/ui/art.js', '/ui/art/light-arc-lamp.svg',
  '/ui/art/light-bedside-lamp.svg', '/ui/art/light-ceiling-fan.svg', '/ui/art/light-chandelier.svg',
  '/ui/art/light-desk-lamp.svg', '/ui/art/light-downlight.svg', '/ui/art/light-floor-lamp.svg',
  '/ui/art/light-pendant.svg', '/ui/art/light-porch-lantern.svg', '/ui/art/light-puck-lights.svg',
  '/ui/art/light-reading-lamp.svg', '/ui/art/light-table-lamp.svg', '/ui/art/light-tape-light.svg',
  '/ui/art/light-torchiere.svg', '/ui/art/light-track-light.svg', '/ui/art/light-tree-lamp.svg',
  '/ui/art/light-wall-sconce.svg', '/ui/art/lutron-color.svg', '/ui/art/lutron-dimmer.svg',
  '/ui/art/lutron-lamps.svg', '/ui/art/lutron-lampsolutions.svg', '/ui/art/lutron-rollershades.svg',
  '/ui/art/lutron-sunrise.svg', '/ui/art/lutron-wireless.svg', '/ui/art/room-bathroom.svg',
  '/ui/art/room-bedroom.svg', '/ui/art/room-dining-room.svg', '/ui/art/room-entry.svg', '/ui/art/room-garage.svg',
  '/ui/art/room-garden.svg', '/ui/art/room-kitchen.svg', '/ui/art/room-living-room.svg', '/ui/art/room-office.svg',
  '/ui/art/room-porch.svg', '/ui/colour.js', '/ui/components.css', '/ui/icons.js', '/ui/photo.js', '/ui/pico.js',
  '/ui/screens.css', '/ui/screens/about.js', '/ui/screens/activity.js', '/ui/screens/add.js', '/ui/screens/conn.js',
  '/ui/screens/device.js', '/ui/screens/follow.js', '/ui/screens/guided.js', '/ui/screens/home.js',
  '/ui/screens/looks.js', '/ui/screens/next.js', '/ui/screens/parts.js', '/ui/screens/pickers.js',
  '/ui/screens/remote.js', '/ui/screens/remotes.js', '/ui/screens/room.js', '/ui/screens/rooms.js',
  '/ui/screens/routine.js', '/ui/screens/routines.js', '/ui/screens/scenes.js', '/ui/screens/settings.js',
  '/ui/screens/setup.js', '/ui/screens/soon.js', '/ui/screens/steps.js', '/ui/screens/timing.js',
  '/ui/screens/where.js', '/ui/tint.js', '/ui/tokens.css', '/data/caseta-data.js', '/data/daylight.js',
  '/data/edit.js', '/data/home.js', '/data/index.js', '/data/remotes.js', '/data/routines.js', '/js/kinds.js',
  '/js/cities.js',
];
const CLASSIC = [
  '/classic/', '/classic/index.html', '/styles.css', '/light.css', '/motion.css', '/vendor/gsap.min.js',
  '/vendor/three.module.js', '/vendor/three.core.js', '/js/adddevice.js', '/js/automations.js', '/js/boot.js',
  '/js/color.js', '/js/core.js', '/js/daylight.js', '/js/home.js', '/js/hue.js', '/js/light.js', '/js/lightfield.js',
  '/js/motion.js', '/js/nanoleaf.js', '/js/next.js', '/js/pico.js', '/js/remotes.js', '/js/room.js', '/js/rooms.js',
  '/js/rowswipe.js', '/js/scenes.js', '/js/settings.js', '/js/slide.js', '/js/swipe.js',
];
const SHARED = [
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png',
];
const SHELL = [...APP, ...CLASSIC, ...SHARED];

self.addEventListener('install', e => {
  // one missing file must not stop the rest being cached
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/') || url.pathname.startsWith('/.well-known/')) return;
  const shell = url.pathname.startsWith('/classic') ? '/classic/index.html' : '/index.html';
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match(shell)))
  );
});
