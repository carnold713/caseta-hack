// Copper Night: the app. One module that owns the data layer instance, the route, the redraw, the toast and the
// socket; each screen is a module in web/ui/screens/ that turns the state into HTML and says what its taps do.
//
// Nothing here decides anything about the home: that is web/data/. This file only asks it and draws the answer.
// It is served at /ui/ beside the old app until cutover (docs/design-spec-v6.md, the handoff's phase 5).
import '/js/kinds.js';
import '/js/cities.js';
import { create, CasetaHome, CasetaDaylight, CasetaEdit, CasetaRemotes, CasetaRoutines, RECONNECT_GRACE, esc } from '/data/index.js';
import { icon } from '/ui/icons.js';
import { deviceArt, roomArt, artSrc, kindArt } from '/ui/art.js';
import { lampTint } from '/ui/tint.js';
import * as motion from '/ui/motion.js';
import { wireSheetDrag } from '/ui/sheetdrag.js';
import * as homeScreen from '/ui/screens/home.js';
import * as roomsScreen from '/ui/screens/rooms.js';
import * as roomScreen from '/ui/screens/room.js';
import * as deviceScreen from '/ui/screens/device.js';
import * as soonScreen from '/ui/screens/soon.js';
import * as scenesScreen from '/ui/screens/scenes.js';
import * as remotesScreen from '/ui/screens/remotes.js';
import * as remoteScreen from '/ui/screens/remote.js';
import * as timingScreen from '/ui/screens/timing.js';
import * as routinesScreen from '/ui/screens/routines.js';
import * as routineScreen from '/ui/screens/routine.js';
import * as guidedScreen from '/ui/screens/guided.js';
import * as activityScreen from '/ui/screens/activity.js';
import * as settingsScreen from '/ui/screens/settings.js';
import * as addScreen from '/ui/screens/add.js';
import * as onboard from '/ui/screens/onboard.js';
import { OFFLINE_TAP } from '/ui/screens/conn.js';
import * as beyond from '/ui/beyond.js';
import * as native from '/ui/native.js';
import * as nightstandScreen from '/ui/screens/nightstand.js';

const data = create({ storage: localStorage });
const H = CasetaHome.create(data);
const DAY = CasetaDaylight.create(data);
const EDIT = CasetaEdit.create(data, H);
const REM = CasetaRemotes.create(data, H);
const RT = CasetaRoutines.create(data, H, REM);
const S = data.S;
const $ = s => document.querySelector(s);

// ---------- commands and saving ----------
// Run one action now. A failure is said in a toast and never thrown at the screen.
async function run(action) {
  // 18 · Offline, calmly: past the quiet ten seconds a tap is answered at once and nothing is queued to replay later
  if (data.connState() === 'off') { toast(OFFLINE_TAP, { icon: 'wifi' }); return false; }
  // a scene arriving crossfades every light it touches over the scene's 1.0 s, not one light's 0.4 s
  if (action && (action.type === 'preset' || action.type === 'scene')) motion.sceneArriving();
  // the scene run last in a room is the one it is showing, when more than one would fit (home.js sceneMatch)
  if (action && action.type === 'preset') H.noteSceneRun(action.preset_id);
  try { await data.run(action); return true; }
  catch (e) { toast(e.message, { err: true }); return false; }
}
// A finger on a slider: one command in flight per light, the newest value next (the layer's gate).
const gate = data.gate(run);
// Every change applies at once; there is no save button anywhere, and only a deletion offers Undo.
async function save(msg, opts = {}) {
  try {
    const { prev } = await data.saveConfig();
    // a change shows where it was made; only a deletion says so, with Undo (see toast)
    if (!opts.quiet && opts.keepUndo) toast(msg || 'Saved', { keepUndo: true, undo: prev ? async () => { data.restoreConfig(prev); await save('', { quiet: true }); } : null });
  } catch (e) {
    toast(`Couldn't save. ${e.message}`, { err: true });
  }
  render();
}
// Many small edits in a row (a slider in a scene, typing a name) save once, quietly, after they stop.
let saveTimer = null;
function saveSoon(ms = 700) { clearTimeout(saveTimer); saveTimer = setTimeout(() => save('', { quiet: true }), ms); }
// Show a light's new level before the bridge confirms it, so a tap feels like it landed.
// What "on" will mean for a light right now, decided the way the connector decides it (engine.on_level_for), so a
// light switched on shows the level it is about to be and does not jump when the bridge answers: a task light comes
// on at the home's level, a light set with its own level at that, anything else at the evening curve's level while
// the wind-down is on (30% late at night, say), and otherwise at the home's level.
function onLevel(id, target) {
  const s = S.config.settings || {};
  const base = Number(s.group_on_level) || 100;
  if ((s.roles || {})[id] === 'task') return base;
  if (typeof target === 'string' && target.startsWith('g:')) {
    const g = (S.config.groups || []).find(x => x.id === target.slice(2));
    if (g && g.on_level) return Number(g.on_level);
  }
  const cl = RT.curveLevelNow();
  return cl != null ? cl : base;
}
// A slider held by a finger also holds that level against the bridge's echoes of the values it passed through.
function assume(ids, level, { held = false } = {}) { if (data.connState() === 'off') return; for (const id of ids) S.states[id] = { ...(S.states[id] || {}), level }; if (held) data.hold(ids); }

