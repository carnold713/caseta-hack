// Copper Night: the app. One module that owns the data layer instance, the route, the redraw, the toast and the
// socket; each screen is a module in web/ui/screens/ that turns the state into HTML and says what its taps do.
//
// Nothing here decides anything about the home: that is web/data/. This file only asks it and draws the answer.
// It is served at /ui/ beside the old app until cutover (docs/design-spec-v6.md, the handoff's phase 5).
import '/js/kinds.js';
import { create, CasetaHome, CasetaDaylight, CasetaEdit, RECONNECT_GRACE, esc } from '/data/index.js';
import { icon } from '/ui/icons.js';
import { deviceArt, roomArt, artSrc, kindArt } from '/ui/art.js';
import { lampTint } from '/ui/tint.js';
import * as homeScreen from '/ui/screens/home.js';
import * as roomsScreen from '/ui/screens/rooms.js';
import * as roomScreen from '/ui/screens/room.js';
import * as deviceScreen from '/ui/screens/device.js';
import * as soonScreen from '/ui/screens/soon.js';
import * as scenesScreen from '/ui/screens/scenes.js';

const data = create({ storage: localStorage });
const H = CasetaHome.create(data);
const DAY = CasetaDaylight.create(data);
const EDIT = CasetaEdit.create(data, H);
const S = data.S;
const $ = s => document.querySelector(s);

// ---------- commands and saving ----------
// Run one action now. A failure is said in a toast and never thrown at the screen.
async function run(action) {
  try { await data.run(action); return true; }
  catch (e) { toast(e.message, { err: true }); return false; }
}
// A finger on a slider: one command in flight per light, the newest value next (the layer's gate).
const gate = data.gate(run);
// Every change applies at once and offers Undo; there is no save button anywhere.
async function save(msg, opts = {}) {
  try {
    const { prev } = await data.saveConfig();
    if (!opts.quiet) toast(msg || 'Saved', { undo: prev ? async () => { data.restoreConfig(prev); await save('Undone'); } : null });
  } catch (e) {
    toast(`Couldn't save. ${e.message}`, { err: true });
  }
  render();
}
// Many small edits in a row (a slider in a scene, typing a name) save once, quietly, after they stop.
let saveTimer = null;
function saveSoon(ms = 700) { clearTimeout(saveTimer); saveTimer = setTimeout(() => save('', { quiet: true }), ms); }
// Show a light's new level before the bridge confirms it, so a tap feels like it landed.
function assume(ids, level) { for (const id of ids) S.states[id] = { ...(S.states[id] || {}), level }; }

// ---------- the toast ----------
let toastTimer = null;
function toast(msg, opts = {}) {
  const root = $('#toast-root');
  const undo = opts.undo ? `<button class="act" data-act="toast-undo">Undo</button>` : '';
  root.innerHTML = `<div class="toast ${opts.err ? 'err' : ''}" role="status">${icon(opts.err ? 'x' : 'check', 20, 1.8)}<span class="msg">${esc(msg)}</span>${undo}</div>`;
  root._undo = opts.undo || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { root.innerHTML = ''; root._undo = null; }, 5000);
}

