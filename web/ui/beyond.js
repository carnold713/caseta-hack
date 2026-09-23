// 20 · Beyond the app (v7, 12816:49515). An installed web app cannot put a widget on the home screen or a tile in the
// quick settings; the Android app (mobile/, native.js) has both, and the lock screen's timers there are Android's own.
// What the web app does, in a browser or inside that app, is built here:
//
//   the icon's long-press shortcuts (web/manifest.webmanifest): All off, Goodnight, Night light, Scenes. Only All off
//     acts, and the app opens on it saying so. Goodnight opens Home at its hold, Night light the nightstand: the app
//     never turns a light on from outside itself.
//   one quiet notification per running sleep timer, "{Floor lamp} fades out at {11:42 pm}", with "Off now" and
//     "Add 15 min". The service worker (web/sw.js) shows it and acts on its buttons with the app's sign-in, which
//     this hands it. It is shown only once the person has said yes, and that is asked once, right after they set a
//     timer, never on load.
import * as native from '/ui/native.js';
import { OFFLINE_TAP } from '/ui/screens/conn.js';

// ---------- shortcuts ----------
// The shortcut's `?do=` is read once and taken off the address, so a reload does not run it again.
const DO = (() => {
  try {
    const u = new URL(location.href);
    const d = u.searchParams.get('do'); if (!d) return null;
    u.searchParams.delete('do');
    history.replaceState(null, '', u.pathname + (u.search || '') + (u.hash || ''));
    return d;
  } catch (_) { return null; }
})();
let pending = DO;

// Once the home is loaded (the first snapshot): do what the shortcut asked.
export function onReady(c) {
  const d = pending; if (!d) return;
  pending = null;
  if (d === 'all-off') return allOff(c);
  if (d === 'goodnight') { c.ui.callGoodnight = Date.now(); c.go('home'); return; }
  if (d === 'night-light') { c.go(c.has && c.has('nightstand') ? 'nightstand' : 'home'); return; }
  if (d === 'scenes') c.go('scenes');
}
// All off from the icon: everything off, then the app open on Home saying so. It is sent even when this phone
// believes nothing is lit, because off must always reach the house (the connector makes sure of each light).
async function allOff(c) {
  c.go('home');
  if (c.conn() === 'off') { c.toast(OFFLINE_TAP, { icon: 'wifi' }); return; }
  c.assume(c.H.litLights().map(d => d.device_id), 0); c.soon();
  if (!await c.run({ type: 'level', target: 'h:all', level: 'off' })) return;
  // from the icon the rooms may be out of sight, so it says what it did; no Undo (the owner's rule: a toast is not an undo button)
  c.toast('Everything off');
}

