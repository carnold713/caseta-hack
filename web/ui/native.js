// The Android app (mobile/): the same web app, loaded from the hub inside a Capacitor shell, with a few things a web
// app cannot have living on the Android side: All off in the quick settings shade, ten widgets on the home screen,
// and a running sleep timer in the status bar and on the lock screen with real buttons. They run without the app
// open, so this hands them what they need as it changes: the hub and the sign-in, the house as Home draws it, the
// running timers, and the home as the widgets draw it (widgetData). The Widgets page (screens/widgets.js) and
// Settings' This phone group read and change the phone's side through the rest.
//
// Everything here is a no-op in a browser. The shell injects window.Capacitor (its native bridge); the page has no
// build step, so it calls the bridge's own nativePromise rather than importing @capacitor/core.
const cap = typeof window !== 'undefined' ? window.Capacitor : null;
export const isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform() && typeof cap.nativePromise === 'function');
const call = (method, opts = {}) => (isNative ? cap.nativePromise('Hub', method, opts).catch(() => null) : Promise.resolve(null));

// The sign-in, whenever it changes (and '' when signed out, which also takes the notifications down).
let lastToken = null;
export function credentials(token) {
  if (!isNative || token === lastToken) return;
  lastToken = token;
  if (token) {
    call('setCredentials', { url: location.origin, token });
    // the last thing that went wrong on the Android side, into the hub's log, where it can be looked into
    call('lastCrash').then(r => {
      if (r && r.text) fetch('/api/app-crash', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ text: r.text }) }).catch(() => {});
    });
  } else call('clearCredentials');
}

// The house as Home says it ("3 on · 60%"), for the widget. Only when it changes.
let lastHouse = '';
export function house(on, level) {
  if (!isNative) return;
  const k = `${on}/${level}`;
  if (k === lastHouse) return;
  lastHouse = k;
  call('house', { on, level });
}

// The running sleep timers, each with what its notification says and what its buttons act on. A room's timer is
// a list of lights ("d:5|d:6"), sent as JSON so the buttons can hand it back to the hub as it was.
// A tap on the notification opens the light's timer, or the room's.
const timerRoute = key => { const f = String(key).split('|')[0]; return f.startsWith('d:') ? `light/${f.slice(2)}/timer` : f.startsWith('a:') ? `room/${f.slice(2)}/timer` : 'home'; };
export function timers(list) {
  if (!isNative) return;
  call('timers', { list: list.map(t => ({ key: t.target, title: t.name, target: t.target.includes('|') ? JSON.stringify(t.target.split('|')) : t.target, endsAt: t.ends_at * 1000, route: timerRoute(t.target) })) });
}

// ---------- the widgets ----------
// The home as the widgets draw it (model: rooms, lights, scenes, pins, the night light, routines) and as it is now
// (state: levels, colours, timers, the house). Each is sent only when it has changed; the model rarely does.
let lastModel = '', lastState = '';
export function widgetData(model, state) {
  if (!isNative) return;
  const m = JSON.stringify(model), s = JSON.stringify(state);
  if (m === lastModel && s === lastState) return;
  const opts = {};
  if (m !== lastModel) opts.model = model;
  if (s !== lastState) opts.state = state;
  lastModel = m; lastState = s;
  call('widgetData', opts);
}
// The widgets on this phone's home screen, [{id, kind, cfg}], and whether the app can put one there itself.
export async function widgets() { const r = await call('widgets'); return r || { list: [], canAdd: false }; }
export async function widget(id) { return call('widget', { id: Number(id) }); }
// A widget's choices, saved as they change: the widget on the home screen redraws at once.
export async function setWidget(id, cfg) { return call('setWidget', { id: Number(id), cfg }); }
// Ask Android to put one on the home screen; once it is there the app opens on its page.
export async function addWidget(kind) { const r = await call('addWidget', { kind }); return !!(r && r.asked); }
// Done on a widget's page: true when that took the phone back to the home screen (the widget's setup opened the app).
export async function widgetDone() { const r = await call('widgetDone'); return !!(r && r.left); }

// ---------- this phone ----------
// This phone's own choices, which are not the house's: how a running sleep timer shows ("live" in the status bar,
// "quiet", or "none"), and what the Settings rows need to say about it. Kept here once read, so a redraw has it.
export let phone = null;
export async function loadPhone() { if (!isNative) return null; const r = await call('phone'); if (r) phone = r; return phone; }
export async function setPhone(opts) { if (!isNative) return null; const r = await call('setPhone', opts); if (r) phone = r; return phone; }

export async function notificationsAllowed() { const r = await call('notifications'); return !!(r && r.allowed); }
export async function askNotifications() { const r = await call('askNotifications'); return !!(r && r.allowed); }

// Whether Back has anywhere to go in the page (predictiveback.js): while it has, Android hands its back swipe to the
// page; on Home at the bottom it does not, and the system's own back to the home screen plays. Only when it changes.
let lastBack = null;
export function backable(can) {
  if (!isNative || can === lastBack) return;
  lastBack = can;
  call('backable', { can });
}