// ---------- the toast ----------
// The owner turned toasts off for now because they got in the way; set this back to true to bring every one back.
const TOASTS = false;
let toastTimer = null;
// A toast is for what the house cannot show. A light turning on, dimming or changing colour is its own answer, and
// the owner found a toast sitting over the page after every tap, offering Undo, more in the way than useful. So a
// toast whose only job is Undo is not shown at all; Undo stays where something was deleted (a room, a scene, a
// routine), which nothing on the page can bring back (opts.keepUndo). Errors and plain notes still show.
function toast(msg, opts = {}) {
  if (!TOASTS) return;
  if (opts.undo && !opts.keepUndo && !opts.err) return;
  const root = $('#toast-root');
  // "Undo" for a change; "Put back" for a scene, Goodnight or Try it (opts.undoLabel), which may stay longer (opts.ms)
  const undo = opts.undo ? `<button class="act" data-act="toast-undo">${esc(opts.undoLabel || 'Undo')}</button>` : '';
  root.innerHTML = `<div class="toast ${opts.err ? 'err' : ''}" role="status"${opts.ms ? ` style="--toast-ms:${opts.ms}ms"` : ''}>${icon(opts.err ? 'x' : opts.icon || 'check', 20, 1.8)}<span class="msg">${esc(msg)}</span>${undo}</div>`;
  root._undo = opts.undo || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { root._undo = null; const t = root.firstElementChild; if (t) motion.leave(t); }, opts.ms || 5000);
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
    const snap = motion.snap(root.querySelector('.sheet'));
    const h = root.querySelector('.sheet-head'); if (h) h.outerHTML = headHTML;
    const b = root.querySelector('.sheet-body'); if (b) b.innerHTML = body;
    motion.carry(snap, root.querySelector('.sheet'));
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
// It drops rather than vanishing (0.28 s EASE_IN, the scrim fading with it); what falls is a copy, and the sheet
// itself is gone at once, so nothing on it can be tapped on the way down.
// (A sheet swiped down has already fallen: `dropped` closes it without a second drop.)
function closeSheet({ dropped = false } = {}) { const root = $('#sheet-root'); if (!dropped) motion.sheetOut(root); root.innerHTML = ''; root.hidden = true; root.dataset.key = ''; root._onClose = null; }
function dismissSheet(o) { const root = $('#sheet-root'); const f = root._onClose; closeSheet(o); if (f) f(); }
// Swiping a sheet down puts it away, as the close button does (sheetdrag.js).
wireSheetDrag($('#sheet-root'), () => dismissSheet({ dropped: true }));

