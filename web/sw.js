/* Service worker: caches the app shell so the PWA opens instantly and offline.
   API and WebSocket traffic is never cached. Bump VERSION when shell files change.

   Two shells since the cutover: the Copper Night app at / (web/index.html, web/ui/, web/data/) and the previous
   design kept at /classic/ (web/classic/index.html and web/js/). An offline navigation lands on whichever it asked
   for. Network first throughout, so a deploy shows up on the next open.

   It also keeps the lock screen's one notification per running sleep timer (20 · Beyond the app, web/ui/beyond.js):
   the app hands it the timers and its sign-in; "Off now" and "Add 15 min" act through the API with that sign-in, and
   nothing here ever turns a light on. */
const VERSION = 'v42';
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
  '/ui/art/room-porch.svg', '/ui/colour.js', '/ui/components.css', '/ui/gesture.js', '/ui/icons.js', '/ui/motion.js', '/ui/predictiveback.js', '/ui/roomopen.js', '/ui/sheetdrag.js', '/ui/photo.js', '/ui/pico.js',
  '/ui/screens.css', '/ui/screens/about.js', '/ui/screens/activity.js', '/ui/screens/add.js', '/ui/screens/conn.js',
  '/ui/screens/device.js', '/ui/screens/follow.js', '/ui/screens/guided.js', '/ui/screens/home.js',
  '/ui/screens/looks.js', '/ui/screens/next.js', '/ui/screens/parts.js', '/ui/screens/pickers.js',
  '/ui/screens/remote.js', '/ui/screens/remotes.js', '/ui/screens/room.js', '/ui/screens/rooms.js',
  '/ui/screens/routine.js', '/ui/screens/routines.js', '/ui/screens/scenes.js', '/ui/screens/settings.js',
  '/ui/screens/setup.js', '/ui/screens/soon.js', '/ui/screens/steps.js', '/ui/screens/timing.js',
  '/ui/screens/where.js', '/ui/tint.js', '/ui/tokens.css', '/ui/glow.js', '/ui/beyond.js', '/ui/native.js', '/ui/screens/onboard.js',
  '/ui/screens/nightstand.js', '/ui/v7/home.css', '/ui/v7/light.css', '/ui/v7/scenes.css', '/ui/v7/night.css',
  '/ui/v7/log.css', '/ui/v7/setup.css', '/data/caseta-data.js', '/data/daylight.js',
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
  '/icons/shortcut-all-off.png', '/icons/shortcut-goodnight.png', '/icons/shortcut-night-light.png',
  '/icons/shortcut-scenes.png', '/icons/timer-candle.png', '/icons/timer-badge.png',
];
// Not a shell cache: where the sign-in the notification buttons act with is kept, so it outlives the worker being
// stopped between events. Survives version bumps; signing out clears it.
const STATE = 'caseta-state';
const SHELL = [...APP, ...CLASSIC, ...SHARED];

self.addEventListener('install', e => {
  // one missing file must not stop the rest being cached
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== STATE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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

// ---------- the lock screen: running sleep timers ----------
// One notification per timer, tagged by what it is over, showing when it ends rather than a count (a count would
// have to wake the phone every minute). Re-shown only when its end changes, so it never buzzes twice for one timer.
const TOKEN = '/__state/token';
const saveToken = t => caches.open(STATE).then(c => (t ? c.put(TOKEN, new Response(t)) : c.delete(TOKEN)));
const readToken = () => caches.open(STATE).then(c => c.match(TOKEN)).then(r => (r ? r.text() : null)).catch(() => null);
const OFF_NOW = { action: 'off', title: 'Off now' }, ADD = { action: 'add', title: 'Add 15 min' };

// "11:42 pm" in the home's own time zone, the way the app writes a time.
function clock(sec, tz) {
  const o = {};
  try { for (const p of new Intl.DateTimeFormat('en-US', { timeZone: tz || undefined, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(sec * 1000))) o[p.type] = p.value; }
  catch (_) { const d = new Date(sec * 1000); o.hour = String(d.getHours()); o.minute = String(d.getMinutes()).padStart(2, '0'); }
  const h = Number(o.hour) % 24;
  return `${h % 12 || 12}:${o.minute} ${h >= 12 ? 'pm' : 'am'}`;
}
function show(t, extra = {}) {
  return self.registration.showNotification(`${t.name} fades out at ${clock(t.ends_at, t.tz)}`, {
    tag: `timer:${t.target}`, icon: '/icons/timer-candle.png', badge: '/icons/timer-badge.png',
    silent: true, renotify: false, timestamp: t.ends_at * 1000,
    actions: [OFF_NOW, ADD], data: { target: t.target, name: t.name, ends_at: t.ends_at, tz: t.tz || null }, ...extra,
  });
}
const mine = () => self.registration.getNotifications().then(ns => ns.filter(n => String(n.tag || '').startsWith('timer:')));
async function syncTimers(items, tz) {
  const now = Date.now() / 1000;
  const live = new Map(items.filter(t => t.ends_at > now).map(t => [`timer:${t.target}`, { ...t, tz }]));
  for (const n of await mine()) {
    const t = live.get(n.tag);
    if (!t) { n.close(); continue; }
    if (n.data && n.data.ends_at === t.ends_at) live.delete(n.tag);
  }
  for (const t of live.values()) await show(t);
}

self.addEventListener('message', e => {
  const m = e.data || {};
  if (m.type === 'timers') {
    e.waitUntil(Promise.all([saveToken(m.token || null), Notification.permission === 'granted' ? syncTimers(m.items || [], m.tz) : null]));
  }
  if (m.type === 'signout') e.waitUntil(Promise.all([saveToken(null), mine().then(ns => ns.forEach(n => n.close()))]));
});

// One command, as the app sends it: the same endpoint, the same sign-in.
async function command(token, action) {
  const res = await fetch('/api/command', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(action) });
  if (res.status === 401) { await saveToken(null); throw Object.assign(new Error('signed out'), { signedOut: true }); }
  if (!res.ok) throw new Error(String(res.status));
}
async function openApp() {
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const w = wins.find(c => new URL(c.url).origin === location.origin);
  if (w) return w.focus();
  return self.clients.openWindow('/');
}
// The buttons only ever turn off or add time: Off now cancels the timer and puts the light out; Add 15 min sets the
// timer again, 15 minutes further on. A tap on the notification itself opens the app.
self.addEventListener('notificationclick', e => {
  const n = e.notification; const d = n.data || {};
  if (!e.action) { n.close(); e.waitUntil(openApp()); return; }
  e.waitUntil((async () => {
    const token = await readToken();
    if (!token || !d.target) { n.close(); return openApp(); }
    const parts = String(d.target).split('|');
    const target = parts.length === 1 ? parts[0] : parts;
    try {
      if (e.action === 'off') {
        await command(token, { type: 'cancel_timer', target });
        await command(token, { type: 'level', target, level: 'off' });
        n.close();
      } else if (e.action === 'add') {
        const left = Math.max(1, Math.ceil((d.ends_at * 1000 - Date.now()) / 60000));
        const minutes = Math.min(1440, left + 15);
        await command(token, { type: 'timer', target, minutes, fade: 5 });
        await show({ ...d, ends_at: Math.floor(Date.now() / 1000) + minutes * 60 });
      }
    } catch (err) {
      if (err.signedOut) { n.close(); return openApp(); }
      // the house did not answer: say so on the same notification, and keep its buttons
      await show(d, { body: "Can't reach the house right now. Your remotes still work." });
    }
  })());
});