// ---------- the sheet ----------
// One-choice interactions are a sheet over the page. A screen hands in the overline, title and body.
// Opening the sheet that is already open (the same key) only redraws its body, so a state change never replays
// its rise. `onClose` runs when it is dismissed (the scrim, the X); a sheet that is a page's sub route uses it to
// step the address back to the page.
function openSheet({ over = '', title, body, key = '', onClose = null, back = false, head = '' }) {
  const root = $('#sheet-root');
  const headHTML = `<div class="sheet-head ${back ? 'has-back' : ''}">${back ? `<button class="sheet-back" data-act="picker-back" aria-label="Back">${icon('back', 18, 1.8)}</button>` : ''}${over ? `<div class="t-over">${esc(over)}</div>` : ''}<h2 class="t-sheet">${esc(title)}</h2>
        ${head}<button class="sheet-close" data-act="sheet-close" aria-label="Close">${icon('x', 18, 1.8)}</button></div>`;
  if (key && root.dataset.key === key && !root.hidden) {
    root._onClose = onClose;
    // someone typing in the sheet (a name) is never redrawn out from under
    const a = document.activeElement;
    if (a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return root;
    const h = root.querySelector('.sheet-head'); if (h) h.outerHTML = headHTML;
    const b = root.querySelector('.sheet-body'); if (b) b.innerHTML = body;
    return root;
  }
  // one sheet replacing another (White to Colour) swaps in place rather than rising again
  const still = !root.hidden && !!root.dataset.key;
  root.dataset.key = key;
  root._onClose = onClose;
  root.innerHTML = `<button class="scrim ${still ? 'still' : ''}" data-act="sheet-close" aria-label="Close"></button>
    <div class="sheet ${still ? 'still' : ''}" role="dialog" aria-label="${esc(title)}"><div class="grab"></div>
      ${headHTML}
      <div class="sheet-body">${body}</div></div>`;
  root.hidden = false;
  return root;
}
function closeSheet() { const root = $('#sheet-root'); root.innerHTML = ''; root.hidden = true; root.dataset.key = ''; root._onClose = null; }
function dismissSheet() { const root = $('#sheet-root'); const f = root._onClose; closeSheet(); if (f) f(); }

// ---------- the route ----------
// #home, #rooms, #room/<id>, #light/<id>, #remotes, #remote/<id>, #routines, #settings, #activity, #scenes. The old
// app's #automations still lands on Routines, so an installed shortcut keeps working.
const ALIAS = { automations: 'routines', '': 'home' };
function route() {
  const raw = location.hash.replace(/^#/, '');
  let parts;
  try { parts = decodeURIComponent(raw).split('/'); } catch (_) { parts = ['home']; }
  const name = ALIAS[parts[0]] ?? parts[0];
  // #light/<id>/white: the id, then the page under it
  return { name, id: parts[1] || null, sub: parts.slice(2).join('/') || null };
}
const SCREENS = { home: homeScreen, rooms: roomsScreen, room: roomScreen, light: deviceScreen, scenes: scenesScreen };
const TAB_OF = { home: 'home', rooms: 'rooms', room: 'rooms', light: 'rooms', scenes: 'rooms', remotes: 'remotes', remote: 'remotes', routines: 'routines', settings: 'home', activity: 'home' };
const TABS = [['home', 'home', 'Home'], ['rooms', 'grid', 'Rooms'], ['remotes', 'remote', 'Remotes'], ['routines', 'clock', 'Routines']];
// A screen draws the pages under it that it declares (screen.subs); any other sub page is not built yet.
function screenFor(r) {
  const screen = SCREENS[r.name];
  if (!screen) return soonScreen;
  if (r.sub && !screen.sheetFor && !(screen.subs || []).includes(r.sub) && !(screen.sheets && screen.sheets[r.sub])) return soonScreen;
  return screen;
}
function go(hash) { if (location.hash === '#' + hash) render(); else location.hash = hash; }

// ---------- what every screen is handed ----------
const ctx = {
  data, H, DAY, EDIT, S, esc, icon, deviceArt, roomArt, artSrc, kindArt, lampTint,
  openPicker: (n, spec) => openPicker(n, spec), closePicker: () => closePicker(),
  run, gate, save, saveSoon, assume, toast, go, openSheet, closeSheet, render: () => render(),
  // swap the page's sub route in place (White to Colour on the same sheet): no new step for the back button
  swap: hash => { history.replaceState(null, '', '#' + hash); render(); },
  conn: () => data.connState(),
  ui: { dragging: false },
};

// ---------- the redraw ----------
// A screen is drawn whole from the state. What must survive a redraw is kept by hand: the page's scroll, and the
// sideways scroll of each strip. While a finger is on a control nothing is redrawn at all, so the control is never
// pulled out from under it; the redraw it missed happens when the finger lifts.
let pending = false;
function render() {
  if (ctx.ui.dragging) { pending = true; return; }
  pending = false;
  const app = $('#app'), scr = $('#screen'), tabs = $('#tabs');
  if (!S.token) { app.className = 'plain'; tabs.hidden = true; scr.innerHTML = loginHTML(); return; }
  if (!S.ready || !S.config) { app.className = 'plain'; tabs.hidden = true; scr.innerHTML = loadingHTML(); return; }
  const r = route();
  const screen = screenFor(r);
  const keep = {};
  scr.querySelectorAll('[data-keep]').forEach(el => { keep[el.dataset.keep] = el.scrollLeft; });
  scr.innerHTML = screen.view(ctx, r);
  scr.querySelectorAll('[data-keep]').forEach(el => { if (keep[el.dataset.keep] != null) el.scrollLeft = keep[el.dataset.keep]; });
  const st = data.connState();
  // a pushed detail page (a light, a fan, a shade) has no tab bar in the file; everything else does
  app.className = [st === 'off' ? 'offline' : '', screen.noTabs ? 'notabs' : ''].filter(Boolean).join(' ');
  tabs.hidden = !!screen.noTabs;
  const tab = TAB_OF[r.name] || 'home';
  tabs.innerHTML = TABS.map(([t, ic, label]) => `<button data-go="${t}" aria-label="${label}" ${t === tab ? 'aria-current="page"' : ''}>${icon(ic, 24, 1.7)}</button>`).join('');
  if (screen.after) screen.after(ctx, r, scr);
  routedSheet(screen, r);
}
// A sheet that is a page's sub route (#light/<id>/white): drawn over the page, redrawn with it, and dismissing it
// puts the address back to the page without adding a step to the back button.
// A screen can instead decide its own sheet from the route (screen.sheetFor), for a sheet that is not a sub page:
// #scenes/<id> is the scene list with that scene's editor over it.
//
// A picker (which room, which light to add) opens inside whatever sheet is up, with a back arrow to it: it is
// state, not an address, and closing either returns to the page.
function sheetOf(screen, r) {
  if (screen.sheetFor) return screen.sheetFor(ctx, r);
  const make = r.sub && screen.sheets && screen.sheets[r.sub];
  return make ? { spec: make(ctx, r), parent: `${r.name}/${r.id}` } : null;
}
function routedSheet(screen, r) {
  const got = sheetOf(screen, r);
  if (!got || !got.spec) { ctx.ui.picker = null; return; }
  const key = location.hash.replace(/^#/, '');
  const close = () => { ctx.ui.picker = null; history.replaceState(null, '', '#' + got.parent); render(); };
  const pk = ctx.ui.picker && ctx.ui.picker.key === key ? ctx.ui.picker : null;
  const spec = pk ? { ...pk.spec(ctx, r), back: true } : got.spec;
  const root = openSheet({ ...spec, key: pk ? `${key}#${pk.name}` : key, onClose: close });
  if (spec.after) spec.after(ctx, r, root);
}
// Open a picker inside the current sheet. `spec(ctx, r)` draws it; its taps are the screen's actions as usual.
function openPicker(name, spec) { ctx.ui.picker = { key: location.hash.replace(/^#/, ''), name, spec }; render(); }
function closePicker() { ctx.ui.picker = null; render(); }
let frame = 0;
function soon() { if (frame) return; frame = requestAnimationFrame(() => { frame = 0; render(); }); }
ctx.soon = soon;
ctx.endDrag = () => { ctx.ui.dragging = false; if (pending) render(); };

// ---------- signing in and loading ----------
function loginHTML() {
  return `<div class="login">
    <h1 class="t-h1">Welcome</h1>
    <p class="t-body muted">Enter your home's password to get started.</p>
    <form data-form="login" class="login-form">
      <input class="field" type="password" id="pw" autocomplete="current-password" placeholder="Password" aria-label="Password">
      <button class="pill solid" type="submit">Continue</button>
      <p class="t-cap login-err" id="login-err" hidden></p>
    </form></div>`;
}
function loadingHTML() { return `<div class="login"><h1 class="t-h1">Getting your home ready</h1><p class="t-body muted">One moment.</p></div>`; }
async function signIn(pw) {
  const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) throw new Error(res.status === 429 ? 'Too many tries. Wait a few minutes and try again.' : "That isn't the password.");
  localStorage.setItem('token', body.token);
  S.token = body.token;
  connect();
  render();
}

// ---------- the socket ----------
// The layer applies each message to the state and says whether anything on screen changed; this redraws when it
// did. The quiet window before the app admits it is offline is the layer's; this books the one redraw that shows it.
let graceTimer = null;
function onConn(conn) {
  if (conn === 'started') { clearTimeout(graceTimer); graceTimer = setTimeout(render, RECONNECT_GRACE + 50); }
  if (conn === 'cleared') clearTimeout(graceTimer);
}
function connect() {
  data.connectWS({
    message: (m, r) => {
      if (m.type === 'snapshot') {
        // once, quietly, as the old app does: bring the five's old slow fades forward
        if (H.shortenSuggestedFades()) save('', { quiet: true });
      }
      if (m.type === 'toast') toast(m.msg, { err: m.level === 'error' });
      if (r.conn) onConn(r.conn);
      if (r.changed || m.type === 'snapshot') soon();
    },
    close: conn => { onConn(conn); if (S.ready) soon(); },
  });
}
data.hooks.signedOut = () => render();

// ---------- taps ----------
document.addEventListener('click', e => {
  // the tap that ends a press and hold is not a tap as well
  if (Date.now() - heldAt < 700) { e.preventDefault(); return; }
  // the innermost target wins: a tile navigates, the power circle inside it toggles
  const el = e.target.closest('[data-act], [data-go]'); if (!el) return;
  if (!el.dataset.act) { e.preventDefault(); closeSheet(); go(el.dataset.go); return; }
  const act = el.dataset.act;
  if (act === 'sheet-close') { dismissSheet(); return; }
  if (act === 'picker-back') { closePicker(); return; }
  if (act === 'toast-undo') { const root = $('#toast-root'); const u = root._undo; root.innerHTML = ''; root._undo = null; if (u) u(); return; }
  if (act === 'back') { if (history.length > 1) history.back(); else go('home'); return; }
  const r = route();
  const screen = screenFor(r);
  const fn = (screen.actions && screen.actions[act]) || SHARED[act];
  if (fn) fn(ctx, el, r);
});
// A name field in a sheet (a room's, a scene's) saves as it is typed; Done or Enter closes it.
document.addEventListener('input', e => {
  const form = e.target.closest && e.target.closest('form[data-form="name"]'); if (!form) return;
  const r = route(); const screen = screenFor(r);
  const fn = screen.actions && screen.actions[form.dataset.act];
  if (fn) fn(ctx, form, r, e.target.value);
});
document.addEventListener('submit', e => {
  if (e.target.dataset.form !== 'name') return;
  e.preventDefault();
  closePicker();
}, true);
document.addEventListener('submit', async e => {
  if (e.target.dataset.form !== 'login') return;
  e.preventDefault();
  const err = $('#login-err');
  try { err.hidden = true; await signIn($('#pw').value); }
  catch (x) { err.textContent = x.message; err.hidden = false; }
});
// A new address closes whatever sheet was up; one that only swaps the sheet over the same page (White to Colour)
// keeps the page's scroll.
let lastPage = '';
window.addEventListener('hashchange', () => {
  closeSheet();
  const r = route(); const page = `${r.name}/${r.id}`;
  if (page !== lastPage) window.scrollTo(0, 0);
  lastPage = page;
  render();
});

// Taps that mean the same on every screen.
const SHARED = {
  // a light's power circle: on to off, off to on, shown at once and confirmed by the bridge
  toggle(c, el) {
    const id = el.dataset.id; const d = data.dev(id); if (!d) return;
    if (d.domain === 'fan') { const on = data.isOn(id); run({ type: 'fan', target: `d:${id}`, speed: on ? 'Off' : 'Medium' }); return; }
    const on = data.isOn(id);
    assume([id], on ? 0 : 100); soon();
    run({ type: 'level', target: `d:${id}`, level: on ? 'off' : 'on' });
  },
  // a scene chip: Lutron scenes and the app's own run the same way
  scene(c, el) {
    const t = el.dataset.t;
    if (t.startsWith('p:')) {
      const p = data.presets().find(x => x.id === t.slice(2)); if (!p) return;
      for (const [id, v] of Object.entries(p.levels || {})) if (data.dev(id)) S.states[id] = { ...(S.states[id] || {}), level: typeof v === 'object' ? Number(v.level) || 0 : typeof v === 'number' ? v : 0 };
      soon();
      run({ type: 'preset', preset_id: p.id });
    } else if (t.startsWith('s:')) run({ type: 'scene', scene_id: t.slice(2) });
  },
};

// ---------- press and hold ----------
let heldAt = 0;
// An element with data-hold runs its screen's hold action after that many milliseconds held, and the press is
// forgotten if the finger lifts, slides more than a few pixels, or leaves the element first. The ring on it closes
// over the same time (CSS, data-holding). Nothing is redrawn while a press is held, so a state update arriving
// meanwhile cannot pull the element out from under the finger; the redraw it missed happens when the press ends.
let hold = null;
function endHold(fire) {
  const h = hold; if (!h) return;
  hold = null;
  clearTimeout(h.timer);
  h.el.dataset.holding = '0';
  ctx.endDrag();
  if (fire) {
    heldAt = Date.now();
    if (navigator.vibrate) navigator.vibrate(30);
    const r = route(); const screen = screenFor(r);
    const fn = screen.actions && screen.actions[h.el.dataset.hold];
    if (fn) fn(ctx, h.el, r);
  }
}
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-hold]'); if (!el) return;
  // a press on something inside it that is its own button (a chevron) is that button's
  const inner = e.target.closest('[data-act], [data-go]');
  if (inner && inner !== el && el.contains(inner)) return;
  endHold(false);
  el.dataset.holding = '1';
  ctx.ui.dragging = true;
  hold = { el, x: e.clientX, y: e.clientY, timer: setTimeout(() => endHold(true), Number(el.dataset.ms) || 1000) };
});
document.addEventListener('pointermove', e => { if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) endHold(false); }, true);
for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, () => endHold(false), true);
document.addEventListener('pointerleave', e => { if (hold && e.target === hold.el) endHold(false); }, true);

// ---------- start ----------
// The Home greeting and the whole house rely on the home's own time zone; nothing else needs doing before the first
// draw. With a token, dial straight away; without one, the sign-in is the first thing drawn.
if (S.token) connect();
render();
// a slow minute tick keeps anything that says a time (the greeting, "since 9:41 pm") honest
setInterval(() => { if (!ctx.ui.dragging && !document.hidden) soon(); }, 60000);

// for the browser tests and for poking at from the console
window.__copper = ctx;