// ---------- the route ----------
// #home, #rooms, #room/<id>, #light/<id>, #remotes, #remote/<id>, #routines, #settings, #activity, #scenes. The old
// app's #automations still lands on Routines, so an installed shortcut keeps working.
const ALIAS = { automations: 'routines', '': 'home' };
function route() { return parseRoute(location.hash); }
function parseRoute(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  let parts;
  try { parts = decodeURIComponent(raw).split('/'); } catch (_) { parts = ['home']; }
  const name = ALIAS[parts[0]] ?? parts[0];
  // #light/<id>/white: the id, then the page under it
  return { name, id: parts[1] || null, sub: parts.slice(2).join('/') || null };
}
const SCREENS = {
  home: homeScreen, rooms: roomsScreen, room: roomScreen, light: deviceScreen, scenes: scenesScreen,
  remotes: remotesScreen, remote: remoteScreen, timing: timingScreen,
  routines: routinesScreen, routine: routineScreen, setup: guidedScreen, activity: activityScreen,
  settings: settingsScreen, add: addScreen, nightstand: nightstandScreen,
};
const TAB_OF = { home: 'home', rooms: 'rooms', room: 'rooms', light: 'rooms', scenes: 'rooms', remotes: 'remotes', remote: 'remotes', timing: 'remotes', routines: 'routines', routine: 'routines', setup: 'routines', settings: 'settings', add: 'settings', activity: 'home' };
const TABS = [['home', 'home', 'Home'], ['rooms', 'grid', 'Rooms'], ['remotes', 'remote', 'Remotes'], ['routines', 'clock', 'Routines'], ['settings', 'gear', 'Settings']];
// A screen draws the pages under it that it declares (screen.subs); any other sub page is not built yet.
function screenFor(r) {
  const screen = SCREENS[r.name];
  if (!screen) return soonScreen;
  if (r.sub && !screen.sheetFor && !(screen.subs || []).includes(r.sub) && !(screen.sheets && screen.sheets[r.sub])) return soonScreen;
  return screen;
}
function go(hash) { if (location.hash === '#' + hash) render(); else location.hash = hash; }
// ---------- the back button ----------
// Every entry this app makes carries its place in the app's own history, { n }: 0 is the entry it opened on, and each
// page (or sheet) opened on top adds one. Two rules keep Back to one press per step:
//   a tab never stacks up: the history under a tab's own page is Home and nothing else, so Back from any tab is
//     Home and Back from Home leaves the app. Switching tabs steps back to the bottom first and goes from there.
//   a sheet opened from its page is a step of its own, so closing it (the X, a swipe down, a choice) steps back
//     rather than writing the page over the sheet's entry, which left two of the page and a Back that did nothing.
const place = () => (history.state && typeof history.state.n === 'number' ? history.state.n : 0);
const stamp = extra => history.replaceState({ ...(history.state || {}), n: place(), ...extra }, '', location.href);
let pendingTab = null;
function goTab(tab) {
  const n = place();
  if (n > 0) { pendingTab = tab; history.go(-n); return; }
  if (!landTab(tab)) render();
}
// On the bottom entry: Home is the floor; another tab sits one above it. True when the address changes (its own
// hashchange then draws it), false when the bottom entry already is that tab.
function landTab(tab) {
  const here = location.hash.replace(/^#/, '') || 'home';
  if (here === tab) return false;
  if (tab === 'home' || route().name !== 'home') location.replace('#' + tab);
  else location.hash = tab;
  return true;
}

// ---------- what every screen is handed ----------
const ctx = {
  data, H, DAY, EDIT, REM, RT, S, esc, icon, deviceArt, roomArt, artSrc, kindArt, lampTint,
  openPicker: (n, spec) => openPicker(n, spec), closePicker: () => closePicker(),
  run, gate, save, saveSoon, assume, onLevel, toast, go, openSheet, closeSheet, render: () => render(),
  // whether toasts are on at all, so copy that points at one (Undo from the toast) can leave that out while they are off
  toasts: TOASTS,
  // swap the page's sub route in place (White to Colour on the same sheet): no new step for the back button
  swap: hash => { history.replaceState(history.state, '', '#' + hash); render(); },
  conn: () => data.connState(),
  // whether a route is built here (Goodnight hands off to #nightstand only when it is)
  has: name => !!SCREENS[name],
  ui: { dragging: false },
};

// ---------- the redraw ----------
// A screen is drawn whole from the state. What must survive a redraw is kept by hand: the page's scroll, and the
// sideways scroll of each strip. While a finger is on a control nothing is redrawn at all, so the control is never
// pulled out from under it; the redraw it missed happens when the finger lifts.
let pending = false;
// How the next redraw arrives: 'push', 'back' or 'load' when the page has changed (motion.js), else nothing and
// each element's own transitions carry it from the last redraw.
let arriving = null, wasScreen = false;
function render() {
  if (ctx.ui.dragging) { pending = true; return; }
  pending = false;
  const app = $('#app'), scr = $('#screen'), tabs = $('#tabs');
  native.credentials(S.token);
  if (!S.token) { wasScreen = false; app.className = onboard.onboarded() ? 'plain' : 'plain onboarding'; tabs.hidden = true; onboard.draw(scr); return; }
  if (!S.ready || !S.config) { wasScreen = false; app.className = 'plain'; tabs.hidden = true; scr.innerHTML = onboard.loadingHTML(); return; }
  // the Android app's widget shows the house as Home says it
  native.house(H.litLights().length, Math.round(H.houseLevel()));
  const r = route();
  // the page the app opened on, known once the home has loaded (hashchange compares against it)
  if (lastPage === null) lastPage = pageOf(r);
  const screen = screenFor(r);
  const keep = {};
  scr.querySelectorAll('[data-keep]').forEach(el => { keep[el.dataset.keep] = el.scrollLeft; });
  // the app opening on a screen is a load, like a tab
  const how = arriving || (wasScreen ? null : 'load');
  arriving = null; wasScreen = true;
  const snap = how ? null : motion.snap(scr);
  applyNight();
  scr.innerHTML = screen.view(ctx, r);
  scr.querySelectorAll('[data-keep]').forEach(el => { if (keep[el.dataset.keep] != null) el.scrollLeft = keep[el.dataset.keep]; });
  const st = data.connState();
  // a pushed detail page (a light, a fan, a shade) has no tab bar in the file; everything else does
  app.className = [st === 'off' ? 'offline' : '', screen.noTabs ? 'notabs' : ''].filter(Boolean).join(' ');
  tabs.hidden = !!screen.noTabs;
  const tab = TAB_OF[r.name] || 'home';
  tabs.innerHTML = TABS.map(([t, ic, label]) => `<button data-go="${t}" aria-label="${label}" ${t === tab ? 'aria-current="page"' : ''}>${icon(ic, 24, 1.7)}</button>`).join('');
  if (screen.after) screen.after(ctx, r, scr);
  if (how) motion.arrive(how, scr); else motion.carry(snap, scr);
  motion.settle(scr);
  routedSheet(screen, r);
  // an icon shortcut landing (Goodnight's hold in view), and the one question about the lock screen
  beyond.after(ctx);
}
// ---------- night ----------
// design-v7-ui.md, "A lighting system · 7": from the evening wind-down's start (10 pm without one) until the wake-up
// light starts (6 am without one) the app's own chrome warms and dims (web/ui/v7/night.css); the lamps' colours never
// change. Settings' Night look can make it always or never. `ctx.night` lets a screen hand `night` to glowHTML.
// A test forces it with ?night=1 or 0, or localStorage v7night.
function nightNow() {
  const s = S.config.settings;
  let force = null;
  try { force = new URLSearchParams(location.search).get('night') ?? localStorage.getItem('v7night'); } catch (_) { /* fine */ }
  if (force === '1' || force === '0') return force === '1';
  const look = s.night_look || 'auto';
  if (look !== 'auto') return look === 'always';
  const m = RT.hmMin(RT.nowHm());
  const start = RT.hmMin(RT.windDownOn() ? RT.curveStart() : '22:00');
  // the wake-up light of the morning ahead, if one runs that day
  const day = RT.weekdayOf(m >= 720 ? RT.addDays(RT.today(), 1) : RT.today());
  const wakes = (S.config.schedules || []).filter(x => x.kind === 'wakeup' && x.enabled !== false && x.at && x.at.type === 'time' && (x.days || RT.ALL_DAYS).includes(day)).map(x => RT.hmMin(x.at.time)).filter(t => t < 720);
  const end = wakes.length ? Math.min(...wakes) : 360;
  return start > end ? m >= start || m < end : m >= start && m < end;
}
function applyNight() {
  const root = document.documentElement, first = ctx.night === undefined;
  ctx.night = nightNow();
  root.classList.toggle('night', ctx.night);
  document.body.classList.toggle('nightlook', ctx.night);
  // opening the app at night is not a crossing: the 30 s drift is armed only after the first look is drawn
  if (first) setTimeout(() => root.classList.add('drift'), 120);
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
  ctx.ui.routed = !!(got && got.spec);
  if (!got || !got.spec) { ctx.ui.picker = null; return; }
  const key = location.hash.replace(/^#/, '');
  const close = () => {
    ctx.ui.picker = null;
    if (history.state && history.state.sheet && place() > 0) { history.back(); return; }
    history.replaceState(history.state, '', '#' + got.parent); render();
  };
  const pk = ctx.ui.picker && ctx.ui.picker.key === key ? ctx.ui.picker : null;
  const spec = pk ? { ...pk.spec(ctx, r), back: true } : got.spec;
  const root = openSheet({ ...spec, key: pk ? `${key}#${pk.name}` : key, onClose: close });
  if (spec.after) spec.after(ctx, r, root);
}
// Open a picker inside the current sheet. `spec(ctx, r)` draws it; its taps are the screen's actions as usual.
function openPicker(name, spec) { ctx.ui.picker = { key: location.hash.replace(/^#/, ''), name, spec }; render(); }
function closePicker() { ctx.ui.picker = null; render(); }
let frame = 0;
// A redraw asked for by the socket waits while a page is still arriving; a tap redraws at once.
function soon() {
  if (frame) return;
  const wait = motion.busyFor();
  frame = wait ? setTimeout(() => { frame = 0; render(); }, wait) : requestAnimationFrame(() => { frame = 0; render(); });
}
ctx.soon = soon;
ctx.endDrag = () => { ctx.ui.dragging = false; if (pending) render(); };

// ---------- signing in and loading ----------
// 16 · Onboarding (v7, 12814:49907) and the password: the pages over the drawn house are onboard.js, which draws
// them in place so the house's windows are never lit twice.
async function signIn(pw) {
  const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) throw new Error(res.status === 429 ? 'Too many tries. Wait a few minutes and try again.' : "That's not it. Try again.");
  localStorage.setItem('token', body.token);
  S.token = body.token;
  ctx.ui.justSignedIn = true;
  connect();
  render();
}

// ---------- the socket ----------
// The layer applies each message to the state and says whether anything on screen changed; this redraws when it
// did. The quiet window before the app admits it is offline is the layer's; this books the one redraw that shows it.
let graceTimer = null;
function onConn(conn) {
  if (conn === 'started') { clearTimeout(graceTimer); graceTimer = setTimeout(render, RECONNECT_GRACE + 50); }
  // back from a real outage (not a blip inside the grace), said once
  if (conn === 'cleared') { clearTimeout(graceTimer); ctx.ui.hadBlip = true; if ($('#app').classList.contains('offline')) toast('Back in touch'); }
}
function connect() {
  data.connectWS({
    message: (m, r) => {
      if (m.type === 'snapshot') {
        // once, quietly, as the old app does: bring the five's old slow fades forward
        if (H.shortenSuggestedFades()) save('', { quiet: true });
      }
      if (m.type === 'toast') toast(m.msg, { err: m.level === 'error' });
      if (m.type === 'button' || m.type === 'gesture') onLive(m);
      if (m.type === 'add_state' || m.type === 'add_heard' || m.type === 'add_log') onAdd(m);
      if (r.conn) onConn(r.conn);
      // 20 · Beyond the app: a shortcut runs once the home is loaded; the lock screen hears about every timer
      if (m.type === 'snapshot' || m.type === 'timers') beyond.onTimers(ctx);
      if (m.type === 'snapshot') { beyond.onReady(ctx); if (ctx.ui.justSignedIn) { ctx.ui.justSignedIn = false; toast(onboard.foundLine(ctx)); } }
      if (r.changed || m.type === 'snapshot') soon();
    },
    close: conn => { onConn(conn); if (S.ready) soon(); },
  });
}
data.hooks.signedOut = () => { beyond.signedOut(); render(); };

// ---------- taps ----------
document.addEventListener('click', e => {
  // the tap that ends a press and hold is not a tap as well
  if (Date.now() - heldAt < 700) { e.preventDefault(); return; }
  // the innermost target wins: a tile navigates, the power circle inside it toggles
  const el = e.target.closest('[data-act], [data-go]'); if (!el) return;
  if (!el.dataset.act) { e.preventDefault(); closeSheet(); if (el.closest('#tabs')) goTab(el.dataset.go); else go(el.dataset.go); return; }
  const act = el.dataset.act;
  if (act === 'sheet-close') { dismissSheet(); return; }
  if (act === 'picker-back') { closePicker(); return; }
  if (act === 'toast-undo') { const root = $('#toast-root'); const u = root._undo; root.innerHTML = ''; root._undo = null; if (u) u(); return; }
  if (act === 'back') { if (place() > 0) history.back(); else if (route().name !== 'home') location.replace('#home'); return; }
  if (onboard.act(act)) { render(); return; }
  const r = route();
  const screen = screenFor(r);
  const fn = (screen.actions && screen.actions[act]) || SHARED[act];
  if (fn) fn(ctx, el, r);
});
// A name field in a sheet (a room's, a scene's) saves as it is typed; Done or Enter closes it.
document.addEventListener('input', e => {
  // a field that answers as it is typed (the city search): data-input names the screen's action
  const inp = e.target.closest && e.target.closest('[data-input]');
  if (inp) { const r = route(); const screen = screenFor(r); const fn = screen.actions && screen.actions[inp.dataset.input]; if (fn) fn(ctx, inp, r, inp.value); return; }
  const form = e.target.closest && e.target.closest('form[data-form="name"]'); if (!form) return;
  const r = route(); const screen = screenFor(r);
  const fn = screen.actions && screen.actions[form.dataset.act];
  if (fn) fn(ctx, form, r, e.target.value);
});
// A select, a time field or a checkbox that changes something: data-change names the screen's action, which gets the
// element and its value.
document.addEventListener('change', e => {
  const el = e.target.closest && e.target.closest('[data-change]'); if (!el) return;
  const r = route(); const screen = screenFor(r);
  const fn = screen.actions && screen.actions[el.dataset.change];
  if (fn) fn(ctx, el, r, el.type === 'checkbox' ? el.checked : el.value);
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
  catch (x) { err.textContent = x.message; err.hidden = false; onboard.wrong($('#screen')); }
});
// A new address closes whatever sheet was up; one that only swaps the sheet over the same page (White to Colour)
// keeps the page's scroll.
let lastPage = null, lastName = route().name;
// How deep each page sits: a tab is 0, what a tab opens is 1, a page opened from those is 2. Deeper is a push,
// shallower is back, and one tab to another is a load with its stagger (M4).
const DEPTH = { home: 0, rooms: 0, remotes: 0, routines: 0, room: 1, scenes: 1, remote: 1, routine: 1, setup: 1, activity: 1, settings: 0, nightstand: 1, light: 2, timing: 2, add: 2 };
// The evening wind-down is a page of its own under the Routines tab (#routines/winddown, its sheets
// #routines/winddown-*), so it sits one deeper than the tab even though it shares the tab's route name.
const depthOf = r => (r.name === 'routines' && /^winddown/.test(r.id || '') ? 1 : DEPTH[r.name] ?? 1);
let lastDepth = depthOf(route());
// The page an address shows, under any sheet on it. #settings/name is Settings with the Name sheet up, and
// #routines/winddown-curve is a sheet over a sheet over the wind-down page: opening one is not a new page, so the
// page under it neither scrolls to the top nor slides.
function pageOf(r) {
  for (let i = 0; i < 4 && S.ready && S.config; i++) {
    let got = null;
    try { got = sheetOf(screenFor(r), r); } catch (_) { break; }
    if (!got || !got.spec || !got.parent) break;
    const [n, id, ...rest] = got.parent.split('/');
    r = { name: ALIAS[n] ?? n, id: id || null, sub: rest.join('/') || null };
  }
  return `${r.name}/${r.id}`;
}
// Stepping back to the bottom entry fires hashchange only when its address differs; when it does not, popstate is
// all there is, and the tab switch finishes from here.
window.addEventListener('popstate', () => {
  if (pendingTab && place() === 0) setTimeout(() => { if (pendingTab) { const t = pendingTab; pendingTab = null; if (!landTab(t)) render(); } }, 0);
});
window.addEventListener('hashchange', e => {
  closeSheet();
  // an entry this app has not numbered yet is a new step: one above the page it was opened from, and a sheet if it
  // is a sheet over that same page
  if (!history.state || typeof history.state.n !== 'number') {
    let from = 0; try { from = (JSON.parse(sessionStorage.getItem('navN') || '0')) || 0; } catch (_) { /* fine */ }
    const oldPage = pageOf(parseRoute(new URL(e.oldURL).hash));
    const r0 = route();
    history.replaceState({ n: from + 1, sheet: pageOf(r0) === oldPage && `${r0.name}/${r0.id}${r0.sub ? '/' + r0.sub : ''}` !== oldPage }, '', location.href);
  }
  try { sessionStorage.setItem('navN', String(place())); } catch (_) { /* fine */ }
  // a tab switch that stepped back to the bottom entry now goes to its tab
  if (pendingTab && place() === 0) { const t = pendingTab; pendingTab = null; if (landTab(t)) return; }
  const r = route(); const page = pageOf(r);
  // a page that holds something open while it is shown (the bridge listening) lets go of it when it is left
  if (r.name !== lastName && SCREENS[lastName] && SCREENS[lastName].leave) SCREENS[lastName].leave(ctx);
  if (page !== lastPage && S.ready && S.config) {
    const was = lastDepth, now = depthOf(r);
    // one tab to another slides the way the tab bar reads: a tab to the right comes in from the right
    const order = TABS.map(t => t[0]);
    arriving = !was && !now ? (order.indexOf(r.name) < order.indexOf(lastName) ? 'back' : 'push') : now < was ? 'back' : 'push';
    motion.capture($('#screen'));
  }
  lastName = r.name; lastDepth = depthOf(r);
  if (page !== lastPage) window.scrollTo(0, 0);
  lastPage = page;
  render();
});

// Taps that mean the same on every screen.
const SHARED = {
  // Allow and Not now on the lock screen question, over whichever page it was asked on
  ...beyond.actions,
  // a light's power circle: on to off, off to on, shown at once and confirmed by the bridge
  toggle(c, el) {
    const id = el.dataset.id; const d = data.dev(id); if (!d) return;
    if (d.domain === 'fan') { const on = data.isOn(id); run({ type: 'fan', target: `d:${id}`, speed: on ? 'Off' : 'Medium' }); return; }
    const on = data.isOn(id);
    assume([id], on ? 0 : onLevel(id, `d:${id}`)); soon();
    run({ type: 'level', target: `d:${id}`, level: on ? 'off' : 'on' });
  },
  // a scene chip: Lutron scenes and the app's own run the same way
  scene(c, el) {
    const t = el.dataset.t;
    if (data.connState() === 'off') { toast(OFFLINE_TAP, { icon: 'wifi' }); return; }
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

// ---------- a real remote pressed ----------
// The data layer has written the press down (S.live). A remote the bridge lists without its buttons learns its own
// numbering from the keys; then the screen on show decides what a press means to it (the Remotes list jumps to the
// remote, a remote's page picks the key, Press timing says what it heard). Anything showing a key lit redraws, and
// once more when the light goes out.
let liveTimer = null;
function onLive(m) {
  if (REM.rememberPress(m.device_id, m.button_number)) save('', { quiet: true });
  const r = route(); const screen = screenFor(r);
  if (screen.live) screen.live(ctx, m, r);
  soon();
  clearTimeout(liveTimer); liveTimer = setTimeout(soon, 1300);
}
ctx.live = onLive;

// Adding a device: what the bridge says while it listens, kept where the Add page reads it.
function onAdd(m) {
  S.add = S.add || { active: false, heard: [], log: [] };
  if (m.type === 'add_state') { S.add = { ...S.add, ...(m.state || {}) }; if (m.reason === 'timeout' && route().name === 'add') toast('The bridge stopped listening. Tap Listen when the device is ready.'); }
  if (m.type === 'add_heard') { S.add.heard = m.heard || S.add.heard; if (navigator.vibrate) navigator.vibrate(20); }
  if (m.type === 'add_log') S.add.log = [...(S.add.log || []), m.entry].slice(-60);
  soon();
}

// ---------- start ----------
// The Home greeting and the whole house rely on the home's own time zone; nothing else needs doing before the first
// draw. With a token, dial straight away; without one, the sign-in is the first thing drawn.
if (S.token) connect();
// the entry the app opened on is the bottom of its history
if (!history.state || typeof history.state.n !== 'number') stamp({ n: 0 });
try { sessionStorage.setItem('navN', String(place())); } catch (_) { /* fine */ }
render();
// a slow minute tick keeps anything that says a time (the greeting, "since 9:41 pm") honest
setInterval(() => { if (!ctx.ui.dragging && !document.hidden) soon(); }, 60000);

// the offline shell (web/sw.js), the same worker the classic app registers
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

// for the browser tests and for poking at from the console
window.__copper = ctx;