// ---------- after each redraw ----------
// Goodnight from the icon lands on Home with its hold in view and says it once with a soft ring, not a glow: a hold
// is never pressed for you. And the one question about notifications, when there is nothing else open.
export function after(c) {
  const since = Date.now() - (c.ui.callGoodnight || 0);
  const g = since < 1800 && document.querySelector('.home .goodnight .hold');
  if (g) {
    if (!c.ui.calledAt) { c.ui.calledAt = Date.now(); g.closest('.goodnight').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    // a redraw meanwhile draws a new hold: it carries on from where the old one was rather than starting over
    g.style.setProperty('--called-at', `${-(Date.now() - c.ui.calledAt)}ms`);
    g.classList.add('called');
  } else if (since >= 1800) c.ui.callGoodnight = c.ui.calledAt = 0;
  if (c.ui.askNotify && !document.querySelector('#sheet-root .sheet') && !c.ui.dragging) { c.ui.askNotify = false; ask(c); }
}

// ---------- the lock screen: running sleep timers ----------
const canNotify = () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator && typeof isSecureContext !== 'undefined' && isSecureContext;
// In the Android app the lock screen is Android's own (native.js, mobile/): whether it may show timers is asked there.
let nativeAllowed = false;
if (native.isNative) native.notificationsAllowed().then(a => { nativeAllowed = a; });
const permission = () => (native.isNative ? (nativeAllowed ? 'granted' : 'default') : Notification.permission);
const asked = () => { try { return localStorage.getItem('notifyAsked') === '1'; } catch (_) { return true; } };
const setAsked = () => { try { localStorage.setItem('notifyAsked', '1'); } catch (_) { /* then it may ask again */ } };

// What a timer is over, in words: a light, a room, the house.
function timerName(c, key) {
  const parts = String(key).split('|');
  const one = t => {
    if (t.startsWith('d:')) { const d = c.data.dev(t.slice(2)); return d ? d.name : null; }
    if (t.startsWith('a:')) return c.data.areaName(t.slice(2));
    if (t.startsWith('g:')) { const g = (c.S.config.groups || []).find(x => x.id === t.slice(2)); return g ? g.name : null; }
    if (t === 'h:all') return 'The house';
    return null;
  };
  const first = one(parts[0]) || 'A light';
  return parts.length > 1 ? `${first} and ${parts.length - 1} more` : first;
}
// The timers that are running and end in the lights going out, soonest first, each with the words it is shown in.
export function runningTimers(c) {
  const now = Date.now();
  return Object.entries(c.S.timers || {}).map(([target, v]) => {
    if (!v || !v.ends_at || v.level) return null;
    const ms = v.ends_at < 1e12 ? v.ends_at * 1000 : +new Date(v.ends_at);
    if (!(ms > now)) return null;
    const name = timerName(c, target);
    const at = c.RT.fmtTime(c.RT.zparts(new Date(ms)).hm);
    return { target, name, ends_at: Math.round(ms / 1000), at, title: `${name} fades out at ${at}` };
  }).filter(Boolean).sort((a, b) => a.ends_at - b.ends_at);
}

let seen = null;
// Every time the timers change: hand the worker the list (and the sign-in its buttons act with), and, the first time
// this phone sees a timer start, ask once whether to show them on the lock screen.
export function onTimers(c) {
  const list = runningTimers(c);
  const keys = new Set(list.map(t => t.target));
  const fresh = seen && list.some(t => !seen.has(t.target));
  seen = keys;
  const driven0 = navigator.webdriver && !window.__askNotify;
  if (native.isNative) {
    if (fresh && !driven0 && !nativeAllowed && !asked()) c.ui.askNotify = true;
    native.timers(nativeAllowed ? list : []);
    return;
  }
  if (!canNotify()) return;
  // A browser driven by a script (navigator.webdriver: the browser tests) is not asked: a sheet rising over the page
  // would take the next tap the script meant for the page. The setup test asks for it by name.
  const driven = navigator.webdriver && !window.__askNotify;
  if (fresh && !driven && Notification.permission === 'default' && !asked()) c.ui.askNotify = true;
  if (Notification.permission === 'granted') post({ type: 'timers', token: c.S.token, tz: (c.S.config && c.S.config.settings && c.S.config.settings.timezone) || null, items: list });
}
// Signed out: the worker forgets the sign-in and takes its notifications down.
export function signedOut() { if (native.isNative) native.credentials(''); else if (canNotify()) post({ type: 'signout' }); seen = null; }

async function worker() {
  let reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  if (!reg) reg = await navigator.serviceWorker.register('/sw.js').catch(() => null);
  if (!reg) return null;
  if (reg.active) return reg.active;
  const r = await navigator.serviceWorker.ready.catch(() => null);
  return r && r.active;
}
async function post(msg) { const w = await worker(); if (w) w.postMessage(msg); }

// The question, with what it would look like: the candle, the words, the two buttons it would have.
function ask(c) {
  const t = runningTimers(c)[0];
  if (!t || permission() !== 'default' || asked()) return;
  const { esc } = c;
  c.openSheet({
    over: 'Sleep timer', title: 'Show running timers on the lock screen?', key: 'notify-ask',
    onClose: () => { setAsked(); c.render(); },
    body: `<div class="nt-preview" aria-hidden="true">
        <span class="nt-app"><img src="/icons/timer-candle.png" alt="">Caseta · now</span>
        <span class="nt-title">${esc(t.title)}</span><i class="nt-candle"></i>
        <span class="nt-btns"><span>Off now</span><span>Add 15 min</span></span></div>
      <p class="t-body muted sheet-p">Only while a timer runs. Its buttons turn the light off or add time; nothing there turns a light on.</p>
      <div class="sheet-btns"><button class="pill solid" data-act="notify-allow">Allow</button><button class="pill ghost" data-act="notify-later">Not now</button></div>`,
  });
}
export const actions = {
  async 'notify-allow'(c) {
    setAsked(); c.closeSheet();
    let p = 'default';
    if (native.isNative) { nativeAllowed = await native.askNotifications(); p = nativeAllowed ? 'granted' : 'denied'; }
    else try { p = await Notification.requestPermission(); } catch (_) { /* a browser that says no by throwing */ }
    if (p === 'granted') onTimers(c);
    c.render();
  },
  'notify-later'(c) { setAsked(); c.closeSheet(); c.render(); },
};
