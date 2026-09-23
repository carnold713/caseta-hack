// The Android app (mobile/): the same web app, loaded from the hub inside a Capacitor shell, with a few things a web
// app cannot have living on the Android side: All off in the quick settings shade, the house on the home screen,
// and a running sleep timer on the lock screen with real buttons. They run without the app open, so this hands them
// what they need as it changes: the hub and the sign-in, the house as Home draws it, the running timers.
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
  if (token) call('setCredentials', { url: location.origin, token });
  else call('clearCredentials');
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
export function timers(list) {
  if (!isNative) return;
  call('timers', { list: list.map(t => ({ key: t.target, title: t.name, target: t.target.includes('|') ? JSON.stringify(t.target.split('|')) : t.target, endsAt: t.ends_at * 1000 })) });
}

export async function notificationsAllowed() { const r = await call('notifications'); return !!(r && r.allowed); }
export async function askNotifications() { const r = await call('askNotifications'); return !!(r && r.allowed); }
